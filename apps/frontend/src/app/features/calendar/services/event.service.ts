import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { EventCreateDto, EventDto, EventUpdateDto } from '../../../api/generated';
import { EventRange } from '../models/event-range';

@Service()
export class EventService {
  // DEPENDENCIES
  private readonly http = inject(HttpClient);

  // ACTIONS
  getListRange(calendarId: string, range: EventRange) {
    return this.http.get<EventDto[]>(`/api/calendars/${calendarId}/events`, {
      params: { from: range.from, to: range.to },
    });
  }

  create(calendarId: string, body: EventCreateDto) {
    return this.http.post<EventDto>(`/api/calendars/${calendarId}/events`, body);
  }

  update(eventId: string, body: EventUpdateDto) {
    return this.http.patch<EventDto>(`/api/events/${eventId}`, body);
  }

  delete(eventId: string) {
    return this.http.delete<void>(`/api/events/${eventId}`);
  }

  addTag(eventId: string, tagId: string) {
    return this.http.post<EventDto>(`/api/events/${eventId}/tags/${tagId}`, null);
  }

  removeTag(eventId: string, tagId: string) {
    return this.http.delete<EventDto>(`/api/events/${eventId}/tags/${tagId}`);
  }
}
