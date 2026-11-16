import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatInput, MatLabel } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, concatMap, EMPTY, finalize, Subject, tap } from 'rxjs';
import { EventReminderUpdateDto } from '../../../../api/generated';
import { PushNotificationsService } from '../../../../shared/services/push-notifications.service';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { NotificationApiService } from '../../services/notification-api.service';

@Component({
  selector: 'app-event-reminder',
  imports: [
    MatButton,
    MatFormField,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
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
  readonly allDay = input.required<boolean>();
  readonly editable = input(true);
  readonly recurring = input(false);

  // STATE
  protected readonly options = [0, 5, 15, 30, 60, 1440, 10080];
  protected readonly localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private readonly saves = new Subject<{
    eventId: string;
    payload: EventReminderUpdateDto;
  }>();
  private readonly savingCount = signal(0);
  protected readonly saveError = signal(false);
  private readonly customSelected = signal(false);
  protected readonly minutesInvalid = signal(false);
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

  // LIFECYCLE
  constructor() {
    this.saveChanges();
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

  // ACTIONS
  protected select(value: number): void {
    if (value === -2) {
      this.customSelected.set(true);
      this.change({ enabled: true });
      return;
    }
    this.customSelected.set(false);
    this.minutesInvalid.set(false);
    this.change(
      value === -1 ? { enabled: false } : { enabled: true, minutesBefore: value },
    );
  }

  protected setMinutes(value: string): void {
    const minutesBefore = Number(value);
    const valid =
      value.trim() !== '' &&
      Number.isInteger(minutesBefore) &&
      minutesBefore >= 0 &&
      minutesBefore <= 10080;
    this.minutesInvalid.set(!valid);
    if (!valid) return;
    this.change({ minutesBefore });
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

  protected async togglePush(): Promise<void> {
    try {
      if (this.push.enabled()) await this.push.disable();
      else await this.push.enable();
    } catch {
      this.snackbar.error(this.transloco.translate('reminder.deviceError'));
    }
  }

  private change(patch: Partial<EventReminderUpdateDto>): void {
    if (!this.editable() || this.saving()) return;
    this.model.update(value => ({ ...value, ...patch }));
    this.savingCount.update(value => value + 1);
    this.saves.next({ eventId: this.eventId(), payload: this.model() });
  }
}
