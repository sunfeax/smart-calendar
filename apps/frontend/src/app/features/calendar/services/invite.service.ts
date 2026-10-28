import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  CalendarDto,
  InviteAcceptDto,
  InviteCreateDto,
  InviteCreatedDto,
  InviteDto,
} from '../../../api/generated';

@Service()
export class InviteService {
  // DEPENDENCIES
  private readonly http = inject(HttpClient);

  // ACTIONS
  getList(calendarId: string) {
    return this.http.get<InviteDto[]>(`/api/calendars/${calendarId}/invites`);
  }

  create(calendarId: string, body: InviteCreateDto) {
    return this.http.post<InviteCreatedDto>(`/api/calendars/${calendarId}/invites`, body);
  }

  revoke(inviteId: string) {
    return this.http.delete<void>(`/api/invites/${inviteId}`);
  }

  accept(body: InviteAcceptDto) {
    return this.http.post<CalendarDto>('/api/invites/accept', body);
  }
}
