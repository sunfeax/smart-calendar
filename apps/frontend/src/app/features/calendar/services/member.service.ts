import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { MemberDto } from '../../../api/generated';

@Service()
export class MemberService {
  // DEPENDENCIES
  private readonly http = inject(HttpClient);

  // ACTIONS
  getList(calendarId: string) {
    return this.http.get<MemberDto[]>(`/api/calendars/${calendarId}/members`);
  }

  remove(calendarId: string, userId: string) {
    return this.http.delete<void>(`/api/calendars/${calendarId}/members/${userId}`);
  }
}
