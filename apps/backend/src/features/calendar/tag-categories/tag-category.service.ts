import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TagCategory } from '../../../generated/prisma/client.js';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { assertCompleteOrder } from '../../../common/order.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { MAX_TAGS_PER_CATEGORY } from '../tags/tag.constants.js';
import { MAX_TAG_CATEGORIES_PER_CALENDAR } from './tag-category.constants.js';
import {
  TagCategoryCreateDto,
  TagCategoryDto,
  TagCategoryOrderDto,
  TagCategoryUpdateDto,
} from './tag-category.dto.js';

const CATEGORY_SELECT = {
  id: true,
  name: true,
  multiple: true,
  tags: {
    select: { id: true, name: true, color: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: MAX_TAGS_PER_CATEGORY,
  },
} satisfies Prisma.TagCategorySelect;

@Injectable()
export class TagCategoryService {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  // ACTIONS
  async list(userId: string, calendarId: string): Promise<TagCategoryDto[]> {
    await this.access.assertRole(userId, calendarId, CalendarRole.VIEWER);
    return this.findCategories(calendarId);
  }

  async create(
    userId: string,
    calendarId: string,
    dto: TagCategoryCreateDto,
  ): Promise<TagCategoryDto> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    const { _count, _max } = await this.prisma.tagCategory.aggregate({
      where: { calendarId },
      _count: true,
      _max: { sortOrder: true },
    });

    if (_count >= MAX_TAG_CATEGORIES_PER_CALENDAR) {
      throw new ForbiddenException('Tag category limit reached');
    }

    const sortOrder = (_max.sortOrder ?? -1) + 1;

    const category = await this.prisma.tagCategory.create({
      data: {
        calendarId,
        name: dto.name,
        multiple: dto.multiple,
        sortOrder,
      },
      select: CATEGORY_SELECT,
    });

    return category;
  }

  async update(
    userId: string,
    id: string,
    dto: TagCategoryUpdateDto,
  ): Promise<TagCategoryDto> {
    const category = await this.getAuthorizedTagCategory(userId, id, CalendarRole.EDITOR);

    if (dto.multiple === false && category.multiple) {
      const conflicts = await this.prisma.eventTag.groupBy({
        where: { tag: { categoryId: id } },
        by: ['eventId'],
        having: { eventId: { _count: { gt: 1 } } },
        orderBy: { eventId: 'asc' },
        take: 1,
      });

      if (conflicts.length > 0) {
        throw new ConflictException('Some events have several tags of this category');
      }
    }

    const categoryUpdated = await this.prisma.tagCategory.update({
      where: { id },
      data: {
        name: dto.name,
        multiple: dto.multiple,
      },
      select: CATEGORY_SELECT,
    });

    return categoryUpdated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getAuthorizedTagCategory(userId, id, CalendarRole.EDITOR);
    await this.prisma.tagCategory.deleteMany({ where: { id } });
  }

  async reorder(
    userId: string,
    calendarId: string,
    dto: TagCategoryOrderDto,
  ): Promise<TagCategoryDto[]> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    const categories = await this.prisma.tagCategory.findMany({
      where: { calendarId },
      select: { id: true },
      take: MAX_TAG_CATEGORIES_PER_CALENDAR + 1,
    });
    assertCompleteOrder(
      categories.map(category => category.id),
      dto.ids,
    );

    await this.prisma.$transaction(
      dto.ids.map((id, sortOrder) =>
        this.prisma.tagCategory.update({
          where: { id },
          data: { sortOrder },
          select: { id: true },
        }),
      ),
    );

    return this.findCategories(calendarId);
  }

  async getAuthorizedTagCategory(
    userId: string,
    categoryId: string,
    minRole: CalendarRole,
  ): Promise<TagCategory> {
    const category = await this.prisma.tagCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) throw new NotFoundException();

    await this.access.assertRole(userId, category.calendarId, minRole);

    return category;
  }

  // HELPERS
  private findCategories(calendarId: string): Promise<TagCategoryDto[]> {
    return this.prisma.tagCategory.findMany({
      where: { calendarId },
      select: CATEGORY_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: MAX_TAG_CATEGORIES_PER_CALENDAR,
    });
  }
}
