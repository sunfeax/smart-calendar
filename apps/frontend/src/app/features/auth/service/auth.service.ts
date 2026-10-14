import { HttpClient } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { catchError, finalize, Observable, of, tap } from 'rxjs';
import { GoogleLoginDto, UserProfileDto } from '../../../api/generated';

@Service()
export class AuthService {
  private readonly authPath = '/api/auth';
  private readonly http = inject(HttpClient);

  private readonly _user = signal<UserProfileDto | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._user());

  login(credential: string): Observable<UserProfileDto> {
    return this.http
      .post<UserProfileDto>(`${this.authPath}/google`, {
        credential,
      } satisfies GoogleLoginDto)
      .pipe(tap(user => this._user.set(user)));
  }

  me(): Observable<UserProfileDto | null> {
    return this.http.get<UserProfileDto>(`${this.authPath}/me`).pipe(
      tap(user => this._user.set(user)),
      catchError(() => {
        this._user.set(null);
        return of(null);
      }),
    );
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.authPath}/logout`, null)
      .pipe(finalize(() => this._user.set(null)));
  }
}
