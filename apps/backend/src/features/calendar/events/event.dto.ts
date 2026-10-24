import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional, MaxLength } from 'class-validator';
import { IsNotBlank } from '../../../common/is-not-blank.decorator.js';
import { DESCRIPTION_MAX, TITLE_MAX } from './event.constants.js';

export class EventCreateDto {
  @IsNotBlank()
  @MaxLength(TITLE_MAX)
  title!: string;

  @IsOptional()
  @MaxLength(DESCRIPTION_MAX)
  description?: string | null;

  @IsISO8601({ strict: true })
  startAt!: string;

  @IsISO8601({ strict: true })
  endAt!: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;
}

export class EventUpdateDto extends PartialType(EventCreateDto, {
  skipNullProperties: false,
}) {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class EventsRangeDto {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;
}

export class EventDto {
  id!: string;
  calendarId!: string;
  title!: string;
  description!: string | null;
  startAt!: string;
  endAt!: string;
  allDay!: boolean;
  completedAt!: string | null;
  updatedAt!: string;
  createdAt!: string;
}
