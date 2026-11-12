import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  CalendarImportCommitDto,
  CalendarImportDto,
  ImportPreviewDto,
  ImportResultDto,
} from '../../../api/generated';

@Service()
export class ImportService {
  // DEPENDENCIES
  private readonly http = inject(HttpClient);

  // ACTIONS
  preview(calendarId: string, body: CalendarImportDto) {
    return this.http.post<ImportPreviewDto>(
      `/api/calendars/${calendarId}/import/preview`,
      body,
    );
  }

  commit(calendarId: string, body: CalendarImportCommitDto) {
    return this.http.post<ImportResultDto>(`/api/calendars/${calendarId}/import`, body);
  }
}
