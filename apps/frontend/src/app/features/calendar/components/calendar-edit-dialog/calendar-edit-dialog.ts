import { Component, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatInput, MatLabel } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { CalendarUpdateDto } from '../../../../api/generated';

@Component({
  imports: [
    FormField,
    MatButton,
    MatIcon,
    MatIconButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatInput,
    MatLabel,
    TranslocoPipe,
  ],
  selector: 'app-calendar-edit-dialog',
  styleUrl: './calendar-edit-dialog.scss',
  templateUrl: './calendar-edit-dialog.html',
})
export class CalendarEditDialog {
  private readonly dialogRef =
    inject<MatDialogRef<CalendarEditDialog, CalendarUpdateDto>>(MatDialogRef);

  readonly data = inject<CalendarUpdateDto>(MAT_DIALOG_DATA);

  private model = signal({ name: this.data.name ?? '' });

  calendarForm = form(this.model, schema => {
    required(schema.name);
    maxLength(schema.name, 100);
  });

  save(): void {
    const value = this.calendarForm().value();
    const name = value.name.trim();
    if (this.calendarForm().invalid() || !name) return;
    this.dialogRef.close({ ...value, name });
  }

  cancel() {
    this.dialogRef.close();
  }
}
