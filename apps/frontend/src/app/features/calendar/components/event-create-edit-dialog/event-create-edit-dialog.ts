import { Component, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
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
import { concatMap, debounceTime, filter, map, takeUntil, tap } from 'rxjs';
import { EventDto, EventUpdateDto } from '../../../../api/generated';
import { DESCRIPTION_MAX, HOUR_MS, TITLE_MAX } from '../../constants/event.constants';
import { EventDialogData } from '../../models/event-dialog';
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
  private readonly dialogRef = inject<MatDialogRef<EventCreateEditDialog>>(MatDialogRef);
  private readonly transloco = inject(TranslocoService);

  readonly data = inject<EventDialogData>(MAT_DIALOG_DATA);

  // STATE
  private readonly model = signal(this.toFormModel(this.data.event));
  private readonly saved = signal(this.data.event);

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

  // LIFECYCLE
  constructor() {
    this.autosave();
  }

  // EFFECTS
  private autosave(): void {
    if (!this.data.editable) return;

    toObservable(this.model)
      .pipe(
        takeUntil(this.dialogRef.beforeClosed()),
        debounceTime(500),
        map(model => this.changes(model, this.saved())),
        filter(payload => Object.keys(payload).length > 0),
        concatMap(payload =>
          this.data
            .update(payload, () => this.model.set(this.toFormModel(this.saved())))
            .pipe(tap(event => this.saved.set(event))),
        ),
      )
      .subscribe();
  }

  // ACTIONS
  remove(): void {
    this.data.remove().subscribe(() => this.dialogRef.close());
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

  close(): void {
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

  private changes(model: EventFormModel, saved: EventDto): EventUpdateDto {
    const payload: EventUpdateDto = {};

    if (model.title !== saved.title) payload.title = model.title;
    if (model.description !== (saved.description ?? '')) {
      payload.description = model.description;
    }
    if (model.completed !== (saved.completedAt !== null)) {
      payload.completed = model.completed;
    }

    if (model.startAt && this.eventForm.endAt().errors().length === 0) {
      const dates = toEventApiDates({
        allDay: model.allDay,
        startAt: model.startAt,
        endAt: model.endAt,
      });
      if (
        dates.allDay !== saved.allDay ||
        dates.startAt !== saved.startAt ||
        dates.endAt !== saved.endAt
      ) {
        Object.assign(payload, dates);
      }
    }

    return payload;
  }
}
