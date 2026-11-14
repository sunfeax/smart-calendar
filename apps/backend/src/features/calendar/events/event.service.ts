import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ONE_DAY_MS } from '../../../common/constants.js';
import { Event, EventException, Prisma } from '../../../generated/prisma/client.js';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { fromWallClock, toWallClock } from '../../../common/wall-clock.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { assertEventDates, resolveEventTimeZone } from './event-validation.js';
import {
  countBefore,
  expandSeries,
  isOccurrence,
  moveSeries,
  nextOccurrence,
  Occurrence,
  previousOccurrence,
  ruleEndingBefore,
  ruleStartingAt,
  Series,
} from './event-recurrence.js';
import {
  ARCHIVE_MAX_ITEMS,
  FREQUENT_ICONS_MAX,
  RANGE_MAX_DAYS,
  RANGE_MAX_ITEMS,
  SEARCH_MAX_ITEMS,
} from './event.constants.js';
import {
  EventCreateDto,
  EventDto,
  EventScopeDto,
  EventsRangeDto,
  EventsSearchDto,
  EventUpdateDto,
} from './event.dto.js';

const EVENT_INCLUDE = { tags: { select: { tagId: true } } } satisfies Prisma.EventInclude;
const BOUNDARY_CANCELLATION = { seriesBoundary: true };

type EventWithTags = Event & { tags: { tagId: string }[] };

type EventWithExceptions = EventWithTags & { exceptions: EventException[] };

type SeriesEvent = Event & { recurrenceRule: string };

interface EventOverrides {
  title?: string;
  description?: string | null;
  icon?: string | null;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  completedAt?: string | null;
}

