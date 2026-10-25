import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendars/calendar.module.js';
import { TagController } from './tag.controller.js';
import { TagService } from './tag.service.js';

@Module({
  imports: [CalendarModule],
  providers: [TagService],
  controllers: [TagController],
})
export class TagModule {}
