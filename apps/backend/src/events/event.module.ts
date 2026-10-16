import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendars/calendar.module.js';
import { EventController } from './event.controller.js';
import { EventService } from './event.service.js';

@Module({
  imports: [CalendarModule],
  providers: [EventService],
  controllers: [EventController],
})
export class EventModule {}
