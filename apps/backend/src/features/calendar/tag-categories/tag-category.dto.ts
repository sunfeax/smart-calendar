import { PartialType } from '@nestjs/swagger';
import { IsBoolean, MaxLength } from 'class-validator';
import { IsNotBlank } from '../../../common/decorators/is-not-blank.decorator.js';
import { TagDto } from '../tags/tag.dto.js';
import { NAME_MAX } from './tag-category.constants.js';

export class TagCategoryCreateDto {
  @IsNotBlank()
  @MaxLength(NAME_MAX)
  name!: string;

  @IsBoolean()
  multiple!: boolean;
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
