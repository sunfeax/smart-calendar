import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, Tag, TagCategory } from '../../../generated/prisma/client.js';
import { CalendarRole, TagColor } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { DESCRIPTION_MAX } from '../events/event.constants.js';
import { assertEventDates, resolveEventTimeZone } from '../events/event-validation.js';
import type { EventCreateDto } from '../events/event.dto.js';
import { MAX_TAG_CATEGORIES_PER_CALENDAR } from '../tag-categories/tag-category.constants.js';
import { MAX_TAGS_PER_CATEGORY, NAME_MAX } from '../tags/tag.constants.js';
import {
  CalendarParseError,
  type ImportProblem,
  type ParsedCalendar,
  type ParsedCalendarEvent,
  type ParsedEventException,
  type ParsedEventTag,
} from './parsers/parsed-calendar.model.js';
import { parseGoogleCalendar } from './parsers/google-calendar.parser.js';
import { fieldProblems } from './parsers/parse-issues.js';
import { IMPORT_MAX_EVENTS, IMPORT_TRANSACTION_TIMEOUT_MS } from './import.constants.js';
import {
  CalendarImportCommitDto,
  CalendarImportDto,
  ImportDraftDto,
  ImportFixDto,
  ImportPreviewDto,
  ImportResultDto,
} from './import.dto.js';
import { parseNotionCsv } from './parsers/notion-csv.parser.js';

const TAG_COLORS = Object.values(TagColor);

interface BrokenEvent {
  externalId: string | null;
  problems: ImportProblem[];
  draft: ImportDraftDto;
  tags: ParsedEventTag[];
  exceptions: ParsedEventException[];
}

interface ImportPlan {
  parsed: ParsedCalendar;
  ready: ParsedCalendarEvent[];
  broken: BrokenEvent[];
  skipped: number;
}

interface ResolvedTag {
  id: string;
  categoryId: string;
  multiple: boolean;
}

interface TagPlan {
  accepted: ParsedEventTag[];
  dropped: number;
}

type CategoryWithTags = TagCategory & { tags: Tag[] };

