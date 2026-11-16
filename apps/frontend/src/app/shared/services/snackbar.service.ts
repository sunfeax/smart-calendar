import { inject, Service } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import {
  SNACKBAR_ACTION_DURATION,
  SNACKBAR_CONFIG,
} from '../../core/config/snackbar.config';
import { Snackbar, SnackbarData, SnackbarType } from '../components/snackbar/snackbar';

@Service()
export class SnackbarService {
  // DEPENDENCIES
  private readonly snackBarService = inject(MatSnackBar);

  // ACTIONS
  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  warning(message: string): void {
    this.show(message, 'warning');
  }

  withAction(message: string, action: string): Observable<void> {
    return this.show(message, 'success', action);
  }

  persistent(message: string, action: string): Observable<void> {
    return this.show(message, 'info', action, 0);
  }

  dismiss(): void {
    this.snackBarService.dismiss();
  }

  private show(
    message: string,
    type: SnackbarType,
    action?: string,
    duration = action ? SNACKBAR_ACTION_DURATION : undefined,
  ): Observable<void> {
    const panelClass = ['app-snack-bar', `app-snack-bar--${type}`];
    return this.snackBarService
      .openFromComponent<Snackbar, SnackbarData>(Snackbar, {
        ...SNACKBAR_CONFIG,
        ...(duration !== undefined && { duration }),
        panelClass,
        data: { message, type, action, countdown: duration || undefined },
      })
      .onAction();
  }
}
