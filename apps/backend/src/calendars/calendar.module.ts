import { Module } from '@nestjs/common';
import { CalendarAccessService } from './calendar-access.service.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';

@Module({
  imports: [],
  providers: [CalendarAccessService, CalendarService],
  controllers: [CalendarController],
})
export class CalendarModule {}
