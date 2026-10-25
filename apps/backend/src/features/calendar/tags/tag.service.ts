import { Injectable, NotFoundException } from '@nestjs/common';
import { Tag } from '../../../generated/prisma/client.js';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';

@Injectable()
export class TagService {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  // ACTIONS
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
