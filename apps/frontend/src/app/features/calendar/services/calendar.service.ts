import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { CalendarDto } from '../../../api/generated';

@Service()
export class CalendarService {
  private readonly http = inject(HttpClient);

  getList() {
    return this.http.get<CalendarDto[]>('/api/calendars');
  }
}
