import { BadRequestException, Injectable } from '@nestjs/common';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { ONE_DAY_MS } from '../common/constants.js';
import { Event } from '../generated/prisma/client.js';
import { CalendarRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RANGE_MAX_DAYS, RANGE_MAX_ITEMS } from './event.constants.js';
import { EventCreateDto, EventDto, EventsRangeDto } from './event.dto.js';

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
        OR: [{ endAt: { gt: from } }, { endAt: null, startAt: { gte: from } }],
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
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
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

  // async update(userId: string, id: string, dto: EventUpdateDto): Promise<EventDto> {
  //   await this.access.requireRole(userId, id, CalendarRole.EDITOR);

  //   const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
  //   const endAt = dto.endAt ? new Date(dto.endAt) : null;
  //   const allDay = dto.allDay ?? false;

  //   this.assertDates(startAt, endAt, allDay);

  //   // TODO 2: собрать итоговые startAt / endAt / allDay: значение из dto, если оно есть, иначе сохранённое.
  //   //         Внимание: endAt: null в dto означает «очистить», undefined — «оставить как есть».
  //   // TODO 3: assertDates по ИТОГОВЫМ значениям, а не только по dto
  //   //         (перенос сохранённого события на весь день на время, или изменение только startAt за сохранённый endAt, тоже должны падать).
  //   // TODO 4: completed: true -> completedAt = сейчас, но ТОЛЬКО если сохранённое значение null (повторное «true» не должно
  //   //         двигать время); false -> null; undefined -> оставить как есть.
  //   // TODO 5: обновить и вернуть. Календарь события никогда не меняется: не пускать calendarId.
  // }

  // async remove(userId: string, id: string): Promise<void> {
  //   // TODO: requireEventRole(EDITOR), затем удалить. Подсказка: deleteMany по id не падает, если строки уже нет
  //   //       (по той же причине это делает SessionService.delete): повторный DELETE безвреден.
  // }

  private assertDates(startAt: Date, endAt: Date | null, allDay: boolean): void {
    if (endAt && endAt <= startAt) {
      throw new BadRequestException('endAt must be later than startAt');
    }

    if (allDay) {
      const isUtcMidnight = (date: Date) => date.getTime() % ONE_DAY_MS === 0;

      if (!isUtcMidnight(startAt) || (endAt && !isUtcMidnight(endAt))) {
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
      endAt: event.endAt ? event.endAt.toISOString() : null,
      completedAt: event.completedAt ? event.completedAt.toISOString() : null,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}
