import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendars/calendar.module.js';
import { TagCategoryController } from './tag-category.controller.js';
import { TagCategoryService } from './tag-category.service.js';

@Module({
  imports: [CalendarModule],
  providers: [TagCategoryService],
  controllers: [TagCategoryController],
  exports: [TagCategoryService],
})
export class TagCategoryModule {}
