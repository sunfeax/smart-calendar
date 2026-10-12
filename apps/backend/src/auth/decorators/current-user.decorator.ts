import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthReq } from '../auth.model.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthReq>();

    const user = request.user;
    if (!user) throw new UnauthorizedException();

    return user;
  },
);
