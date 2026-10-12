import { HttpClient } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { catchError, finalize, Observable, of, tap } from 'rxjs';
import { User } from '../models/user.interface';

@Service()
export class AuthService {
  private readonly authPath = '/api/auth';
  private readonly http = inject(HttpClient);

  private readonly _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._user());

  login(credential: string): Observable<User> {
    return this.http
      .post<User>(`${this.authPath}/google`, { credential })
      .pipe(tap(user => this._user.set(user)));
  }

  me(): Observable<User | null> {
    return this.http.get<User>(`${this.authPath}/me`).pipe(
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
