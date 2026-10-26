import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Tag } from '../../../generated/prisma/client.js';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { TagCategoryService } from '../tag-categories/tag-category.service.js';
import { MAX_TAGS_PER_CATEGORY } from './tag.constants.js';
import { TagCreateDto, TagDto, TagUpdateDto } from './tag.dto.js';

@Injectable()
export class TagService {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
    private readonly tagCategoryService: TagCategoryService,
  ) {}

  // ACTIONS
  async create(userId: string, categoryId: string, dto: TagCreateDto): Promise<TagDto> {
    await this.tagCategoryService.getAuthorizedTagCategory(
      userId,
      categoryId,
      CalendarRole.EDITOR,
    );

    const { _count, _max } = await this.prisma.tag.aggregate({
      where: { categoryId },
      _count: true,
      _max: { sortOrder: true },
    });

    if (_count >= MAX_TAGS_PER_CATEGORY) {
      throw new ForbiddenException('Tag limit reached');
    }

    const sortOrder = (_max.sortOrder ?? -1) + 1;

    const tag = await this.prisma.tag.create({
      data: {
        name: dto.name,
        color: dto.color,
        categoryId,
        sortOrder,
      },
      select: {
        id: true,
        name: true,
        color: true,
      },
    });

    return tag;
  }

  async update(userId: string, tagId: string, dto: TagUpdateDto): Promise<TagDto> {
    const tag = await this.getAuthorizedTag(userId, tagId, CalendarRole.EDITOR);

    const tagUpdated = await this.prisma.tag.update({
      where: { id: tag.id },
      data: { name: dto.name, color: dto.color },
      select: { id: true, name: true, color: true },
    });

    return tagUpdated;
  }

  async remove(userId: string, tagId: string): Promise<void> {
    await this.getAuthorizedTag(userId, tagId, CalendarRole.EDITOR);
    await this.prisma.tag.deleteMany({ where: { id: tagId } });
  }

  private async getAuthorizedTag(
    userId: string,
    tagId: string,
    minRole: CalendarRole,
  ): Promise<Tag> {
    const tag = await this.prisma.tag.findUnique({
      where: { id: tagId },
      include: { category: { select: { calendarId: true } } },
    });

    if (!tag) throw new NotFoundException();

    await this.access.assertRole(userId, tag.category.calendarId, minRole);

    return tag;
  }
}
