import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SessionModule } from '../session/session.module.js';
import { UserModule } from '../users/user.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [UserModule, SessionModule],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  controllers: [AuthController],
})
export class AuthModule {}
