import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, Tag, TagCategory } from '../../../generated/prisma/client.js';
import { CalendarRole, TagColor } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
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

    const { parsed, ready, broken, skipped } = this.plan(dto);

    return {
      name: parsed.name,
      columns: parsed.columns ?? undefined,
      ready: ready.length,
      skipped,
      broken: broken.map(({ problems, draft }, index) => ({ index, problems, draft })),
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

    const events = [
      ...plan.ready,
      ...dto.fixes.map(fix => this.applyFix(plan.broken, fix)),
    ];

    if (!events.length) return { created: 0 };

    await this.prisma.$transaction(
      async tx => {
        const tags = await this.resolveTags(
          tx,
          calendarId,
          events.flatMap(event => event.tags),
        );
        const rows = events.map(event => ({ id: randomUUID(), event }));

        await tx.event.createMany({
          data: rows.map(({ id, event: { data } }) => ({
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

    return { created: events.length };
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

    for (const { category: categoryName, name } of tags) {
      const key = this.tagKey({ category: categoryName, name });
      if (resolved.has(key) || categoryName.length > NAME_MAX || name.length > NAME_MAX) {
        continue;
      }

      let category = categories.find(item => item.name === categoryName);
      if (!category) {
        if (categories.length >= MAX_TAG_CATEGORIES_PER_CALENDAR) continue;
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
        if (category.tags.length >= MAX_TAGS_PER_CATEGORY) continue;
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

      resolved.set(key, {
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
        problems,
        draft: {
          title: data.title ?? '',
          description: data.description ?? null,
          startAt: data.startAt,
          endAt: data.endAt,
          allDay: data.allDay,
          recurrenceRule: data.recurrenceRule ?? null,
          timeZone: data.timeZone ?? null,
        },
        tags: event.tags,
        exceptions: event.exceptions,
      });
    }

    for (const { problem, draft } of parsed.issues) {
      if (!draft) continue;
      broken.push({
        problems: [problem],
        draft: {
          title: draft.title,
          description: draft.description,
          startAt: null,
          endAt: null,
          allDay: true,
          recurrenceRule: null,
          timeZone: null,
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
            titleColumn: dto.titleColumn,
            dateColumn: dto.dateColumn,
            tagColumns: dto.tagColumns,
            timeZone: dto.timeZone,
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
      data: { ...data, recurrenceRule, timeZone },
      tags: item.tags,
      exceptions: sameSeries ? item.exceptions : [],
    };
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
