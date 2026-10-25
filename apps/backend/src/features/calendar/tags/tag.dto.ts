import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, MaxLength } from 'class-validator';
import { IsNotBlank } from '../../../common/is-not-blank.decorator.js';
import { NAME_MAX, TAG_COLORS, type TagColor } from './tag.constants.js';

export class TagCreateDto {
  @IsNotBlank()
  @MaxLength(NAME_MAX)
  name!: string;

  @IsOptional()
  @IsIn(TAG_COLORS)
  color?: TagColor;
}

export class TagUpdateDto extends PartialType(TagCreateDto, {
  skipNullProperties: false,
}) {}

export class TagDto {
  id!: string;
  name!: string;
  color!: TagColor;
}
