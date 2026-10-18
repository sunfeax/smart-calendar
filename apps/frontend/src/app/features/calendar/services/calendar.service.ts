import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { CalendarDto, CalendarUpdateDto } from '../../../api/generated';

@Service()
export class CalendarService {
  private readonly http = inject(HttpClient);

  getList() {
    return this.http.get<CalendarDto[]>('/api/calendars');
  }

  get(calendarId: string) {
    return this.http.get<CalendarDto>(`/api/calendars/${calendarId}`);
  }

  create() {
    return this.http.post<CalendarDto>('/api/calendars', null);
  }

  update(calendarId: string, body: CalendarUpdateDto) {
    return this.http.patch<CalendarDto>(`/api/calendars/${calendarId}`, body);
  }

  delete(calendarId: string) {
    return this.http.delete<CalendarDto>(`/api/calendars/${calendarId}`);
  }
}
