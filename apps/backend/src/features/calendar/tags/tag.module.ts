import { Module } from '@nestjs/common';
import { TagController } from './tag.controller.js';
import { TagService } from './tag.service.js';

@Module({
  providers: [TagService],
  controllers: [TagController],
})
export class TagModule {}
