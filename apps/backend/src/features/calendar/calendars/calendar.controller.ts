import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { User } from '../../../generated/prisma/client.js';
import { CalendarDto, CalendarUpdateDto } from './calendar.dto.js';
import { CalendarService } from './calendar.service.js';

@Controller('calendars')
export class CalendarController {
  // DEPENDENCIES
  constructor(private readonly calendarService: CalendarService) {}

  // ACTIONS
  @Get()
  list(@CurrentUser() user: User): Promise<CalendarDto[]> {
    return this.calendarService.list(user.id);
  }

  @Get(':id')
  get(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CalendarDto> {
    return this.calendarService.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: User): Promise<CalendarDto> {
    return this.calendarService.create(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CalendarUpdateDto,
  ): Promise<CalendarDto> {
    return this.calendarService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.calendarService.remove(user.id, id);
  }
}
