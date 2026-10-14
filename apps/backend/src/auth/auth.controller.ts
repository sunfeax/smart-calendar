import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '../generated/prisma/client.js';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '../session/session.constants.js';
import { SessionService } from '../session/session.service.js';
import { UserProfileDto } from '../users/user-profile.dto.js';
import type { AuthReq } from './auth.model.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { GoogleLoginDto } from './google-login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: GoogleLoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.loginWithGoogle(
      dto.credential,
      userAgent,
    );
    response.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return this.toProfile(user);
  }

  @Get('me')
  me(@CurrentUser() user: User): UserProfileDto {
    return this.toProfile(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: AuthReq,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessionService.delete(request.sessionId);
    response.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
  }

  private toProfile(user: User): UserProfileDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    };
  }
}
