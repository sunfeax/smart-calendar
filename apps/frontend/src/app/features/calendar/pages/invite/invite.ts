import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { switchMap, take } from 'rxjs';
import { routePaths } from '../../../../core/constants/routePaths';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { InviteService } from '../../services/invite.service';

const ERROR_KEYS: Record<number, string> = {
  404: 'invite.errors.notFound',
  409: 'invite.errors.full',
  410: 'invite.errors.expired',
};

@Component({
  selector: 'app-invite',
  imports: [MatButton, MatIcon, MatProgressSpinner, RouterLink, TranslocoPipe],
  templateUrl: './invite.html',
  styleUrl: './invite.scss',
})
export class Invite {
  // DEPENDENCIES
  private readonly inviteService = inject(InviteService);
  private readonly router = inject(Router);
  private readonly snackbarService = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);

  // INPUTS
  readonly token = input.required<string>();

  // STATE
  readonly routePaths = routePaths;
  readonly errorKey = signal<string | null>(null);

  // LIFECYCLE
  constructor() {
    this.acceptOnOpen();
  }

  // EFFECTS
  private acceptOnOpen(): void {
    toObservable(this.token)
      .pipe(
        take(1),
        switchMap(token => this.inviteService.accept({ token })),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: calendar => {
          this.snackbarService.success(this.transloco.translate('invite.joined'));
          void this.router.navigateByUrl(`${routePaths.calendars}/${calendar.id}`, {
            replaceUrl: true,
          });
        },
        error: (error: unknown) => this.errorKey.set(this.toErrorKey(error)),
      });
  }

  // HELPERS
  private toErrorKey(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    return ERROR_KEYS[status] ?? 'invite.errors.generic';
  }
}
