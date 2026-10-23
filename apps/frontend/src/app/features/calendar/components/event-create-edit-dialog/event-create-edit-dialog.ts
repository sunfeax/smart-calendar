import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, maxLength, required, validate } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import {
  MatError,
  MatFormField,
  MatInput,
  MatLabel,
  MatSuffix,
} from '@angular/material/input';
import {
  MatTimepicker,
  MatTimepickerInput,
  MatTimepickerToggle,
} from '@angular/material/timepicker';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { startOfDay } from 'date-fns';
import { filter, merge } from 'rxjs';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { DESCRIPTION_MAX, HOUR_MS, TITLE_MAX } from '../../constants/event.constants';
import { EventDialogData, EventDialogResult } from '../../models/event-dialog';
import { toEventApiDates, toEventFormDates } from '../../utils/event.mapper';

interface EventFormModel {
  title: string;
  description: string;
  allDay: boolean;
  startAt: Date | null;
  endAt: Date | null;
  completed: boolean;
}

@Component({
  imports: [
    FormField,
    MatButton,
    MatCheckbox,
    MatDatepicker,
    MatDatepickerInput,
    MatDatepickerToggle,
    MatIcon,
    MatIconButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatInput,
    MatLabel,
    MatSuffix,
    MatTimepicker,
    MatTimepickerInput,
    MatTimepickerToggle,
    TranslocoPipe,
  ],
  selector: 'app-event-create-edit-dialog',
  styleUrl: './event-create-edit-dialog.scss',
  templateUrl: './event-create-edit-dialog.html',
})
export class EventCreateEditDialog {
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef =
    inject<MatDialogRef<EventCreateEditDialog, EventDialogResult>>(MatDialogRef);
  private readonly transloco = inject(TranslocoService);

  readonly data = inject<EventDialogData>(MAT_DIALOG_DATA);
  private readonly initialFormSnapshot: EventFormModel = this.initialForm();
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
      const allDay = context.valueOf(schema.allDay);

      if (!start) return null;
      if (!end) return null;

      const isValid = allDay ? end >= start : end > start;
      return isValid ? null : { kind: 'endBeforeStart' };
    });
  });

  constructor() {
    this.dialogRef.disableClose = true;

    merge(
      this.dialogRef.backdropClick(),
      this.dialogRef.keydownEvents().pipe(filter(event => event.key === 'Escape')),
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.cancel());
  }

  save(): void {
    const form = this.eventForm().value();

    if (this.eventForm().invalid() || !form.startAt) {
      this.eventForm().markAsTouched();
      return;
    }

    const payload = {
      ...form,
      ...toEventApiDates({ ...form, startAt: form.startAt }),
    };

    if (this.data.mode === 'update') {
      this.dialogRef.close({ action: 'update', eventId: this.data.event.id, payload });
    } else {
      this.dialogRef.close({ action: 'create', payload });
    }
  }

  remove(): void {
    if (this.data.mode !== 'update') return;
    this.dialogRef.close({ action: 'delete', eventId: this.data.event.id });
  }

  addTime(): void {
    this.model.update(form => ({
      ...form,
      allDay: false,
      endAt:
        form.startAt && (!form.endAt || form.endAt <= form.startAt)
          ? new Date(form.startAt.getTime() + HOUR_MS)
          : form.endAt,
    }));
  }

  removeTime(): void {
    this.model.update(form => ({
      ...form,
      allDay: true,
      startAt: form.startAt ? startOfDay(form.startAt) : null,
      endAt: null,
    }));
  }

  cancel() {
    if (JSON.stringify(this.model()) !== JSON.stringify(this.initialFormSnapshot)) {
      ConfirmDialog.open(this.dialog, {
        title: this.transloco.translate('event.discardTitle'),
        message: this.transloco.translate('event.discardMessage'),
        confirmText: this.transloco.translate('event.discard'),
      })
        .pipe()
        .subscribe(() => this.dialogRef.close());
      return;
    }
    this.dialogRef.close();
  }

  private initialForm(): EventFormModel {
    if (this.data.mode === 'update') {
      return {
        title: this.data.event.title,
        description: this.data.event.description ?? '',
        allDay: this.data.event.allDay ?? false,
        ...toEventFormDates(this.data.event),
        completed: this.data.event.completedAt !== null,
      };
    } else {
      return {
        title: '',
        description: '',
        allDay: true,
        startAt: new Date(`${this.data.date}T00:00:00`),
        endAt: null,
        completed: false,
      };
    }
  }
}
