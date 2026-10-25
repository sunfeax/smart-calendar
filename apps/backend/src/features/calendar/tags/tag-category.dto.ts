import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, MaxLength } from 'class-validator';
import { IsNotBlank } from '../../../common/is-not-blank.decorator.js';
import { NAME_MAX } from './tag.constants.js';
import { TagDto } from './tag.dto.js';

export class TagCategoryCreateDto {
  @IsNotBlank()
  @MaxLength(NAME_MAX)
  name!: string;

  @IsOptional()
  @IsBoolean()
  multiple?: boolean;
}

export class TagCategoryUpdateDto extends PartialType(TagCategoryCreateDto, {
  skipNullProperties: false,
}) {}

export class TagCategoryDto {
  id!: string;
  name!: string;
  multiple!: boolean;
  tags!: TagDto[];
}
