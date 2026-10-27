import { Component, inject, signal } from '@angular/core';
import {
  disabled,
  form,
  FormField,
  maxLength,
  required,
  validate,
} from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import {
  MatDatepickerToggle,
  MatDateRangeInput,
  MatDateRangePicker,
  MatEndDate,
  MatStartDate,
} from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
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
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { startOfDay } from 'date-fns';
import { DESCRIPTION_MAX, HOUR_MS, TITLE_MAX } from '../../constants/event.constants';
import { EventDto } from '../../../../api/generated';
import { EventDialogData, EventDialogResult } from '../../models/event-dialog';
import { toEventFormDates } from '../../utils/event.mapper';

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
    MatDatepickerToggle,
    MatDateRangeInput,
    MatDateRangePicker,
    MatEndDate,
    MatIcon,
    MatIconButton,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatInput,
    MatLabel,
    MatStartDate,
    MatSuffix,
    MatTimepicker,
    MatTimepickerInput,
    MatTimepickerToggle,
    MatTooltip,
    TranslocoPipe,
  ],
  selector: 'app-event-create-edit-dialog',
  styleUrl: './event-create-edit-dialog.scss',
  templateUrl: './event-create-edit-dialog.html',
})
export class EventCreateEditDialog {
  // DEPENDENCIES
  private readonly dialogRef =
    inject<MatDialogRef<EventCreateEditDialog, EventDialogResult>>(MatDialogRef);
  private readonly transloco = inject(TranslocoService);

  readonly data = inject<EventDialogData>(MAT_DIALOG_DATA);

  // STATE
  private readonly model = signal(this.toFormModel(this.data.event));

  eventForm = form(this.model, schema => {
    disabled(schema, { when: () => !this.data.editable });
    required(schema.startAt);
    maxLength(schema.title, TITLE_MAX);
    maxLength(schema.description, DESCRIPTION_MAX);
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

  // ACTIONS
  remove(): void {
    this.dialogRef.close({ action: 'delete' });
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
    this.dialogRef.close();
  }

  // HELPERS
  private toFormModel(event: EventDto): EventFormModel {
    return {
      title: event.title,
      description: event.description ?? '',
      allDay: event.allDay,
      ...toEventFormDates(event),
      completed: event.completedAt !== null,
    };
  }
}
