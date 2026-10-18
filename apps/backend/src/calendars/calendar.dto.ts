import { PartialType } from '@nestjs/swagger';
import { MaxLength } from 'class-validator';
import { IsNotBlank } from '../common/is-not-blank.decorator.js';
import { type CalendarRole } from '../generated/prisma/enums.js';

export class CalendarCreateDto {
  @IsNotBlank()
  @MaxLength(100)
  name!: string;
}

export class CalendarUpdateDto extends PartialType(CalendarCreateDto) {}

export class CalendarDto {
  id!: string;
  name!: string;
  role!: CalendarRole;
}
