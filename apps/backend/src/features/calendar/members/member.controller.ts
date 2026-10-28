import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { type User } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { MemberDto } from './member.dto.js';
import { MemberService } from './member.service.js';

@Controller('calendars/:calendarId/members')
export class MemberController {
  // DEPENDENCIES
  constructor(private readonly memberService: MemberService) {}

  // ACTIONS
  @Get()
  list(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
  ): Promise<MemberDto[]> {
    return this.memberService.list(user.id, calendarId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.memberService.remove(user.id, calendarId, userId);
  }
}
