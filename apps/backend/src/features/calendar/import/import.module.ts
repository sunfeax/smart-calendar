import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendars/calendar.module.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

@Module({
  imports: [CalendarModule],
  providers: [ImportService],
  controllers: [ImportController],
})
export class ImportModule {}
