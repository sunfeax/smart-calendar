import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
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
import { TranslocoPipe } from '@jsverse/transloco';
import {
  addMinutes,
  differenceInMinutes,
  isSameDay,
  isValid,
  startOfDay,
} from 'date-fns';
import {
  concatMap,
  debounceTime,
  EMPTY,
  from,
  Observable,
  of,
  Subject,
  takeUntil,
  tap,
} from 'rxjs';
import { EventDto, EventUpdateDto } from '../../../../api/generated';
import {
  AUTOSAVE_DELAY_MS,
  DESCRIPTION_MAX,
  HOUR_MS,
  TIME_STEP_MINUTES,
  TITLE_MAX,
} from '../../constants/event.constants';
import { EventDialogData } from '../../models/event-dialog';
import { TagCreateRequest } from '../../models/tag-create-request';
import { toEventApiDates, toEventFormDates } from '../../utils/event.mapper';
import { EventTags } from '../event-tags/event-tags';

interface EventFormValidity {
  title: boolean;
  description: boolean;
  dates: boolean;
}

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
    EventTags,
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
  selector: 'app-event-edit-dialog',
  styleUrl: './event-edit-dialog.scss',
  templateUrl: './event-edit-dialog.html',
})
export class EventEditDialog {
  // DEPENDENCIES
  private readonly dialogRef = inject<MatDialogRef<EventEditDialog>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = inject<EventDialogData>(MAT_DIALOG_DATA);

  // STATE
  readonly timeStep = `${TIME_STEP_MINUTES}m`;
  private readonly model = signal(this.toFormModel(this.data.event));
  private readonly saved = signal(this.data.event);
  private readonly mutations = new Subject<() => Observable<unknown>>();
  private deleted = false;
  private closing = false;

  readonly eventForm = form(this.model, schema => {
    disabled(schema, { when: () => !this.data.editable });
    required(schema.startAt);
    maxLength(schema.title, TITLE_MAX);
    maxLength(schema.description, DESCRIPTION_MAX);
    validate(schema.endAt, context => {
      const end = context.value();
      const start = context.valueOf(schema.startAt);
      const allDay = context.valueOf(schema.allDay);

      if (!start || !end || !isValid(start) || !isValid(end)) return null;

      if (allDay) return end >= start ? null : { kind: 'endBeforeStart' };
      return differenceInMinutes(end, start) >= TIME_STEP_MINUTES
        ? null
        : { kind: 'durationTooShort' };
    });
  });

  // COMPUTED
  readonly tagIds = computed(() => this.saved().tagIds);

  readonly endTimeMin = computed(() => {
    const { startAt, endAt } = this.model();
    if (!startAt || !endAt || !isSameDay(startAt, endAt)) return null;
    return addMinutes(startAt, TIME_STEP_MINUTES);
  });

  // LIFECYCLE
  constructor() {
    this.keepDuration();
    this.runMutations();
    this.autosave();
    this.saveOnClose();
  }

  // EFFECTS
  private runMutations(): void {
    this.mutations
      .pipe(concatMap(request => (this.deleted ? EMPTY : request())))
      .subscribe();
    this.destroyRef.onDestroy(() => this.mutations.complete());
  }

  private saveOnClose(): void {
    this.dialogRef.beforeClosed().subscribe(() => {
      this.closing = true;
      this.queueFormSave(this.model());
      this.mutations.complete();
    });
  }

  private keepDuration(): void {
    let previous = this.model();

    effect(() => {
      const current = this.model();
      const { startAt, endAt } = current;
      const { startAt: prevStart, endAt: prevEnd } = previous;
      previous = current;

      if (
        !prevStart ||
        !startAt ||
        !endAt ||
        endAt !== prevEnd ||
        !isValid(prevStart) ||
        !isValid(startAt) ||
        !isValid(endAt)
      )
        return;

      const shift = startAt.getTime() - prevStart.getTime();
      if (shift === 0) return;

      this.model.update(form => ({ ...form, endAt: new Date(endAt.getTime() + shift) }));
    });
  }

  private autosave(): void {
    if (!this.data.editable) return;

    toObservable(this.model)
      .pipe(debounceTime(AUTOSAVE_DELAY_MS), takeUntil(this.dialogRef.beforeClosed()))
      .subscribe(model => this.queueFormSave(model));
  }

  // ACTIONS
  remove(): void {
    this.mutations.next(() =>
      this.closing
        ? EMPTY
        : this.data.remove().pipe(
            tap(() => {
              this.deleted = true;
              this.dialogRef.close();
            }),
          ),
    );
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

  setTag(tagId: string): void {
    this.mutations.next(() =>
      this.data
        .setTag(tagId, !this.saved().tagIds.includes(tagId))
        .pipe(tap(event => this.saved.set(event))),
    );
  }

  createTag({ categoryId, payload }: TagCreateRequest): void {
    this.mutations.next(() => {
      const existing = this.data.categories
        .value()
        ?.find(category => category.id === categoryId)
        ?.tags.find(tag => tag.name.toLowerCase() === payload.name.toLowerCase());
      return (existing ? of(existing) : this.data.createTag(categoryId, payload)).pipe(
        concatMap(tag => this.data.setTag(tag.id, true)),
        tap(event => this.saved.set(event)),
      );
    });
  }

  detachCategory(categoryId: string): void {
    this.mutations.next(() => {
      const category = this.data.categories.value()?.find(item => item.id === categoryId);
      const tagIds =
        category?.tags
          .filter(tag => this.saved().tagIds.includes(tag.id))
          .map(tag => tag.id) ?? [];
      return from(tagIds).pipe(
        concatMap(tagId => this.data.setTag(tagId, false)),
        tap(event => this.saved.set(event)),
      );
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  private queueFormSave(model: EventFormModel): void {
    if (!this.data.editable || this.deleted) return;
    const valid: EventFormValidity = {
      title: !this.eventForm.title().invalid(),
      description: !this.eventForm.description().invalid(),
      dates: !this.eventForm.startAt().invalid() && !this.eventForm.endAt().invalid(),
    };

    this.mutations.next(() => {
      const payload = this.changes(model, this.saved(), valid);
      if (Object.keys(payload).length === 0) return EMPTY;
      return this.data
        .update(payload, () => {
          if (this.model() === model) {
            this.model.set(this.toFormModel(this.saved()));
          }
        })
        .pipe(tap(event => this.saved.set(event)));
    });
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

  private changes(
    model: EventFormModel,
    saved: EventDto,
    valid: EventFormValidity,
  ): EventUpdateDto {
    const payload: EventUpdateDto = {};

    if (valid.title && model.title.trim() !== saved.title)
      payload.title = model.title.trim();
    if (valid.description && model.description !== (saved.description ?? '')) {
      payload.description = model.description;
    }
    if (model.completed !== (saved.completedAt !== null)) {
      payload.completed = model.completed;
    }

    if (
      valid.dates &&
      model.startAt &&
      isValid(model.startAt) &&
      (!model.endAt || isValid(model.endAt))
    ) {
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
