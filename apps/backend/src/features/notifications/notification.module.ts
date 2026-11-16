import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendars/calendar.module.js';
import { NotificationController } from './notification.controller.js';
import { PushService } from './push.service.js';
import { ReminderSchedulerService } from './reminder-scheduler.service.js';
import { ReminderService } from './reminder.service.js';

@Module({
  imports: [CalendarModule],
  providers: [PushService, ReminderService, ReminderSchedulerService],
  controllers: [NotificationController],
})
export class NotificationModule {}
