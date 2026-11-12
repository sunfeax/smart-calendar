import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EventCreateDto } from '../events/event.dto.js';
import {
  IMPORT_COLUMN_MAX,
  IMPORT_CONTENT_MAX,
  IMPORT_MAX_EVENTS,
  IMPORT_PROBLEM_CODES,
  IMPORT_SOURCES,
} from './import.constants.js';
import type { ImportProblemCode } from './parsers/parsed-calendar.model.js';

export type ImportSource = (typeof IMPORT_SOURCES)[number];

export class CalendarImportDto {
  @IsIn(IMPORT_SOURCES)
  source!: ImportSource;

  @IsString()
  @MaxLength(IMPORT_CONTENT_MAX)
  content!: string;

  @IsTimeZone()
  timeZone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(IMPORT_COLUMN_MAX)
  dateColumn?: string;
}

export class ImportFixDto {
  @IsInt()
  @Min(0)
  index!: number;

  @ValidateNested()
  @Type(() => EventCreateDto)
  data!: EventCreateDto;
}

export class CalendarImportCommitDto extends CalendarImportDto {
  @IsArray()
  @ArrayMaxSize(IMPORT_MAX_EVENTS)
  @ValidateNested({ each: true })
  @Type(() => ImportFixDto)
  fixes!: ImportFixDto[];
}

export class ImportDraftDto {
  title!: string;
  description!: string | null;
  startAt!: string | null;
  endAt!: string | null;
  allDay!: boolean;
  recurrenceRule!: string | null;
  timeZone!: string | null;
  exceptions!: number;
}

export class ImportProblemDto {
  @ApiProperty({ enum: IMPORT_PROBLEM_CODES, enumName: 'ImportProblemCode' })
  code!: ImportProblemCode;

  value!: string | null;
}

export class ImportBrokenEventDto {
  index!: number;
  problems!: ImportProblemDto[];
  draft!: ImportDraftDto;
}

export class ImportPreviewDto {
  name!: string | null;
  dateColumns!: string[];
  dateColumn!: string | null;
  ready!: number;
  skipped!: number;
  duplicates!: number;
  droppedTags!: number;
  broken!: ImportBrokenEventDto[];
}

export class ImportResultDto {
  created!: number;
}
