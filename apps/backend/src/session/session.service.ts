import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateToken, hashToken } from './session-token.js';
import { SESSION_ONE_DAY_MS, SESSION_TTL_MS } from './session.constants.js';
import { SessionWithUser } from './session.model.js';

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

  async validate(
    token: string,
  ): Promise<{ session: SessionWithUser; renewed: boolean } | null> {
    let session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    let renewed = false;

    if (!session) return null;

    if (Date.now() > session.expiresAt.getTime()) {
      await this.delete(session.id);
      return null;
    }

    if (Date.now() - session.lastUsedAt.getTime() > SESSION_ONE_DAY_MS) {
      session = await this.prisma.session.update({
        where: { id: session.id },
        data: {
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
          lastUsedAt: new Date(),
        },
        include: { user: true },
      });
      renewed = true;
    }

    return { session, renewed };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id } });
  }
}