@Injectable()
export class ImportService {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  // ACTIONS
  async preview(
    userId: string,
    calendarId: string,
    dto: CalendarImportDto,
  ): Promise<ImportPreviewDto> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    const plan = this.plan(dto);
    const imported = await this.findImported(calendarId, plan);
    const ready = plan.ready.filter(event => this.isNew(event, imported));
    const broken = plan.broken
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => this.isNew(item, imported));
    const categories = await this.prisma.tagCategory.findMany({
      where: { calendarId },
      include: { tags: true },
    });
    const { dropped } = this.planTags(
      categories,
      [...ready, ...broken.map(({ item }) => item)].flatMap(event => event.tags),
    );

    return {
      name: plan.parsed.name,
      dateColumns: plan.parsed.dateColumns,
      dateColumn: plan.parsed.dateColumn,
      ready: ready.length,
      skipped: plan.skipped,
      duplicates: plan.ready.length + plan.broken.length - ready.length - broken.length,
      droppedTags: dropped,
      broken: broken.map(({ item: { problems, draft }, index }) => ({
        index,
        problems,
        draft,
      })),
    };
  }

  async commit(
    userId: string,
    calendarId: string,
    dto: CalendarImportCommitDto,
  ): Promise<ImportResultDto> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    const plan = this.plan(dto);
    const indexes = dto.fixes.map(fix => fix.index);

    if (new Set(indexes).size !== indexes.length) {
      throw new BadRequestException('Each broken event can be fixed once');
    }

    const imported = await this.findImported(calendarId, plan);
    const events = [
      ...plan.ready,
      ...dto.fixes.map(fix => this.applyFix(plan.broken, fix)),
    ].filter(event => this.isNew(event, imported));

    if (!events.length) return { created: 0 };

    try {
      await this.save(calendarId, events);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('These events are being imported in another request');
      }
      throw error;
    }

    return { created: events.length };
  }

  private async save(calendarId: string, events: ParsedCalendarEvent[]): Promise<void> {
    await this.prisma.$transaction(
      async tx => {
        const tags = await this.resolveTags(
          tx,
          calendarId,
          events.flatMap(event => event.tags),
        );
        const rows = events.map(event => ({ id: randomUUID(), event }));

        await tx.event.createMany({
          data: rows.map(({ id, event: { data, externalId } }) => ({
            id,
            calendarId,
            title: data.title ?? '',
            description: data.description ?? null,
            icon: data.icon ?? null,
            startAt: new Date(data.startAt),
            endAt: new Date(data.endAt),
            allDay: data.allDay,
            recurrenceRule: data.recurrenceRule ?? null,
            timeZone: data.timeZone ?? null,
            externalId,
          })),
        });

        await tx.eventTag.createMany({
          data: rows.flatMap(({ id, event }) =>
            this.pickTagIds(event.tags, tags).map(tagId => ({ eventId: id, tagId })),
          ),
          skipDuplicates: true,
        });

        await tx.eventException.createMany({
          data: rows.flatMap(({ id, event }) =>
            event.exceptions.map(exception => ({
              eventId: id,
              originalStart: new Date(exception.originalStart),
              cancelled: exception.cancelled,
              ...(exception.overrides && {
                overrides: this.toOverrides(exception.overrides),
              }),
            })),
          ),
        });
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
    );
  }

  private async resolveTags(
    tx: Prisma.TransactionClient,
    calendarId: string,
    tags: ParsedEventTag[],
  ): Promise<Map<string, ResolvedTag>> {
    const categories: CategoryWithTags[] = await tx.tagCategory.findMany({
      where: { calendarId },
      include: { tags: true },
    });
    let categoryOrder = Math.max(-1, ...categories.map(category => category.sortOrder));
    const resolved = new Map<string, ResolvedTag>();

    for (const { category: categoryName, name } of this.planTags(categories, tags)
      .accepted) {
      let category = categories.find(item => item.name === categoryName);
      if (!category) {
        category = await tx.tagCategory.create({
          data: {
            calendarId,
            name: categoryName,
            multiple: true,
            sortOrder: ++categoryOrder,
          },
          include: { tags: true },
        });
        categories.push(category);
      }

      let tag = category.tags.find(item => item.name === name);
      if (!tag) {
        tag = await tx.tag.create({
          data: {
            categoryId: category.id,
            name,
            color: TAG_COLORS[category.tags.length % TAG_COLORS.length],
            sortOrder: Math.max(-1, ...category.tags.map(item => item.sortOrder)) + 1,
          },
        });
        category.tags.push(tag);
      }

      resolved.set(this.tagKey({ category: categoryName, name }), {
        id: tag.id,
        categoryId: category.id,
        multiple: category.multiple,
      });
    }

    return resolved;
  }

  // HELPERS
  private plan(dto: CalendarImportDto): ImportPlan {
    const parsed = this.parse(dto);
    const ready: ParsedCalendarEvent[] = [];
    const broken: BrokenEvent[] = [];

    for (const event of parsed.events) {
      const problems = fieldProblems(event.data);
      if (!problems.length) {
        ready.push(event);
        continue;
      }
      const { data } = event;
      broken.push({
        externalId: event.externalId,
        problems,
        draft: {
          title: data.title ?? '',
          description: data.description ?? null,
          startAt: data.startAt,
          endAt: data.endAt,
          allDay: data.allDay,
          recurrenceRule: data.recurrenceRule ?? null,
          timeZone: data.timeZone ?? null,
          exceptions: event.exceptions.length,
        },
        tags: event.tags,
        exceptions: event.exceptions,
      });
    }

    for (const { problem, draft } of parsed.issues) {
      if (!draft) continue;
      broken.push({
        externalId: draft.externalId,
        problems: [problem],
        draft: {
          title: draft.title,
          description: draft.description,
          startAt: draft.dates?.startAt ?? null,
          endAt: draft.dates?.endAt ?? null,
          allDay: draft.dates?.allDay ?? true,
          recurrenceRule: null,
          timeZone: null,
          exceptions: 0,
        },
        tags: draft.tags,
        exceptions: [],
      });
    }

    if (ready.length + broken.length > IMPORT_MAX_EVENTS) {
      throw this.problemException(
        new CalendarParseError('tooManyEvents', String(IMPORT_MAX_EVENTS)),
      );
    }

    return {
      parsed,
      ready,
      broken,
      skipped: parsed.issues.filter(issue => !issue.draft).length,
    };
  }

  private parse(dto: CalendarImportDto): ParsedCalendar {
    try {
      return dto.source === 'google'
        ? parseGoogleCalendar(dto.content)
        : parseNotionCsv(dto.content, {
            timeZone: dto.timeZone,
            dateColumn: dto.dateColumn,
          });
    } catch (error) {
      if (error instanceof CalendarParseError) throw this.problemException(error);
      throw error;
    }
  }

  private applyFix(
    broken: BrokenEvent[],
    { index, data }: ImportFixDto,
  ): ParsedCalendarEvent {
    const item = broken[index];
    if (!item) throw new BadRequestException('Unknown broken event');

    const description =
      data.description !== undefined ? data.description : item.draft.description;
    if ((description?.length ?? 0) > DESCRIPTION_MAX) {
      throw new BadRequestException(
        `description must be shorter than or equal to ${DESCRIPTION_MAX} characters`,
      );
    }

    const startAt = new Date(data.startAt);
    const recurrenceRule = data.recurrenceRule ?? null;
    const timeZone = resolveEventTimeZone(
      recurrenceRule,
      data.allDay,
      data.timeZone ?? null,
    );

    assertEventDates(startAt, new Date(data.endAt), data.allDay);

    const { draft } = item;
    const sameSeries =
      draft.startAt !== null &&
      +new Date(draft.startAt) === +startAt &&
      draft.allDay === data.allDay &&
      draft.recurrenceRule === recurrenceRule &&
      draft.timeZone === timeZone;

    return {
      sourceId: `fix:${index}`,
      externalId: item.externalId,
      data: { ...data, description, recurrenceRule, timeZone },
      tags: item.tags,
      exceptions: sameSeries ? item.exceptions : [],
    };
  }

  private async findImported(calendarId: string, plan: ImportPlan): Promise<Set<string>> {
    const ids = [...plan.ready, ...plan.broken].flatMap(item =>
      item.externalId ? [item.externalId] : [],
    );
    if (!ids.length) return new Set();

    const events = await this.prisma.event.findMany({
      where: { calendarId, externalId: { in: ids } },
      select: { externalId: true },
    });
    return new Set(events.flatMap(event => (event.externalId ? [event.externalId] : [])));
  }

  private isNew(item: { externalId: string | null }, imported: Set<string>): boolean {
    return !item.externalId || !imported.has(item.externalId);
  }

  private planTags(categories: CategoryWithTags[], tags: ParsedEventTag[]): TagPlan {
    const names = new Map(
      categories.map(category => [
        category.name,
        new Set(category.tags.map(tag => tag.name)),
      ]),
    );
    const accepted = new Map<string, ParsedEventTag>();
    const dropped = new Set<string>();

    for (const tag of tags) {
      const key = this.tagKey(tag);
      if (accepted.has(key) || dropped.has(key)) continue;

      const tagNames = names.get(tag.category);
      const fits =
        tag.category.length <= NAME_MAX &&
        tag.name.length <= NAME_MAX &&
        (tagNames
          ? tagNames.has(tag.name) || tagNames.size < MAX_TAGS_PER_CATEGORY
          : names.size < MAX_TAG_CATEGORIES_PER_CALENDAR);
      if (!fits) {
        dropped.add(key);
        continue;
      }

      names.set(tag.category, (tagNames ?? new Set()).add(tag.name));
      accepted.set(key, tag);
    }

    return { accepted: [...accepted.values()], dropped: dropped.size };
  }

  private pickTagIds(
    tags: ParsedEventTag[],
    resolved: Map<string, ResolvedTag>,
  ): string[] {
    const byCategory = new Map<string, string[]>();

    for (const tag of tags) {
      const match = resolved.get(this.tagKey(tag));
      if (!match) continue;
      const ids = byCategory.get(match.categoryId) ?? [];
      if (!match.multiple && ids.length) continue;
      byCategory.set(match.categoryId, [...ids, match.id]);
    }

    return [...byCategory.values()].flat();
  }

  private tagKey({ category, name }: ParsedEventTag): string {
    return `${category}\u0000${name}`;
  }

  private problemException(error: CalendarParseError): BadRequestException {
    return new BadRequestException({
      statusCode: 400,
      message: error.message,
      ...error.problem,
    });
  }

  private toOverrides(data: EventCreateDto): Prisma.InputJsonObject {
    return {
      title: data.title ?? '',
      description: data.description ?? null,
      startAt: data.startAt,
      endAt: data.endAt,
      allDay: data.allDay,
    };
  }
}
