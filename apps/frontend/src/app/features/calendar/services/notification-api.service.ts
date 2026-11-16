import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  EventReminderDto,
  EventReminderUpdateDto,
  PushConfigDto,
  PushSubscriptionDto,
} from '../../../api/generated';

@Service()
export class NotificationApiService {
  // DEPENDENCIES
  private readonly http = inject(HttpClient);

  // ACTIONS
  getConfig() {
    return this.http.get<PushConfigDto>('/api/notifications/config');
  }

  subscribe(body: PushSubscriptionDto) {
    return this.http.put<void>('/api/notifications/subscription', body);
  }

  unsubscribe(endpoint: string) {
    return this.http.delete<void>('/api/notifications/subscription', {
      body: { endpoint },
    });
  }

  getReminder(eventId: string) {
    return this.http.get<EventReminderDto>(`/api/events/${eventId}/reminder`);
  }

  updateReminder(eventId: string, body: EventReminderUpdateDto) {
    return this.http.put<EventReminderDto>(`/api/events/${eventId}/reminder`, body);
  }
}
