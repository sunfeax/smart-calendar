import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { User } from '../generated/prisma/client.js';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '../session/session.constants.js';
import { UserProfile } from '../user/user.model.js';
import { AuthService } from './auth.service.js';
import { GoogleLoginDto } from './google-login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: GoogleLoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.authService.loginWithGoogle(
      dto.credential,
      userAgent,
    );
    res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return this.toProfile(user);
  }

  private toProfile(user: User): UserProfile {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    };
  }
}
