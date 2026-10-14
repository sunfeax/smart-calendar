import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CalendarRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CalendarAccessService } from './calendar-access.service.js';
import { MAX_CALENDARS, MAX_CALENDARS_PER_USER } from './calendar.constants.js';
import { CalendarCreateDto, CalendarDto, CalendarUpdateDto } from './calendar.dto.js';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
  ) {}

  async list(userId: string): Promise<CalendarDto[]> {
    const memberships = await this.prisma.calendarMember.findMany({
      where: { userId },
      include: { calendar: true },
      orderBy: { calendar: { createdAt: 'asc' } },
      take: MAX_CALENDARS,
    });

    return memberships.map(membership => ({
      id: membership.calendar.id,
      name: membership.calendar.name,
      color: membership.calendar.color,
      role: membership.role,
    }));
  }

  async get(userId: string, id: string): Promise<CalendarDto> {
    const membership = await this.access.requireRole(userId, id, CalendarRole.VIEWER);
    const calendar = await this.prisma.calendar.findUnique({ where: { id } });

    if (!calendar) throw new NotFoundException();

    return {
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      role: membership.role,
    };
  }

  async create(userId: string, dto: CalendarCreateDto): Promise<CalendarDto> {
    const calendarCount = await this.prisma.calendarMember.count({
      where: { userId, role: CalendarRole.OWNER },
    });

    if (calendarCount >= MAX_CALENDARS_PER_USER) {
      throw new ForbiddenException('Calendar limit reached');
    }

    const calendar = await this.prisma.calendar.create({
      data: {
        ...dto,
        members: {
          create: {
            role: CalendarRole.OWNER,
            userId,
          },
        },
      },
    });

    return {
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      role: CalendarRole.OWNER,
    };
  }

  async update(userId: string, id: string, dto: CalendarUpdateDto): Promise<CalendarDto> {
    const membership = await this.access.requireRole(userId, id, CalendarRole.OWNER);

    const calendar = await this.prisma.calendar.update({
      where: { id },
      data: dto,
    });

    return {
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      role: membership.role,
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.access.requireRole(userId, id, CalendarRole.OWNER);
    await this.prisma.calendar.delete({ where: { id } });
  }
}
