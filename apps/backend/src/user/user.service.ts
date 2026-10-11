import { Injectable } from '@nestjs/common';
import { User } from '../generated/prisma/client.js';
import { CalendarRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GoogleProfile } from './user.model.js';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

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
