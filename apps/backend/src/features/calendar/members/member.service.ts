import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { MAX_CALENDAR_MEMBERS } from '../calendars/calendar.constants.js';
import { MemberDto } from './member.dto.js';

@Injectable()
export class MemberService {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  // ACTIONS
  async list(userId: string, calendarId: string): Promise<MemberDto[]> {
    await this.access.assertRole(userId, calendarId, CalendarRole.VIEWER);

    const members = await this.prisma.calendarMember.findMany({
      where: { calendarId },
      include: { user: { select: { name: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
      take: MAX_CALENDAR_MEMBERS,
    });

    return members.map(member => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
    }));
  }

  async remove(userId: string, calendarId: string, targetUserId: string): Promise<void> {
    const actor = await this.access.assertRole(userId, calendarId, CalendarRole.VIEWER);

    if (targetUserId === userId) {
      if (actor.role === CalendarRole.OWNER) {
        throw new ForbiddenException('Owner cannot leave the calendar');
      }
    } else {
      if (actor.role === CalendarRole.VIEWER) throw new ForbiddenException();

      const target = await this.prisma.calendarMember.findUnique({
        where: { calendarId_userId: { calendarId, userId: targetUserId } },
      });

      if (!target) throw new NotFoundException();
      if (target.role === CalendarRole.OWNER) throw new ForbiddenException();
    }

    await this.prisma.calendarMember.deleteMany({
      where: { calendarId, userId: targetUserId },
    });
  }
}
