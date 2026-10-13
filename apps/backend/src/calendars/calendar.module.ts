import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service.js';

@Module({
  imports: [],
  providers: [CalendarService],
})
export class CalendarModule {}
