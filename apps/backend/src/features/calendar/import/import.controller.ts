import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { STRICT_THROTTLE } from '../../../common/constants.js';
import { type User } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import {
  CalendarImportCommitDto,
  CalendarImportDto,
  ImportPreviewDto,
  ImportResultDto,
} from './import.dto.js';
import { IMPORT_PREVIEW_THROTTLE } from './import.constants.js';
import { ImportService } from './import.service.js';

@Controller('calendars/:calendarId/import')
export class ImportController {
  // DEPENDENCIES
  constructor(private readonly importService: ImportService) {}

  // ACTIONS
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Throttle(IMPORT_PREVIEW_THROTTLE)
  preview(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Body() dto: CalendarImportDto,
  ): Promise<ImportPreviewDto> {
    return this.importService.preview(user.id, calendarId, dto);
  }

  @Post()
  @Throttle(STRICT_THROTTLE)
  commit(
    @CurrentUser() user: User,
    @Param('calendarId', ParseUUIDPipe) calendarId: string,
    @Body() dto: CalendarImportCommitDto,
  ): Promise<ImportResultDto> {
    return this.importService.commit(user.id, calendarId, dto);
  }
}
