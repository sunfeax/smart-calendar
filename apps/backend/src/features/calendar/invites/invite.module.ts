import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendars/calendar.module.js';
import { InviteController } from './invite.controller.js';
import { InviteService } from './invite.service.js';

@Module({
  imports: [CalendarModule],
  providers: [InviteService],
  controllers: [InviteController],
})
export class InviteModule {}
