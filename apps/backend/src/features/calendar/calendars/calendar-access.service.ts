import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CalendarMember } from '../../../generated/prisma/client.js';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ROLE_RANK } from './calendar.constants.js';

@Injectable()
export class CalendarAccessService {
  // DEPENDENCIES
  constructor(private readonly prisma: PrismaService) {}

  // ACTIONS
  async assertRole(
    userId: string,
    calendarId: string,
    minRole: CalendarRole,
  ): Promise<CalendarMember> {
    const membership = await this.prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId, userId } },
    });

    if (!membership) throw new NotFoundException();

    if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) throw new ForbiddenException();

    return membership;
  }
}
