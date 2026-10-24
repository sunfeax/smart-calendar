import { PartialType } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/trim.decorator.js';
import { type CalendarRole } from '../../../generated/prisma/enums.js';

export class CalendarCreateDto {
  @Trim()
  @IsString()
  @MaxLength(100)
  name!: string;
}

export class CalendarUpdateDto extends PartialType(CalendarCreateDto, {
  skipNullProperties: false,
}) {}

export class CalendarDto {
  id!: string;
  name!: string;
  role!: CalendarRole;
}
