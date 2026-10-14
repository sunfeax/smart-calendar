import { Module } from '@nestjs/common';
import { CalendarAccessService } from './calendar-access.service.js';
import { CalendarService } from './calendar.service.js';

@Module({
  imports: [],
  providers: [CalendarAccessService, CalendarService],
})
export class CalendarModule {}
