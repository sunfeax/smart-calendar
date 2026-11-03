import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/trim.decorator.js';
import { IsEventIcon } from './event-icon.decorator.js';
import {
  DESCRIPTION_MAX,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  TITLE_MAX,
} from './event.constants.js';
import { IsRecurrenceRule } from './recurrence-rule.decorator.js';

export class EventCreateDto {
  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(TITLE_MAX)
  title?: string;

  @IsOptional()
  @MaxLength(DESCRIPTION_MAX)
  description?: string | null;

  @IsOptional()
  @IsEventIcon()
  icon?: string | null;

  @IsISO8601({ strict: true })
  startAt!: string;

  @IsISO8601({ strict: true })
  endAt!: string;

  @IsBoolean()
  allDay!: boolean;

  @IsOptional()
  @IsRecurrenceRule()
  recurrenceRule?: string | null;

  @IsOptional()
  @IsTimeZone()
  timeZone?: string | null;
}

export class EventUpdateDto extends PartialType(EventCreateDto, {
  skipNullProperties: false,
}) {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export const EVENT_SCOPES = ['this', 'following', 'all'] as const;

export type EventScope = (typeof EVENT_SCOPES)[number];

export class EventScopeDto {
  @IsOptional()
  @IsIn(EVENT_SCOPES)
  scope?: EventScope;

  @IsOptional()
  @IsISO8601({ strict: true })
  originalStart?: string;
}

export class EventsRangeDto {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;
}

export class EventsSearchDto {
  @IsString()
  @Trim()
  @MinLength(SEARCH_MIN_LENGTH)
  @MaxLength(SEARCH_MAX_LENGTH)
  q!: string;
}

export class EventDto {
  id!: string;
  calendarId!: string;
  title!: string;
  description!: string | null;
  icon!: string | null;
  startAt!: string;
  endAt!: string;
  allDay!: boolean;
  completedAt!: string | null;
  archivedAt!: string | null;
  recurrenceRule!: string | null;
  timeZone!: string | null;
  originalStart!: string | null;
  updatedAt!: string;
  createdAt!: string;
  tagIds!: string[];
}
