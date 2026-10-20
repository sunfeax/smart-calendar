import { BadRequestException, Injectable } from '@nestjs/common';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { ONE_DAY_MS } from '../common/constants.js';
import { Event } from '../generated/prisma/client.js';
import { CalendarRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RANGE_MAX_DAYS, RANGE_MAX_ITEMS } from './event.constants.js';
import { EventCreateDto, EventDto, EventsRangeDto, EventUpdateDto } from './event.dto.js';

@Injectable()
export class EventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  async listRange(
    userId: string,
    calendarId: string,
    query: EventsRangeDto,
  ): Promise<EventDto[]> {
    await this.access.requireRole(userId, calendarId, CalendarRole.VIEWER);

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
      orderBy: {
        startAt: 'asc',
      },
      take: RANGE_MAX_ITEMS,
    });

    return events.map(event => this.toDto(event));
  }

  async create(
    userId: string,
    calendarId: string,
    dto: EventCreateDto,
  ): Promise<EventDto> {
    await this.access.requireRole(userId, calendarId, CalendarRole.EDITOR);

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
    });

    return this.toDto(event);
  }

  async update(userId: string, id: string, dto: EventUpdateDto): Promise<EventDto> {
    const event = await this.access.requireEventRole(userId, id, CalendarRole.EDITOR);

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
    });

    return this.toDto(eventUpdated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.access.requireEventRole(userId, id, CalendarRole.EDITOR);
    await this.prisma.event.deleteMany({ where: { id } });
  }

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

  private toDto(event: Event): EventDto {
    return {
      ...event,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt.toISOString(),
      completedAt: event.completedAt ? event.completedAt.toISOString() : null,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}
