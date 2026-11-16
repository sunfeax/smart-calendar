import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { disabled, form, FormField, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatInput, MatLabel, MatSuffix } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import {
  MatTimepicker,
  MatTimepickerInput,
  MatTimepickerToggle,
} from '@angular/material/timepicker';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  differenceInCalendarDays,
  differenceInMinutes,
  endOfDay,
  format,
  isValid,
  set,
  setHours,
  setMinutes,
  subDays,
  subMinutes,
} from 'date-fns';
import { catchError, concatMap, EMPTY, filter, finalize, map, Subject, tap } from 'rxjs';
import { EventReminderUpdateDto } from '../../../../api/generated';
import { PushNotificationsService } from '../../../../shared/services/push-notifications.service';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { TIME_STEP_MINUTES } from '../../constants/event.constants';
import { NotificationApiService } from '../../services/notification-api.service';
import { fromAllDayIso } from '../../utils/event.mapper';

const REMINDER_MAX_MINUTES = 10080;
const REMINDER_MAX_DAYS = REMINDER_MAX_MINUTES / 1440;

@Component({
  selector: 'app-event-reminder',
  imports: [
    FormField,
    MatButton,
    MatDatepicker,
    MatDatepickerInput,
    MatDatepickerToggle,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    MatSuffix,
    MatTimepicker,
    MatTimepickerInput,
    MatTimepickerToggle,
    TranslocoPipe,
  ],
  templateUrl: './event-reminder.html',
  styleUrl: './event-reminder.scss',
})
export class EventReminder {
  // DEPENDENCIES
  private readonly api = inject(NotificationApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackbar = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);
  protected readonly push = inject(PushNotificationsService);

  // INPUTS
  readonly eventId = input.required<string>();
  readonly startAt = input.required<string>();
  readonly allDay = input.required<boolean>();
  readonly editable = input(true);
  readonly recurring = input(false);

  // STATE
  protected readonly options = [0, 5, 15, 30, 60, 1440, 10080];
  protected readonly timeStep = `${TIME_STEP_MINUTES}m`;
  protected readonly localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private readonly saves = new Subject<{
    eventId: string;
    payload: EventReminderUpdateDto;
  }>();
  private readonly savingCount = signal(0);
  protected readonly saveError = signal(false);
  private readonly customSelected = signal(false);
  protected readonly timeInvalid = signal(false);

  // DATA
  protected readonly reminder = rxResource({
    params: () => this.eventId(),
    stream: ({ params }) => this.api.getReminder(params),
  });

  // COMPUTED
  protected readonly model = linkedSignal<EventReminderUpdateDto>(() => {
    const value = this.reminder.value();
    return value
      ? { ...value, timeZone: value.enabled ? value.timeZone : this.localTimeZone }
      : {
          enabled: false,
          minutesBefore: 15,
          allDayTime: '09:00',
          timeZone: this.localTimeZone,
        };
  });
  protected readonly custom = computed(
    () => this.customSelected() || !this.options.includes(this.model().minutesBefore),
  );
  protected readonly saving = computed(() => this.savingCount() > 0);
  protected readonly selected = computed(() =>
    !this.model().enabled ? -1 : this.custom() ? -2 : this.model().minutesBefore,
  );

  private readonly eventDay = computed(() => fromAllDayIso(this.startAt()));
  protected readonly latest = computed(() =>
    this.allDay() ? endOfDay(this.eventDay()) : new Date(this.startAt()),
  );
  protected readonly earliest = computed(() =>
    this.allDay()
      ? subDays(this.eventDay(), REMINDER_MAX_DAYS)
      : subMinutes(new Date(this.startAt()), REMINDER_MAX_MINUTES),
  );
  private readonly remindAt = computed(() => {
    const { allDayTime, minutesBefore } = this.model();
    const [hours, minutes] = allDayTime.split(':').map(Number);
    const anchor = this.allDay()
      ? setMinutes(setHours(this.eventDay(), hours), minutes)
      : new Date(this.startAt());
    return subMinutes(anchor, minutesBefore);
  });

