import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { Trim } from './trim.decorator.js';

export const IsNotBlank = () => applyDecorators(Trim(), IsString(), IsNotEmpty());
