import { Module } from '@nestjs/common';
import { TagService } from './tag.service.js';
import { TagController } from './tag.controller.js';

@Module({
  providers: [TagService],
  controllers: [TagController]
})
export class TagModule {}
