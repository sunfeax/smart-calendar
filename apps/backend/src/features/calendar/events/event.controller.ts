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
  Query,
} from '@nestjs/common';
import { type User } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import {
  EventCreateDto,
  EventDto,
  EventScopeDto,
  EventsRangeDto,
  EventsSearchDto,
  EventUpdateDto,
} from './event.dto.js';
import { EventService } from './event.service.js';

@Controller()
export class EventController {
  // DEPENDENCIES
  constructor(private readonly eventService: EventService) {}

  // ACTIONS
  @Get('calendars/:calendarId/events')
  listRange(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Query() range: EventsRangeDto,
  ): Promise<EventDto[]> {
    return this.eventService.listRange(user.id, calendarId, range);
  }

  @Get('calendars/:calendarId/events/archived')
  listArchived(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
  ): Promise<EventDto[]> {
    return this.eventService.listArchived(user.id, calendarId);
  }

  @Get('calendars/:calendarId/events/icons')
  listFrequentIcons(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
  ): Promise<string[]> {
    return this.eventService.listFrequentIcons(user.id, calendarId);
  }

  @Get('calendars/:calendarId/events/search')
  search(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Query() query: EventsSearchDto,
  ): Promise<EventDto[]> {
    return this.eventService.search(user.id, calendarId, query);
  }

  @Post('calendars/:calendarId/events')
  create(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Body() dto: EventCreateDto,
  ): Promise<EventDto> {
    return this.eventService.create(user.id, calendarId, dto);
  }

  @Patch('events/:id')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EventUpdateDto,
    @Query() target: EventScopeDto,
  ): Promise<EventDto> {
    return this.eventService.update(user.id, id, dto, target);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() target: EventScopeDto,
  ): Promise<void> {
    return this.eventService.remove(user.id, id, target);
  }

  @Post('events/:id/restore')
  restore(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() target: EventScopeDto,
  ): Promise<EventDto> {
    return this.eventService.restore(user.id, id, target);
  }

  @Delete('events/:id/archived')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeArchived(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.eventService.removeArchived(user.id, id);
  }

  @Post('events/:id/tags/:tagId')
  addTag(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ): Promise<EventDto> {
    return this.eventService.addTag(user.id, id, tagId);
  }

  @Delete('events/:id/tags/:tagId')
  removeTag(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ): Promise<EventDto> {
    return this.eventService.removeTag(user.id, id, tagId);
  }
}