@Injectable()
export class EventService {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  // ACTIONS
  async listRange(
    userId: string,
    calendarId: string,
    query: EventsRangeDto,
  ): Promise<EventDto[]> {
    await this.access.assertRole(userId, calendarId, CalendarRole.VIEWER);

    const from = new Date(query.from);
    const to = new Date(query.to);
    const diff = to.getTime() - from.getTime();

    if (diff <= 0 || diff > RANGE_MAX_DAYS * ONE_DAY_MS) {
      throw new BadRequestException();
    }

    const exceptionWindow = RANGE_MAX_DAYS * ONE_DAY_MS;

    const events = await this.prisma.event.findMany({
      where: {
        calendarId,
        archivedAt: null,
        OR: [
          { recurrenceRule: null, startAt: { lt: to }, endAt: { gt: from } },
          { recurrenceRule: { not: null }, startAt: { lt: to } },
          {
            recurrenceRule: { not: null },
            exceptions: {
              some: {
                cancelled: false,
                originalStart: {
                  gte: new Date(from.getTime() - exceptionWindow),
                  lt: new Date(to.getTime() + exceptionWindow),
                },
              },
            },
          },
        ],
      },
      include: {
        ...EVENT_INCLUDE,
        exceptions: {
          where: {
            originalStart: {
              gte: new Date(from.getTime() - exceptionWindow),
              lt: new Date(to.getTime() + exceptionWindow),
            },
          },
        },
      },
      orderBy: {
        startAt: 'asc',
      },
      take: RANGE_MAX_ITEMS,
    });

    return events
      .flatMap(event => this.toRangeDtos(event, from, to))
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, RANGE_MAX_ITEMS);
  }

  async search(
    userId: string,
    calendarId: string,
    { q }: EventsSearchDto,
  ): Promise<EventDto[]> {
    await this.access.assertRole(userId, calendarId, CalendarRole.VIEWER);

    const contains = { contains: q, mode: 'insensitive' } as const;

    const events = await this.prisma.event.findMany({
      where: {
        calendarId,
        archivedAt: null,
        OR: [
          { title: contains },
          { description: contains },
          { tags: { some: { tag: { name: contains } } } },
        ],
      },
      include: { ...EVENT_INCLUDE, exceptions: true },
      orderBy: { startAt: 'desc' },
      take: SEARCH_MAX_ITEMS,
    });

    const now = new Date();

    return events
      .flatMap(event => this.toSearchDto(event, now))
      .sort((a, b) => b.startAt.localeCompare(a.startAt));
  }

  async create(
    userId: string,
    calendarId: string,
    dto: EventCreateDto,
  ): Promise<EventDto> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const { allDay } = dto;
    const recurrenceRule = dto.recurrenceRule ?? null;
    const timeZone = resolveEventTimeZone(recurrenceRule, allDay, dto.timeZone ?? null);

    assertEventDates(startAt, endAt, allDay);

    const event = await this.prisma.event.create({
      data: {
        calendarId,
        title: dto.title,
        description: dto.description,
        icon: dto.icon,
        startAt,
        endAt,
        allDay,
        recurrenceRule,
        timeZone,
      },
      include: EVENT_INCLUDE,
    });

    return this.toEventDto(event);
  }

  async update(
    userId: string,
    id: string,
    dto: EventUpdateDto,
    target: EventScopeDto,
  ): Promise<EventDto> {
    const event = await this.getAuthorizedEvent(userId, id, CalendarRole.EDITOR);

    if (!this.isSeries(event) || !target.scope) return this.updateEvent(event, dto);

    const originalStart = this.toOriginalStart(event, target.originalStart);

    switch (target.scope) {
      case 'this':
        return this.updateOccurrence(event, originalStart, dto);
      case 'following':
        return countBefore(event, originalStart) === 0
          ? this.updateSeries(event, originalStart, dto)
          : this.splitSeries(event, originalStart, dto);
      case 'all':
        return this.updateSeries(event, originalStart, dto);
    }
  }

  async remove(userId: string, id: string, target: EventScopeDto): Promise<void> {
    const event = await this.getAuthorizedEvent(userId, id, CalendarRole.EDITOR);

    if (!this.isSeries(event) || !target.scope || target.scope === 'all') {
      await this.archive(id);
      return;
    }

    const originalStart = this.toOriginalStart(event, target.originalStart);

    if (target.scope === 'this') {
      await this.prisma.eventException.upsert({
        where: { eventId_originalStart: { eventId: id, originalStart } },
        create: { eventId: id, originalStart, cancelled: true },
        update: { cancelled: true, overrides: Prisma.DbNull },
      });
      return;
    }

    if (countBefore(event, originalStart) === 0) {
      await this.archive(id);
      return;
    }

    await this.prisma.$transaction(async tx => {
      await this.updateUnchanged(tx, event, {
        recurrenceRule: ruleEndingBefore(event, originalStart),
      });
      await tx.eventException.deleteMany({
        where: { eventId: id, originalStart: { gte: originalStart } },
      });
    });
  }

  async listArchived(userId: string, calendarId: string): Promise<EventDto[]> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    const events = await this.prisma.event.findMany({
      where: { calendarId, archivedAt: { not: null } },
      include: EVENT_INCLUDE,
      orderBy: { archivedAt: 'desc' },
      take: ARCHIVE_MAX_ITEMS,
    });

    return events.map(event => this.toEventDto(event));
  }

  async listFrequentIcons(userId: string, calendarId: string): Promise<string[]> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    const icons = await this.prisma.event.groupBy({
      by: ['icon'],
      where: { calendarId, archivedAt: null, icon: { not: null } },
      _count: { icon: true },
      orderBy: [{ _count: { icon: 'desc' } }, { icon: 'asc' }],
      take: FREQUENT_ICONS_MAX,
    });

    return icons.flatMap(({ icon }) => icon ?? []);
  }

  async restore(userId: string, id: string, target: EventScopeDto): Promise<EventDto> {
    if (target.scope === 'this') {
      const event = await this.getAuthorizedEvent(userId, id, CalendarRole.EDITOR);
      if (!this.isSeries(event))
        throw new BadRequestException('The event is not a series');

      const originalStart = this.toOriginalStart(event, target.originalStart);
      await this.prisma.eventException.deleteMany({
        where: { eventId: id, originalStart, cancelled: true },
      });

      return this.toEventDto(await this.findEventWithTags(id));
    }

    await this.getAuthorizedEvent(userId, id, CalendarRole.EDITOR, true);

    const restored = await this.prisma.event.update({
      where: { id },
      data: { archivedAt: null },
      include: EVENT_INCLUDE,
    });

    return this.toEventDto(restored);
  }

  async removeArchived(userId: string, id: string): Promise<void> {
    await this.getAuthorizedEvent(userId, id, CalendarRole.EDITOR, true);
    await this.prisma.event.delete({ where: { id } });
  }

  async addTag(userId: string, id: string, tagId: string): Promise<EventDto> {
    const event = await this.getAuthorizedEvent(userId, id, CalendarRole.EDITOR);

    const tag = await this.prisma.tag.findUnique({
      where: { id: tagId },
      include: {
        category: {
          select: {
            calendarId: true,
            multiple: true,
          },
        },
      },
    });

    if (!tag || tag.category.calendarId !== event.calendarId) {
      throw new NotFoundException('Tag not found');
    }

    await this.prisma.$transaction(async tx => {
      if (!tag.category.multiple) {
        await tx.eventTag.deleteMany({
          where: {
            eventId: id,
            tagId: { not: tagId },
            tag: { categoryId: tag.categoryId },
          },
        });
      }

      await tx.eventTag.createMany({
        data: [{ eventId: id, tagId }],
        skipDuplicates: true,
      });
    });

    return this.toEventDto(await this.findEventWithTags(id));
  }

  async removeTag(userId: string, id: string, tagId: string): Promise<EventDto> {
    await this.getAuthorizedEvent(userId, id, CalendarRole.EDITOR);
    await this.prisma.eventTag.deleteMany({ where: { eventId: id, tagId } });
    return this.toEventDto(await this.findEventWithTags(id));
  }

  private async updateEvent(event: Event, dto: EventUpdateDto): Promise<EventDto> {
    const startAt = dto.startAt ? new Date(dto.startAt) : event.startAt;
    const endAt = dto.endAt !== undefined ? new Date(dto.endAt) : event.endAt;
    const allDay = dto.allDay ?? event.allDay;
    const recurrenceRule =
      dto.recurrenceRule !== undefined ? dto.recurrenceRule : event.recurrenceRule;
    const timeZone = resolveEventTimeZone(
      recurrenceRule,
      allDay,
      dto.timeZone !== undefined ? dto.timeZone : event.timeZone,
    );

    assertEventDates(startAt, endAt, allDay);

    const data = {
      title: dto.title,
      description: dto.description,
      icon: dto.icon,
      startAt,
      endAt,
      allDay,
      completedAt: this.toCompletedAt(dto.completed, event.completedAt),
      recurrenceRule,
      timeZone,
    };

    const [updated] = await this.prisma.$transaction([
      this.prisma.event.update({ where: { id: event.id }, data, include: EVENT_INCLUDE }),
      ...(this.isPatternChanged(event, data)
        ? [this.prisma.eventException.deleteMany({ where: { eventId: event.id } })]
        : []),
    ]);

    return this.toEventDto(updated);
  }

  private async updateOccurrence(
    event: SeriesEvent,
    originalStart: Date,
    dto: EventUpdateDto,
  ): Promise<EventDto> {
    if (dto.recurrenceRule !== undefined || dto.timeZone !== undefined) {
      throw new BadRequestException('The rule can only change for the series');
    }

    const exception = await this.prisma.eventException.findUnique({
      where: { eventId_originalStart: { eventId: event.id, originalStart } },
    });

    const current = {
      ...this.toOccurrenceDto(
        { ...event, tags: [] },
        originalStart,
        this.toOverrides(exception),
      ),
    };

    const overrides: EventOverrides = {
      ...this.toOverrides(exception),
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.icon !== undefined && { icon: dto.icon }),
      ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt).toISOString() }),
      ...(dto.startAt !== undefined &&
        dto.endAt === undefined && {
          endAt: new Date(
            +new Date(dto.startAt) +
              +new Date(current.endAt) -
              +new Date(current.startAt),
          ).toISOString(),
        }),
      ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt).toISOString() }),
      ...(dto.allDay !== undefined && { allDay: dto.allDay }),
      ...(dto.completed !== undefined && {
        completedAt:
          this.toCompletedAt(
            dto.completed,
            current.completedAt ? new Date(current.completedAt) : null,
          )?.toISOString() ?? null,
      }),
    };

    assertEventDates(
      new Date(overrides.startAt ?? current.startAt),
      new Date(overrides.endAt ?? current.endAt),
      overrides.allDay ?? current.allDay,
    );

    await this.prisma.eventException.upsert({
      where: { eventId_originalStart: { eventId: event.id, originalStart } },
      create: { eventId: event.id, originalStart, overrides: { ...overrides } },
      update: { cancelled: false, overrides: { ...overrides } },
    });

    return this.toOccurrenceDto(
      await this.findEventWithTags(event.id),
      originalStart,
      overrides,
    );
  }

  private async updateSeries(
    event: SeriesEvent,
    originalStart: Date,
    dto: EventUpdateDto,
  ): Promise<EventDto> {
    const allDay = dto.allDay ?? event.allDay;
    let recurrenceRule =
      dto.recurrenceRule !== undefined ? dto.recurrenceRule : event.recurrenceRule;
    const timeZone = resolveEventTimeZone(
      recurrenceRule,
      allDay,
      dto.timeZone !== undefined ? dto.timeZone : event.timeZone,
    );
    const selectedStart = dto.startAt ? new Date(dto.startAt) : originalStart;
    const duration = dto.endAt
      ? +new Date(dto.endAt) - +selectedStart
      : +event.endAt - +event.startAt;
    const wallShift =
      +toWallClock(selectedStart, timeZone) - +toWallClock(originalStart, event.timeZone);
    let startAt = dto.startAt
      ? fromWallClock(
          new Date(+toWallClock(event.startAt, event.timeZone) + wallShift),
          timeZone,
        )
      : event.startAt;
    let endAt = new Date(+startAt + duration);
    const boundaryStarts = await this.boundaryCancellations(event.id);
    let cancelledStarts = boundaryStarts.map(date =>
      fromWallClock(new Date(+toWallClock(date, event.timeZone) + wallShift), timeZone),
    );
    if (dto.startAt && dto.recurrenceRule === undefined) {
      const moved = moveSeries(
        event,
        originalStart,
        selectedStart,
        duration,
        timeZone,
        boundaryStarts,
      );
      ({ startAt, endAt, recurrenceRule, cancelledStarts } = moved);
    }

    assertEventDates(startAt, endAt, allDay);

    const responseStart = recurrenceRule
      ? this.responseStart(
          { startAt, endAt, recurrenceRule, timeZone },
          selectedStart,
          cancelledStarts,
        )
      : null;

    const data = {
      title: dto.title,
      description: dto.description,
      icon: dto.icon,
      startAt,
      endAt,
      allDay,
      completedAt: this.toCompletedAt(dto.completed, event.completedAt),
      recurrenceRule,
      timeZone,
    };
    const patternChanged = this.isPatternChanged(event, data);

    const updated = await this.prisma.$transaction(async tx => {
      await this.updateUnchanged(tx, event, data);
      if (patternChanged) {
        await tx.eventException.deleteMany({ where: { eventId: event.id } });
        if (cancelledStarts.length)
          await tx.eventException.createMany({
            data: cancelledStarts.map(originalStart => ({
              eventId: event.id,
              originalStart,
              cancelled: true,
              overrides: BOUNDARY_CANCELLATION,
            })),
          });
      }
      return tx.event.findUniqueOrThrow({
        where: { id: event.id },
        include: EVENT_INCLUDE,
      });
    });

    if (!recurrenceRule) return this.toEventDto(updated);

    const nextOriginalStart = responseStart!;
    const exception = patternChanged
      ? null
      : await this.prisma.eventException.findUnique({
          where: {
            eventId_originalStart: {
              eventId: event.id,
              originalStart: nextOriginalStart,
            },
          },
        });

    return this.toOccurrenceDto(updated, nextOriginalStart, this.toOverrides(exception));
  }

  private async splitSeries(
    event: SeriesEvent,
    originalStart: Date,
    dto: EventUpdateDto,
  ): Promise<EventDto> {
    const duration = event.endAt.getTime() - event.startAt.getTime();
    let startAt = dto.startAt ? new Date(dto.startAt) : originalStart;
    let endAt = dto.endAt ? new Date(dto.endAt) : new Date(startAt.getTime() + duration);
    const allDay = dto.allDay ?? event.allDay;
    let recurrenceRule =
      dto.recurrenceRule !== undefined
        ? dto.recurrenceRule
        : ruleStartingAt(event, originalStart);
    const timeZone = resolveEventTimeZone(
      recurrenceRule,
      allDay,
      dto.timeZone !== undefined ? dto.timeZone : event.timeZone,
    );

    const boundaryStarts = await this.boundaryCancellations(event.id, originalStart);
    const wallShift =
      +toWallClock(startAt, timeZone) - +toWallClock(originalStart, event.timeZone);
    let cancelledStarts = boundaryStarts.map(date =>
      fromWallClock(new Date(+toWallClock(date, event.timeZone) + wallShift), timeZone),
    );
    if (dto.recurrenceRule === undefined) {
      const moved = moveSeries(
        {
          ...event,
          startAt: originalStart,
          endAt: new Date(+originalStart + duration),
          recurrenceRule: ruleStartingAt(event, originalStart),
        },
        originalStart,
        startAt,
        +endAt - +startAt,
        timeZone,
        boundaryStarts,
      );
      ({ startAt, endAt, recurrenceRule, cancelledStarts } = moved);
    }

    assertEventDates(startAt, endAt, allDay);

    const responseStart = recurrenceRule
      ? this.responseStart(
          { startAt, endAt, recurrenceRule, timeZone },
          dto.startAt ? new Date(dto.startAt) : originalStart,
          cancelledStarts,
        )
      : null;

    const tags = await this.prisma.eventTag.findMany({
      where: { eventId: event.id },
      select: { tagId: true },
    });

    const created = await this.prisma.$transaction(async tx => {
      await this.updateUnchanged(tx, event, {
        recurrenceRule: ruleEndingBefore(event, originalStart),
      });
      await tx.eventException.deleteMany({
        where: { eventId: event.id, originalStart: { gte: originalStart } },
      });

      return tx.event.create({
        data: {
          calendarId: event.calendarId,
          title: dto.title ?? event.title,
          description:
            dto.description !== undefined ? dto.description : event.description,
          icon: dto.icon !== undefined ? dto.icon : event.icon,
          startAt,
          endAt,
          allDay,
          completedAt: this.toCompletedAt(dto.completed, event.completedAt),
          recurrenceRule,
          timeZone,
          tags: { createMany: { data: tags } },
          exceptions: {
            createMany: {
              data: cancelledStarts.map(originalStart => ({
                originalStart,
                cancelled: true,
                overrides: BOUNDARY_CANCELLATION,
              })),
            },
          },
        },
        include: EVENT_INCLUDE,
      });
    });

    return recurrenceRule
      ? this.toOccurrenceDto(created, responseStart!, null)
      : this.toEventDto(created);
  }

  private async archive(id: string): Promise<void> {
    await this.prisma.event.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  private async getAuthorizedEvent(
    userId: string,
    eventId: string,
    minRole: CalendarRole,
    archived = false,
  ): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, archivedAt: archived ? { not: null } : null },
    });

    if (!event) throw new NotFoundException();

    await this.access.assertRole(userId, event.calendarId, minRole);

    return event;
  }

  private findEventWithTags(id: string): Promise<EventWithTags> {
    return this.prisma.event.findUniqueOrThrow({
      where: { id },
      include: EVENT_INCLUDE,
    });
  }

  // HELPERS
  private isSeries(event: Event): event is SeriesEvent {
    return event.recurrenceRule !== null;
  }

  private toOriginalStart(series: Series, value: string | undefined): Date {
    if (!value) throw new BadRequestException('originalStart is required for a scope');

    const originalStart = new Date(value);

    if (!isOccurrence(series, originalStart)) {
      throw new BadRequestException('originalStart is not an occurrence of the series');
    }

    return originalStart;
  }

  private async updateUnchanged(
    tx: Prisma.TransactionClient,
    event: Event,
    data: Prisma.EventUpdateManyMutationInput,
  ): Promise<void> {
    const result = await tx.event.updateMany({
      where: {
        id: event.id,
        updatedAt: event.updatedAt,
        recurrenceRule: event.recurrenceRule,
        startAt: event.startAt,
      },
      data,
    });
    if (!result.count)
      throw new ConflictException('The event has changed; reload it before retrying');
  }

  private async boundaryCancellations(eventId: string, from?: Date): Promise<Date[]> {
    const exceptions = await this.prisma.eventException.findMany({
      where: {
        eventId,
        cancelled: true,
        overrides: { path: ['seriesBoundary'], equals: true },
        ...(from && { originalStart: { gte: from } }),
      },
    });
    return exceptions.map(exception => exception.originalStart);
  }

  private responseStart(
    series: Series,
    selectedStart: Date,
    cancelledStarts: Date[],
  ): Date {
    const cancelled = new Set(cancelledStarts.map(Number));
    let next =
      nextOccurrence(series, selectedStart) ?? nextOccurrence(series, series.startAt);
    while (next && cancelled.has(+next))
      next = nextOccurrence(series, new Date(+next + 1));
    if (!next) throw new BadRequestException('The recurrence rule has no occurrences');
    return next;
  }

  private isPatternChanged(
    event: Event,
    next: Pick<Event, 'startAt' | 'allDay' | 'recurrenceRule' | 'timeZone'>,
  ): boolean {
    return (
      next.startAt.getTime() !== event.startAt.getTime() ||
      next.allDay !== event.allDay ||
      next.recurrenceRule !== event.recurrenceRule ||
      next.timeZone !== event.timeZone
    );
  }

  private toCompletedAt(
    completed: boolean | undefined,
    current: Date | null,
  ): Date | null {
    if (completed === false) return null;
    if (completed && !current) return new Date();
    return current;
  }

  private toOverrides(exception: EventException | null): EventOverrides | null {
    return exception && !exception.cancelled && exception.overrides
      ? (exception.overrides as EventOverrides)
      : null;
  }

  private toRangeDtos(event: EventWithExceptions, from: Date, to: Date): EventDto[] {
    const { exceptions, ...rest } = event;
    const { recurrenceRule } = event;

    if (!recurrenceRule) return [this.toEventDto(rest)];

    const byStart = new Map(
      exceptions.map(exception => [exception.originalStart.getTime(), exception]),
    );
    const expanded = expandSeries(
      { ...event, recurrenceRule },
      from,
      to,
      RANGE_MAX_ITEMS,
    );
    const expandedStarts = new Set(expanded.map(item => item.startAt.getTime()));

    const regular = expanded
      .filter(item => !byStart.get(item.startAt.getTime())?.cancelled)
      .map(item =>
        this.toOccurrenceDto(
          rest,
          item.startAt,
          this.toOverrides(byStart.get(item.startAt.getTime()) ?? null),
        ),
      );

    const movedIn = exceptions
      .filter(
        exception =>
          !expandedStarts.has(exception.originalStart.getTime()) &&
          this.toOverrides(exception),
      )
      .map(exception =>
        this.toOccurrenceDto(rest, exception.originalStart, this.toOverrides(exception)),
      );

    return [...regular, ...movedIn].filter(
      dto => new Date(dto.startAt) < to && new Date(dto.endAt) > from,
    );
  }

  private toSearchDto(event: EventWithExceptions, now: Date): EventDto[] {
    const { exceptions, ...rest } = event;
    const { recurrenceRule } = event;

    if (!recurrenceRule) return [this.toEventDto(rest)];

    const series = { ...event, recurrenceRule };
    const byStart = new Map(
      exceptions.map(exception => [exception.originalStart.getTime(), exception]),
    );
    const isCancelled = (date: Date) => byStart.get(date.getTime())?.cancelled;

    let start = nextOccurrence(series, now);
    while (start && isCancelled(start))
      start = nextOccurrence(series, new Date(+start + 1));

    if (!start) {
      start = previousOccurrence(series, now);
      while (start && isCancelled(start))
        start = previousOccurrence(series, new Date(+start - 1));
    }

    if (!start) return [];

    return [
      this.toOccurrenceDto(rest, start, this.toOverrides(byStart.get(+start) ?? null)),
    ];
  }

  private toOccurrenceDto(
    event: EventWithTags,
    originalStart: Date,
    overrides: EventOverrides | null,
  ): EventDto {
    const duration = event.endAt.getTime() - event.startAt.getTime();
    const occurrence: Occurrence = {
      startAt: originalStart,
      endAt: new Date(originalStart.getTime() + duration),
    };

    return { ...this.toEventDto(event, occurrence), ...overrides };
  }

  private toEventDto(event: EventWithTags, occurrence?: Occurrence): EventDto {
    const { tags, ...rest } = event;
    const startAt = occurrence?.startAt ?? event.startAt;
    const endAt = occurrence?.endAt ?? event.endAt;
    return {
      ...rest,
      tagIds: tags.map(tag => tag.tagId),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      originalStart: occurrence ? occurrence.startAt.toISOString() : null,
      completedAt: event.completedAt ? event.completedAt.toISOString() : null,
      archivedAt: event.archivedAt ? event.archivedAt.toISOString() : null,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}
