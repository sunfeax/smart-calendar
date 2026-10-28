import { Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import {
  MAT_SNACK_BAR_DATA,
  MatSnackBarAction,
  MatSnackBarActions,
  MatSnackBarLabel,
  MatSnackBarRef,
} from '@angular/material/snack-bar';
import { TranslocoPipe } from '@jsverse/transloco';

export type SnackbarType = 'success' | 'error' | 'info' | 'warning';

export interface SnackbarData {
  message: string;
  type: SnackbarType;
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

  // COMPUTED
  readonly icon = computed(() => ICONS[this.data.type]);

  // ACTIONS
  close(): void {
    this.snackBarRef.dismiss();
  }
}
