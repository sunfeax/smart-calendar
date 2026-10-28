import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { type User } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { CalendarDto } from '../calendars/calendar.dto.js';
import {
  InviteAcceptDto,
  InviteCreatedDto,
  InviteCreateDto,
  InviteDto,
} from './invite.dto.js';
import { InviteService } from './invite.service.js';

@Controller()
export class InviteController {
  // DEPENDENCIES
  constructor(private readonly inviteService: InviteService) {}

  // ACTIONS
  @Get('calendars/:calendarId/invites')
  list(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
  ): Promise<InviteDto[]> {
    return this.inviteService.list(user.id, calendarId);
  }

  @Post('calendars/:calendarId/invites')
  create(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Body() dto: InviteCreateDto,
  ): Promise<InviteCreatedDto> {
    return this.inviteService.create(user.id, calendarId, dto);
  }

  @Post('invites/accept')
  accept(@CurrentUser() user: User, @Body() dto: InviteAcceptDto): Promise<CalendarDto> {
    return this.inviteService.accept(user.id, dto.token);
  }

  @Delete('invites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.inviteService.revoke(user.id, id);
  }
}
