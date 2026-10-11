import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateToken, hashToken } from './session-token.js';
import { SESSION_TTL_MS } from './session.constants.js';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, userAgent: string | undefined): Promise<string> {
    const token = generateToken();

    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        userAgent: userAgent?.slice(0, 512),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return token;
  }
}