  private readonly customModel = linkedSignal(() => ({
    date: this.remindAt(),
    time: this.remindAt(),
  }));
  protected readonly customForm = form(this.customModel, schema => {
    disabled(schema, { when: () => !this.editable() || this.saving() });
    validate(schema.time, context =>
      isValid(context.value()) ? null : { kind: 'invalid' },
    );
    validate(schema.date, context =>
      this.validateAt(this.combine(context.value(), context.valueOf(schema.time))),
    );
  });
  protected readonly customError = computed(
    () => this.customForm.date().errors()[0] ?? this.customForm.time().errors()[0],
  );

  // LIFECYCLE
  constructor() {
    this.saveChanges();
    this.saveCustomTime();
  }

  // EFFECTS
  private saveChanges(): void {
    this.saves
      .pipe(
        concatMap(({ eventId, payload }) =>
          this.api.updateReminder(eventId, payload).pipe(
            tap(saved => {
              this.saveError.set(false);
              if (
                !this.destroyRef.destroyed &&
                this.eventId() === eventId &&
                this.model() === payload
              )
                this.reminder.update(() => saved);
            }),
            catchError(() => {
              this.saveError.set(true);
              this.snackbar.error(this.transloco.translate('reminder.saveError'));
              return EMPTY;
            }),
            finalize(() => this.savingCount.update(value => value - 1)),
          ),
        ),
      )
      .subscribe();
    this.destroyRef.onDestroy(() => this.saves.complete());
  }

  private saveCustomTime(): void {
    toObservable(this.customModel)
      .pipe(
        filter(() => this.custom() && !this.customError()),
        map(({ date, time }) => this.combine(date, time)),
        filter((at): at is Date => at !== null && +at !== +this.remindAt()),
        map(at => this.toPatch(at)),
        takeUntilDestroyed(),
      )
      .subscribe(patch => this.change(patch));
  }

  // ACTIONS
  protected select(value: number): void {
    if (value !== -1) this.requestPush();
    if (value === -2) {
      this.customSelected.set(true);
      this.change({ enabled: true });
      return;
    }
    this.customSelected.set(false);
    this.change(
      value === -1 ? { enabled: false } : { enabled: true, minutesBefore: value },
    );
  }

  protected setTime(value: string): void {
    const valid = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    this.timeInvalid.set(!valid);
    if (valid) this.change({ allDayTime: value });
  }

  protected useLocalTimeZone(): void {
    this.change({ timeZone: this.localTimeZone });
  }

  protected retry(): void {
    this.change({});
  }

  protected remove(): void {
    this.select(-1);
  }

  protected async enablePush(): Promise<void> {
    try {
      await this.push.enable();
    } catch {
      this.snackbar.error(this.transloco.translate('reminder.deviceError'));
    }
  }

  private requestPush(): void {
    if (
      !this.push.available() ||
      this.push.enabled() ||
      this.push.blocked() ||
      this.push.pending()
    )
      return;
    void this.enablePush();
  }

  private change(patch: Partial<EventReminderUpdateDto>): void {
    if (!this.editable() || this.saving()) return;
    this.model.update(value => ({ ...value, ...patch }));
    this.savingCount.update(value => value + 1);
    this.saves.next({ eventId: this.eventId(), payload: this.model() });
  }

  // HELPERS
  private combine(date: Date | null, time: Date | null): Date | null {
    if (!date || !time || !isValid(date) || !isValid(time)) return null;
    return set(date, {
      hours: time.getHours(),
      minutes: time.getMinutes(),
      seconds: 0,
      milliseconds: 0,
    });
  }

  private validateAt(at: Date | null): { kind: string } | null {
    if (!at || !isValid(at)) return { kind: 'invalid' };
    if (at > this.latest()) return { kind: 'afterEvent' };
    if (at < this.earliest()) return { kind: 'tooEarly' };
    return null;
  }

  private toPatch(at: Date): Partial<EventReminderUpdateDto> {
    if (!this.allDay()) {
      return { minutesBefore: differenceInMinutes(new Date(this.startAt()), at) };
    }
    return {
      allDayTime: format(at, 'HH:mm'),
      minutesBefore: differenceInCalendarDays(this.eventDay(), at) * 1440,
      timeZone: this.localTimeZone,
    };
  }
}
