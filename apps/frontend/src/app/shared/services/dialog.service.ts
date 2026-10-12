import { inject, Service } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { filter, Observable } from 'rxjs';
import { ConfirmDialog } from '../dialogs/confirm-dialog/confirm-dialog';
import { Dialog } from '../models/dialog';

@Service()
export class DialogService {
  private readonly dialogService = inject(MatDialog);

  confirm(data: Dialog): Observable<boolean> {
    return this.dialogService
      .open<ConfirmDialog, Dialog, boolean>(ConfirmDialog, {
        data,
        width: 'min(28rem, calc(100vw - 2rem))',
        autoFocus: 'dialog',
      })
      .afterClosed()
      .pipe(filter(confirmed => confirmed === true));
  }
}
