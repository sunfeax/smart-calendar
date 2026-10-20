import { Component, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required, validate } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatError, MatFormField, MatInput, MatLabel } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { DESCRIPTION_MAX, TITLE_MAX } from '../../constants/event.constants';
import { EventDialogData, EventDialogResult } from '../../models/event-dialog';

@Component({
  imports: [
    FormField,
    MatButton,
    MatCheckbox,
    MatIcon,
    MatIconButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatInput,
    MatLabel,
    TranslocoPipe,
  ],
  selector: 'app-event-create-edit-dialog',
  styleUrl: './event-create-edit-dialog.scss',
  templateUrl: './event-create-edit-dialog.html',
})
export class EventCreateEditDialog {
  private readonly dialogRef =
    inject<MatDialogRef<EventCreateEditDialog, EventDialogResult>>(MatDialogRef);

  readonly data = inject<EventDialogData>(MAT_DIALOG_DATA);
  private readonly model = signal(this.initialForm());

  eventForm = form(this.model, schema => {
    required(schema.title);
    required(schema.startAt);
    maxLength(schema.title, TITLE_MAX);
    maxLength(schema.description, DESCRIPTION_MAX);
    validate(schema.title, context => {
      return context.value().trim().length > 0 ? null : { kind: 'required' };
    });
    validate(schema.endAt, context => {
      const end = context.value();
      const start = context.valueOf(schema.startAt);
      if (!end || !start) return null;
      return new Date(end) > new Date(start) ? null : { kind: 'endBeforeStart' };
    });
  });

  save(): void {
    const value = this.eventForm().value();
    if (this.eventForm().invalid()) return;
    this.dialogRef.close({ action: this.data.mode, value });
  }

  remove(): void {
    this.dialogRef.close({ action: 'delete' });
  }

  cancel() {
    this.dialogRef.close();
  }

  private initialForm() {
    if (this.data.mode === 'update') {
      return {
        title: this.data.event.title,
        description: this.data.event.description ?? '',
        allDay: this.data.event.allDay ?? false,
        startAt: this.data.event.startAt,
        endAt: this.data.event.endAt ?? '',
        completed: this.data.event.completedAt !== null,
      };
    } else {
      return {
        title: '',
        description: '',
        allDay: false,
        startAt: '',
        endAt: '',
        completed: false,
      };
    }
  }
}
