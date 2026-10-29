import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ONE_DAY_MS } from '../../../common/constants.js';
import { Event, EventException, Prisma } from '../../../generated/prisma/client.js';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { expandSeries, Occurrence } from './event-recurrence.js';
import { RANGE_MAX_DAYS, RANGE_MAX_ITEMS } from './event.constants.js';
import { EventCreateDto, EventDto, EventsRangeDto, EventUpdateDto } from './event.dto.js';

const EVENT_INCLUDE = { tags: { select: { tagId: true } } } satisfies Prisma.EventInclude;

type EventWithTags = Event & { tags: { tagId: string }[] };

type EventWithExceptions = EventWithTags & { exceptions: EventException[] };

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

    const events = await this.prisma.event.findMany({
      where: {
        calendarId,
        OR: [
          { recurrenceRule: null, startAt: { lt: to }, endAt: { gt: from } },
          { recurrenceRule: { not: null }, startAt: { lt: to } },
        ],
      },
      include: {
        ...EVENT_INCLUDE,
        exceptions: {
          where: {
            cancelled: true,
            originalStart: {
              gte: new Date(from.getTime() - RANGE_MAX_DAYS * ONE_DAY_MS),
              lt: to,
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
    const timeZone = this.resolveTimeZone(recurrenceRule, allDay, dto.timeZone ?? null);

    this.assertDates(startAt, endAt, allDay);

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

  async update(userId: string, id: string, dto: EventUpdateDto): Promise<EventDto> {
    const event = await this.getAuthorizedEvent(userId, id, CalendarRole.EDITOR);

    const startAt = dto.startAt ? new Date(dto.startAt) : event.startAt;
    const endAt = dto.endAt !== undefined ? new Date(dto.endAt) : event.endAt;
    const allDay = dto.allDay ?? event.allDay;
    const recurrenceRule =
      dto.recurrenceRule !== undefined ? dto.recurrenceRule : event.recurrenceRule;
    const timeZone = this.resolveTimeZone(
      recurrenceRule,
      allDay,
      dto.timeZone !== undefined ? dto.timeZone : event.timeZone,
    );

    this.assertDates(startAt, endAt, allDay);

    let completedAt = event.completedAt;

    if (dto.completed === false) {
      completedAt = null;
    } else if (dto.completed && !completedAt) {
      completedAt = new Date();
    }

    const eventUpdated = await this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        icon: dto.icon,
        startAt,
        endAt,
        allDay,
        completedAt,
        recurrenceRule,
        timeZone,
      },
      include: EVENT_INCLUDE,
    });

    return this.toEventDto(eventUpdated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getAuthorizedEvent(userId, id, CalendarRole.EDITOR);
    await this.prisma.event.deleteMany({ where: { id } });
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

  private async getAuthorizedEvent(
    userId: string,
    eventId: string,
    minRole: CalendarRole,
  ): Promise<Event> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
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
  private assertDates(startAt: Date, endAt: Date, allDay: boolean): void {
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be later than startAt');
    }

    if (allDay) {
      const isUtcMidnight = (date: Date) => date.getTime() % ONE_DAY_MS === 0;

      if (!isUtcMidnight(startAt) || !isUtcMidnight(endAt)) {
        throw new BadRequestException(
          'All-day events must start and end at 00:00:00 UTC',
        );
      }
    }
  }

  private resolveTimeZone(
    recurrenceRule: string | null,
    allDay: boolean,
    timeZone: string | null,
  ): string | null {
    if (!recurrenceRule || allDay) return null;

    if (!timeZone) {
      throw new BadRequestException('timeZone is required for timed recurring events');
    }

    return timeZone;
  }

  private toRangeDtos(event: EventWithExceptions, from: Date, to: Date): EventDto[] {
    const { exceptions, ...rest } = event;
    const { recurrenceRule } = event;

    if (!recurrenceRule) return [this.toEventDto(rest)];

    const cancelled = new Set(
      exceptions.map(exception => exception.originalStart.getTime()),
    );

    return expandSeries({ ...event, recurrenceRule }, from, to, RANGE_MAX_ITEMS)
      .filter(occurrence => !cancelled.has(occurrence.startAt.getTime()))
      .map(occurrence => this.toEventDto(rest, occurrence));
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
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}
