import { PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsNotBlank } from '../../../common/decorators/is-not-blank.decorator.js';
import { TagColor } from '../../../generated/prisma/enums.js';
import { MAX_TAGS_PER_CATEGORY, NAME_MAX } from './tag.constants.js';

export class TagCreateDto {
  @IsNotBlank()
  @MaxLength(NAME_MAX)
  name!: string;

  @IsEnum(TagColor)
  color!: TagColor;
}

export class TagUpdateDto extends PartialType(TagCreateDto, {
  skipNullProperties: false,
}) {}

export class TagOrderDto {
  @IsArray()
  @ArrayMaxSize(MAX_TAGS_PER_CATEGORY)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class TagDto {
  id!: string;
  name!: string;
  color!: TagColor;
}
