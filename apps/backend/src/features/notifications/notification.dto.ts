import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsDefined,
  IsInt,
  IsString,
  IsTimeZone,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  NOTIFICATION_LANGUAGES,
  type NotificationLanguage,
  REMINDER_MAX_MINUTES,
} from './notification.constants.js';

export class PushKeysDto {
  @Matches(/^[A-Za-z0-9_-]{87}$/)
  p256dh!: string;

  @Matches(/^[A-Za-z0-9_-]{22}$/)
  auth!: string;
}

export class PushEndpointDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint!: string;
}

export class PushSubscriptionDto extends PushEndpointDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;

  @IsIn(NOTIFICATION_LANGUAGES)
  language!: NotificationLanguage;
}

export class PushConfigDto {
  publicKey!: string | null;
}

export class EventReminderUpdateDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(REMINDER_MAX_MINUTES)
  minutesBefore!: number;

  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  allDayTime!: string;

  @IsTimeZone()
  timeZone!: string;
}

export class EventReminderDto {
  enabled!: boolean;
  minutesBefore!: number;
  allDayTime!: string;
  timeZone!: string;
}
