import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendars/calendar.module.js';
import { MemberController } from './member.controller.js';
import { MemberService } from './member.service.js';

@Module({
  imports: [CalendarModule],
  providers: [MemberService],
  controllers: [MemberController],
})
export class MemberModule {}
