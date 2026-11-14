import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { User } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { TagCreateDto, TagDto, TagOrderDto, TagUpdateDto } from './tag.dto.js';
import { TagService } from './tag.service.js';

@Controller()
export class TagController {
  // DEPENDENCIES
  constructor(private readonly tagService: TagService) {}

  // ACTIONS
  @Post('tag-categories/:categoryId/tags')
  create(
    @CurrentUser() user: User,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: TagCreateDto,
  ): Promise<TagDto> {
    return this.tagService.create(user.id, categoryId, dto);
  }

  @Put('tag-categories/:categoryId/tags/order')
  reorder(
    @CurrentUser() user: User,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: TagOrderDto,
  ): Promise<TagDto[]> {
    return this.tagService.reorder(user.id, categoryId, dto);
  }

  @Patch('tags/:id')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TagUpdateDto,
  ): Promise<TagDto> {
    return this.tagService.update(user.id, id, dto);
  }

  @Delete('tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tagService.remove(user.id, id);
  }
}
