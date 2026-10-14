import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { type CalendarColor, type CalendarRole } from '../generated/prisma/enums.js';
import { CALENDAR_COLORS } from './calendar.constants.js';

export class CalendarCreateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
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
