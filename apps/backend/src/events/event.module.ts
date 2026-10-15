import { Module } from '@nestjs/common';
import { EventController } from './event.controller.js';
import { EventService } from './event.service.js';

@Module({
  providers: [EventService],
  controllers: [EventController],
})
export class EventModule {}
