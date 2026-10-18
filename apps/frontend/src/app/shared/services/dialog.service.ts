import { inject, Service, Type } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { filter, Observable } from 'rxjs';
import { ConfirmDialog } from '../dialogs/confirm-dialog/confirm-dialog';
import { Dialog } from '../models/dialog';

@Service()
export class DialogService {
  private readonly dialogService = inject(MatDialog);

  open<C, D, R>(
    component: Type<C>,
    config: MatDialogConfig<D> = {},
  ): Observable<R | undefined> {
    return this.dialogService
      .open<C, D, R>(component, {
        width: 'min(28rem, calc(100vw - 2rem))',
        ...config,
      })
      .afterClosed();
  }

  confirm(data: Dialog): Observable<boolean> {
    return this.open<ConfirmDialog, Dialog, boolean>(ConfirmDialog, {
      data,
      autoFocus: 'dialog',
    }).pipe(filter(confirmed => confirmed === true));
  }
}
