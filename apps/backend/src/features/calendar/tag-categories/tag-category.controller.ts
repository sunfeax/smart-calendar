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
  Put,
} from '@nestjs/common';
import { type User } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import {
  TagCategoryCreateDto,
  TagCategoryDto,
  TagCategoryOrderDto,
  TagCategoryUpdateDto,
} from './tag-category.dto.js';
import { TagCategoryService } from './tag-category.service.js';

@Controller()
export class TagCategoryController {
  // DEPENDENCIES
  constructor(private readonly tagCategoryService: TagCategoryService) {}

  // ACTIONS
  @Get('calendars/:calendarId/tag-categories')
  list(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
  ): Promise<TagCategoryDto[]> {
    return this.tagCategoryService.list(user.id, calendarId);
  }

  @Post('calendars/:calendarId/tag-categories')
  create(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Body() dto: TagCategoryCreateDto,
  ): Promise<TagCategoryDto> {
    return this.tagCategoryService.create(user.id, calendarId, dto);
  }

  @Put('calendars/:calendarId/tag-categories/order')
  reorder(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Body() dto: TagCategoryOrderDto,
  ): Promise<TagCategoryDto[]> {
    return this.tagCategoryService.reorder(user.id, calendarId, dto);
  }

  @Patch('tag-categories/:id')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TagCategoryUpdateDto,
  ): Promise<TagCategoryDto> {
    return this.tagCategoryService.update(user.id, id, dto);
  }

  @Delete('tag-categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tagCategoryService.remove(user.id, id);
  }
}
