import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, Observable } from 'rxjs';
import { RECURRENCE_SCOPES } from '../../constants/recurrence.constants';
import { RecurrenceScope } from '../../models/recurrence';

export interface RecurrenceScopeDialogData {
  action: 'update' | 'delete';
}

@Component({
  selector: 'app-recurrence-scope-dialog',
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatRadioButton,
    MatRadioGroup,
    TranslocoPipe,
  ],
  templateUrl: './recurrence-scope-dialog.html',
  styleUrl: './recurrence-scope-dialog.scss',
})
export class RecurrenceScopeDialog {
  // STATIC
  static open(
    dialog: MatDialog,
    data: RecurrenceScopeDialogData,
  ): Observable<RecurrenceScope> {
    return dialog
      .open<RecurrenceScopeDialog, RecurrenceScopeDialogData, RecurrenceScope>(
        RecurrenceScopeDialog,
        { data, autoFocus: 'dialog' },
      )
      .afterClosed()
      .pipe(filter(scope => scope !== undefined));
  }

  // DEPENDENCIES
  readonly data = inject<RecurrenceScopeDialogData>(MAT_DIALOG_DATA);

  // STATE
  readonly scopes = RECURRENCE_SCOPES;
  readonly scope = signal<RecurrenceScope>('this');
}
