import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { User } from '../../generated/prisma/client.js';
import { CalendarRole } from '../../generated/prisma/enums.js';
import { GoogleProfile } from './user.model.js';

@Injectable()
export class UserService {
  // DEPENDENCIES
  constructor(private readonly prisma: PrismaService) {}

  // ACTIONS
  async upsertFromGoogle(profile: GoogleProfile): Promise<User> {
    return await this.prisma.user.upsert({
      where: { googleId: profile.googleId },
      update: { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl },
      create: {
        ...profile,
        memberships: {
          create: { role: CalendarRole.OWNER, calendar: { create: { name: '' } } },
        },
      },
    });
  }
}
