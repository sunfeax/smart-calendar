import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { THROTTLE_LIMIT, THROTTLE_TTL_MS } from './common/constants.js';
import { AuthModule } from './features/auth/auth.module.js';
import { CalendarModule } from './features/calendar/calendars/calendar.module.js';
import { EventModule } from './features/calendar/events/event.module.js';
import { InviteModule } from './features/calendar/invites/invite.module.js';
import { MemberModule } from './features/calendar/members/member.module.js';
import { TagCategoryModule } from './features/calendar/tag-categories/tag-category.module.js';
import { TagModule } from './features/calendar/tags/tag.module.js';
import { SessionModule } from './features/session/session.module.js';
import { UserModule } from './features/users/user.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    ThrottlerModule.forRoot([{ ttl: THROTTLE_TTL_MS, limit: THROTTLE_LIMIT }]),
    PrismaModule,
    AuthModule,
    UserModule,
    SessionModule,
    CalendarModule,
    EventModule,
    TagCategoryModule,
    TagModule,
    MemberModule,
    InviteModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
