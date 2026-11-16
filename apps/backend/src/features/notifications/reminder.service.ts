import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendar/calendars/calendar-access.service.js';
import { EventReminderDto, EventReminderUpdateDto } from './notification.dto.js';

@Injectable()
export class ReminderService {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  // ACTIONS
  async get(userId: string, eventId: string): Promise<EventReminderDto> {
    const event = await this.getEvent(userId, eventId, false);
    const reminder = await this.prisma.eventReminder.findUnique({ where: { eventId } });
    return reminder
      ? {
          enabled: true,
          minutesBefore: reminder.minutesBefore,
          allDayTime: reminder.allDayTime,
          timeZone: reminder.timeZone,
        }
      : {
          enabled: false,
          minutesBefore: 15,
          allDayTime: '09:00',
          timeZone: event.timeZone ?? 'UTC',
        };
  }

  async update(
    userId: string,
    eventId: string,
    dto: EventReminderUpdateDto,
  ): Promise<EventReminderDto> {
    await this.getEvent(userId, eventId, true);
    if (!dto.enabled) {
      await this.prisma.eventReminder.deleteMany({ where: { eventId } });
      return dto;
    }
    const { minutesBefore, allDayTime, timeZone } = dto;
    await this.prisma.$transaction(async tx => {
      const reminder = await tx.eventReminder.upsert({
        where: { eventId },
        create: { eventId, minutesBefore, allDayTime, timeZone },
        update: { minutesBefore, allDayTime, timeZone },
      });
      await tx.reminderDelivery.deleteMany({
        where: { reminderId: reminder.id, sentAt: null },
      });
    });
    return dto;
  }

  // HELPERS
  private async getEvent(userId: string, eventId: string, editable: boolean) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId, archivedAt: null },
      select: { calendarId: true, timeZone: true },
    });
    if (!event) throw new NotFoundException();
    await this.access.assertRole(
      userId,
      event.calendarId,
      editable ? 'EDITOR' : 'VIEWER',
    );
    return event;
  }
}
