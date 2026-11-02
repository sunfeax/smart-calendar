import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { EventCreateDto, EventDto, EventUpdateDto } from '../../../api/generated';
import { EventRange } from '../models/event-range';
import { RecurrenceScope } from '../models/recurrence';

export interface EventScopeParams {
  scope: RecurrenceScope;
  originalStart: string;
}

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

  update(eventId: string, body: EventUpdateDto, scope?: EventScopeParams) {
    return this.http.patch<EventDto>(`/api/events/${eventId}`, body, {
      params: scope ? { ...scope } : {},
    });
  }

  delete(eventId: string, scope?: EventScopeParams) {
    return this.http.delete<void>(`/api/events/${eventId}`, {
      params: scope ? { ...scope } : {},
    });
  }

  listArchived(calendarId: string) {
    return this.http.get<EventDto[]>(`/api/calendars/${calendarId}/events/archived`);
  }

  restore(eventId: string, scope?: EventScopeParams) {
    return this.http.post<EventDto>(`/api/events/${eventId}/restore`, null, {
      params: scope ? { ...scope } : {},
    });
  }

  deleteArchived(eventId: string) {
    return this.http.delete<void>(`/api/events/${eventId}/archived`);
  }

  addTag(eventId: string, tagId: string) {
    return this.http.post<EventDto>(`/api/events/${eventId}/tags/${tagId}`, null);
  }

  removeTag(eventId: string, tagId: string) {
    return this.http.delete<EventDto>(`/api/events/${eventId}/tags/${tagId}`);
  }
}
