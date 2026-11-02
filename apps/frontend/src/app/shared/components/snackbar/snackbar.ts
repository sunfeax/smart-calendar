import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import {
  MAT_SNACK_BAR_DATA,
  MatSnackBarAction,
  MatSnackBarActions,
  MatSnackBarLabel,
  MatSnackBarRef,
} from '@angular/material/snack-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { interval, take } from 'rxjs';

export type SnackbarType = 'success' | 'error' | 'info' | 'warning';

export interface SnackbarData {
  message: string;
  type: SnackbarType;
  action?: string;
  countdown?: number;
}

const ICONS: Record<SnackbarType, string> = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

@Component({
  selector: 'app-snackbar',
  imports: [
    MatButton,
    MatIcon,
    MatIconButton,
    MatSnackBarAction,
    MatSnackBarActions,
    MatSnackBarLabel,
    TranslocoPipe,
  ],
  templateUrl: './snackbar.html',
  styleUrl: './snackbar.scss',
})
export class Snackbar {
  // DEPENDENCIES
  private readonly snackBarRef = inject<MatSnackBarRef<Snackbar>>(MatSnackBarRef);

  readonly data = inject<SnackbarData>(MAT_SNACK_BAR_DATA);

  // STATE
  readonly secondsLeft = signal(Math.ceil((this.data.countdown ?? 0) / 1000));

  // COMPUTED
  readonly icon = computed(() => ICONS[this.data.type]);

  // LIFECYCLE
  constructor() {
    this.startCountdown();
  }

  // EFFECTS
  private startCountdown(): void {
    interval(1000)
      .pipe(take(this.secondsLeft()), takeUntilDestroyed())
      .subscribe(() => this.secondsLeft.update(seconds => seconds - 1));
  }

  // ACTIONS
  runAction(): void {
    this.snackBarRef.dismissWithAction();
  }

  close(): void {
    this.snackBarRef.dismiss();
  }
}
