import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, MaxLength } from 'class-validator';
import { IsNotBlank } from '../common/is-not-blank.decorator.js';
import { type CalendarColor, type CalendarRole } from '../generated/prisma/enums.js';
import { CALENDAR_COLORS } from './calendar.constants.js';

export class CalendarCreateDto {
  @IsNotBlank()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(CALENDAR_COLORS)
  color?: CalendarColor;
}

export class CalendarUpdateDto extends PartialType(CalendarCreateDto) {}

export class CalendarDto {
  id!: string;
  name!: string;
  color!: CalendarColor | null;
  role!: CalendarRole;
}
