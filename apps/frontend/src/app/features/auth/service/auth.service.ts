import { HttpClient } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { catchError, finalize, Observable, of, tap } from 'rxjs';
import { GoogleLoginDto, UserProfile } from '../../../api/generated';

@Service()
export class AuthService {
  private readonly authPath = '/api/auth';
  private readonly http = inject(HttpClient);

  private readonly _user = signal<UserProfile | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._user());

  login(credential: string): Observable<UserProfile> {
    return this.http
      .post<UserProfile>(`${this.authPath}/google`, {
        credential,
      } satisfies GoogleLoginDto)
      .pipe(tap(user => this._user.set(user)));
  }

  me(): Observable<UserProfile | null> {
    return this.http.get<UserProfile>(`${this.authPath}/me`).pipe(
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
