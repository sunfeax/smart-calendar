import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CalendarInvite } from '../../../generated/prisma/client.js';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { generateToken, hashToken } from '../../session/session-token.js';
import { CalendarAccessService } from '../calendars/calendar-access.service.js';
import { MAX_CALENDAR_MEMBERS } from '../calendars/calendar.constants.js';
import { CalendarDto } from '../calendars/calendar.dto.js';
import {
  INVITE_TTL_MS,
  MAX_ACTIVE_INVITES,
  MAX_INVITES_LIST,
} from './invite.constants.js';
import { InviteCreatedDto, InviteCreateDto, InviteDto } from './invite.dto.js';

@Injectable()
export class InviteService {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  // ACTIONS
  async list(userId: string, calendarId: string): Promise<InviteDto[]> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    const invites = await this.prisma.calendarInvite.findMany({
      where: { calendarId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: MAX_INVITES_LIST,
    });

    return invites.map(invite => this.toInviteDto(invite));
  }

  async create(
    userId: string,
    calendarId: string,
    dto: InviteCreateDto,
  ): Promise<InviteCreatedDto> {
    await this.access.assertRole(userId, calendarId, CalendarRole.EDITOR);

    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM "Calendar" WHERE "id" = ${calendarId} FOR UPDATE`;

      const activeCount = await tx.calendarInvite.count({
        where: { calendarId, usedAt: null, expiresAt: { gt: new Date() } },
      });

      if (activeCount >= MAX_ACTIVE_INVITES) {
        throw new ConflictException('Active invite limit reached');
      }

      const token = generateToken();
      const invite = await tx.calendarInvite.create({
        data: {
          calendarId,
          tokenHash: hashToken(token),
          role: dto.role,
          createdById: userId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      });

      return { ...this.toInviteDto(invite), token };
    });
  }

  async revoke(userId: string, id: string): Promise<void> {
    const invite = await this.prisma.calendarInvite.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException();

    const actor = await this.access.assertRole(
      userId,
      invite.calendarId,
      CalendarRole.EDITOR,
    );
    if (invite.createdById !== userId && actor.role !== CalendarRole.OWNER) {
      throw new ForbiddenException();
    }

    await this.prisma.calendarInvite.deleteMany({ where: { id } });
  }

  async accept(userId: string, token: string): Promise<CalendarDto> {
    return this.prisma.$transaction(async tx => {
      const invite = await tx.calendarInvite.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { calendar: true },
      });

      if (!invite) throw new NotFoundException('Invite not found');

      await tx.$queryRaw`SELECT 1 FROM "Calendar" WHERE "id" = ${invite.calendarId} FOR UPDATE`;

      const existing = await tx.calendarMember.findUnique({
        where: { calendarId_userId: { calendarId: invite.calendarId, userId } },
      });

      if (existing) {
        return {
          id: invite.calendar.id,
          name: invite.calendar.name,
          role: existing.role,
        };
      }

      if (invite.usedAt || invite.expiresAt <= new Date()) {
        throw new GoneException('Invite is no longer valid');
      }

      const memberCount = await tx.calendarMember.count({
        where: { calendarId: invite.calendarId },
      });

      if (memberCount >= MAX_CALENDAR_MEMBERS) {
        throw new ConflictException('Calendar member limit reached');
      }

      const { count } = await tx.calendarInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date(), usedById: userId },
      });

      if (count === 0) throw new GoneException('Invite is no longer valid');

      await tx.calendarMember.create({
        data: { calendarId: invite.calendarId, userId, role: invite.role },
      });

      return { id: invite.calendar.id, name: invite.calendar.name, role: invite.role };
    });
  }

  // HELPERS
  private toInviteDto(invite: CalendarInvite): InviteDto {
    return {
      id: invite.id,
      role: invite.role,
      createdById: invite.createdById,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };
  }
}
