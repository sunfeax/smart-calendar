import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { User } from '../generated/prisma/client.js';
import { SessionService } from '../session/session.service.js';
import { GoogleProfile } from '../users/user.model.js';
import { UserService } from '../users/user.service.js';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly config: ConfigService,
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
  ) {}

  async loginWithGoogle(
    credential: string,
    userAgent: string | undefined,
  ): Promise<{ user: User; token: string }> {
    const payload = await this.verifyGoogleToken(credential);

    if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException();
    }

    const profile: GoogleProfile = {
      googleId: payload.sub,
      email: payload.email ?? '',
      name: payload.name ?? payload.email ?? '',
      avatarUrl: payload.picture,
    };
    const user = await this.userService.upsertFromGoogle(profile);
    const token = await this.sessionService.create(user.id, userAgent);

    return { user, token };
  }

  private async verifyGoogleToken(credential: string): Promise<TokenPayload | undefined> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      });
      return ticket.getPayload();
    } catch {
      throw new UnauthorizedException();
    }
  }
}
