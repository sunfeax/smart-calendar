import { PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsNotBlank } from '../../../common/decorators/is-not-blank.decorator.js';
import { TagDto } from '../tags/tag.dto.js';
import { MAX_TAG_CATEGORIES_PER_CALENDAR, NAME_MAX } from './tag-category.constants.js';

export class TagCategoryCreateDto {
  @IsNotBlank()
  @MaxLength(NAME_MAX)
  name!: string;

  @IsBoolean()
  multiple!: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  showOnCard?: boolean;
}

export class TagCategoryUpdateDto extends PartialType(TagCategoryCreateDto, {
  skipNullProperties: false,
}) {}

export class TagCategoryOrderDto {
  @IsArray()
  @ArrayMaxSize(MAX_TAG_CATEGORIES_PER_CALENDAR)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class TagCategoryDto {
  id!: string;
  name!: string;
  multiple!: boolean;
  showOnCard!: boolean;
  tags!: TagDto[];
}
