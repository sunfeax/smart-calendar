import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '../session/session.constants.js';
import { SessionService } from '../session/session.service.js';
import { AuthReq } from './auth.model.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
  // DEPENDENCIES
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
  ) {}

  // ACTIONS
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthReq>();

    if (!request.cookies) throw new UnauthorizedException();

    const token: unknown = request.cookies[SESSION_COOKIE];
    if (typeof token !== 'string') throw new UnauthorizedException();

    const result = await this.sessionService.validate(token);
    if (!result) throw new UnauthorizedException();

    if (result.renewed) {
      const response = http.getResponse<Response>();
      response.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    }

    request.user = result.session.user;
    request.sessionId = result.session.id;
    return true;
  }
}
