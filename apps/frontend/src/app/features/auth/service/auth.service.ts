import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, finalize, Observable, of, switchMap, tap, timeout } from 'rxjs';
import { GoogleLoginDto, UserProfileDto } from '../../../api/generated';
import { routePaths } from '../../../core/constants/routePaths';
import { TabSyncService } from '../../../shared/services/tab-sync.service';

const ME_TIMEOUT_MS = 15000;

@Service()
export class AuthService {
  // DEPENDENCIES
  private readonly http = inject(HttpClient);
  private readonly tabSyncService = inject(TabSyncService);
  private readonly router = inject(Router);

  // STATE
  private readonly authPath = '/api/auth';
  private readonly _user = signal<UserProfileDto | null>(null);
  readonly user = this._user.asReadonly();
  private readonly _unreachable = signal(false);
  readonly unreachable = this._unreachable.asReadonly();

  // COMPUTED
  readonly isAuthenticated = computed(() => !!this._user());

  // LIFECYCLE
  constructor() {
    this.syncAuthFromTabs();
  }

  // EFFECTS
  private syncAuthFromTabs(): void {
    this.tabSyncService.incoming
      .pipe(
        switchMap(event => this.me().pipe(switchMap(() => of(event)))),
        takeUntilDestroyed(),
      )
      .subscribe(event => {
        void this.router.navigateByUrl(
          event.type === 'login' ? routePaths.calendars : routePaths.login,
        );
      });
  }

  // ACTIONS
  login(credential: string): Observable<UserProfileDto> {
    return this.http
      .post<UserProfileDto>(`${this.authPath}/google`, {
        credential,
      } satisfies GoogleLoginDto)
      .pipe(
        tap(user => {
          this._user.set(user);
          this.tabSyncService.send({ type: 'login' });
        }),
      );
  }

  me(): Observable<UserProfileDto | null> {
    return this.http.get<UserProfileDto>(`${this.authPath}/me`).pipe(
      timeout(ME_TIMEOUT_MS),
      tap(user => {
        this._user.set(user);
        this._unreachable.set(false);
      }),
      catchError((error: unknown) => {
        const unauthorized = error instanceof HttpErrorResponse && error.status === 401;
        this._unreachable.set(!unauthorized);
        if (unauthorized) this._user.set(null);
        return of(null);
      }),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.authPath}/logout`, null).pipe(
      finalize(() => {
        this._user.set(null);
        this.tabSyncService.send({ type: 'logout' });
      }),
    );
  }
}
