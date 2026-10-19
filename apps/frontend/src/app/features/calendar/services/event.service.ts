import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { EventDto } from '../../../api/generated';
import { EventRange } from '../models/event-range';

@Service()
export class EventService {
  private readonly http = inject(HttpClient);

  getListRange(calendarId: string, range: EventRange) {
    return this.http.get<EventDto[]>(`/api/calendars/${calendarId}/events`, {
      params: { from: range.from, to: range.to },
    });
  }
}
