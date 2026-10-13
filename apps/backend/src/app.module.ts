import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CalendarModule } from './calendars/calendar.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SessionModule } from './session/session.module.js';
import { UserModule } from './users/user.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    PrismaModule,
    AuthModule,
    UserModule,
    SessionModule,
    CalendarModule,
  ],
})
export class AppModule {}
