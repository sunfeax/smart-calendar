import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ONE_DAY_MS } from '../../../common/constants.js';
import { Event, Prisma } from '../../../generated/prisma/client.js';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { RANGE_MAX_DAYS, RANGE_MAX_ITEMS } from './event.constants.js';
import { EventCreateDto, EventDto, EventsRangeDto, EventUpdateDto } from './event.dto.js';

const EVENT_INCLUDE = { tags: { select: { tagId: true } } } satisfies Prisma.EventInclude;

type EventWithTags = Event & { tags: { tagId: string }[] };

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
        startAt: {
          lt: to,
        },
        endAt: {
          gt: from,
        },
      },
      include: EVENT_INCLUDE,
      orderBy: {
        startAt: 'asc',
      },
      take: RANGE_MAX_ITEMS,
    });

    return events.map(event => this.toEventDto(event));
  }

  async create(
    userId: string,
    calendarId: string,
    dto: EventCreateDto,
  ): Promise<EventDto> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const allDay = dto.allDay ?? false;

    this.assertDates(startAt, endAt, allDay);

    const event = await this.prisma.event.create({
      data: {
        calendarId,
        title: dto.title,
        description: dto.description,
        startAt,
        endAt,
        allDay,
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
        startAt,
        endAt,
        allDay,
        completedAt,
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

  private toEventDto(event: EventWithTags): EventDto {
    const { tags, ...rest } = event;
    return {
      ...rest,
      tagIds: tags.map(tag => tag.tagId),
      startAt: event.startAt.toISOString(),
      endAt: event.endAt.toISOString(),
      completedAt: event.completedAt ? event.completedAt.toISOString() : null,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}
