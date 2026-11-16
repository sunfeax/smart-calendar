import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common';
import type { AuthReq } from '../auth/auth.model.js';
import {
  EventReminderDto,
  EventReminderUpdateDto,
  PushConfigDto,
  PushEndpointDto,
  PushSubscriptionDto,
} from './notification.dto.js';
import { PushService } from './push.service.js';
import { ReminderService } from './reminder.service.js';

@Controller()
export class NotificationController {
  // DEPENDENCIES
  constructor(
    private readonly pushService: PushService,
    private readonly reminderService: ReminderService,
  ) {}

  // ACTIONS
  @Get('notifications/config')
  config(): PushConfigDto {
    return this.pushService.getConfig();
  }

  @Put('notifications/subscription')
  @HttpCode(HttpStatus.NO_CONTENT)
  subscribe(@Req() request: AuthReq, @Body() dto: PushSubscriptionDto): Promise<void> {
    return this.pushService.subscribe(request.user.id, request.sessionId, dto);
  }

  @Delete('notifications/subscription')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsubscribe(@Req() request: AuthReq, @Body() dto: PushEndpointDto): Promise<void> {
    return this.pushService.unsubscribe(request.sessionId, dto.endpoint);
  }

  @Get('events/:eventId/reminder')
  getReminder(
    @Req() request: AuthReq,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<EventReminderDto> {
    return this.reminderService.get(request.user.id, eventId);
  }

  @Put('events/:eventId/reminder')
  updateReminder(
    @Req() request: AuthReq,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: EventReminderUpdateDto,
  ): Promise<EventReminderDto> {
    return this.reminderService.update(request.user.id, eventId, dto);
  }
}
