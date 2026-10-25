import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, MaxLength } from 'class-validator';
import { IsNotBlank } from '../../../common/is-not-blank.decorator.js';
import { TagColor } from '../../../generated/prisma/enums.js';
import { NAME_MAX } from './tag.constants.js';

export class TagCreateDto {
  @IsNotBlank()
  @MaxLength(NAME_MAX)
  name!: string;

  @IsOptional()
  @IsEnum(TagColor)
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
