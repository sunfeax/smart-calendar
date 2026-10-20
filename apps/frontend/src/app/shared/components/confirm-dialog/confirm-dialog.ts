import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, Observable } from 'rxjs';

export interface ConfirmDialogData {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'info' | 'warning' | 'danger';
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButton,
    TranslocoPipe,
  ],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  static open(dialog: MatDialog, data: ConfirmDialogData): Observable<true> {
    return dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data,
        autoFocus: 'dialog',
      })
      .afterClosed()
      .pipe(filter(confirmed => confirmed === true));
  }

  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  get confirmClass(): string {
    switch (this.data.variant) {
      case 'danger':
        return 'confirm__accept--danger';
      case 'warning':
        return 'confirm__accept--warning';
      default:
        return '';
    }
  }
}
