import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './features/auth/auth.module.js';
import { CalendarModule } from './features/calendar/calendars/calendar.module.js';
import { EventModule } from './features/calendar/events/event.module.js';
import { TagModule } from './features/calendar/tags/tag.module.js';
import { SessionModule } from './features/session/session.module.js';
import { UserModule } from './features/users/user.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    PrismaModule,
    AuthModule,
    UserModule,
    SessionModule,
    CalendarModule,
    EventModule,
    TagModule,
  ],
})
export class AppModule {}
