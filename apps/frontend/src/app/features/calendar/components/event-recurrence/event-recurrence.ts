import { Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import { MatFormField, MatInput, MatLabel, MatSuffix } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { addMonths } from 'date-fns';
import { LanguageService } from '../../../../shared/services/language.service';
import {
  EMPTY_RECURRENCE,
  RECURRENCE_COUNT_MAX,
  RECURRENCE_ENDS,
  RECURRENCE_PRESETS,
  WEEKDAYS,
} from '../../constants/recurrence.constants';
import {
  RecurrenceEnd,
  RecurrenceForm,
  RecurrencePreset,
  Weekday,
} from '../../models/recurrence';
import { fromRecurrenceRule, toRecurrenceRule } from '../../utils/recurrence-rule';

interface RecurrenceText {
  key: string;
  params: Record<string, string | number>;
}

const REFERENCE_MONDAY = new Date(2024, 0, 1);

@Component({
  selector: 'app-event-recurrence',
  imports: [
    MatButtonToggle,
    MatButtonToggleGroup,
    MatDatepicker,
    MatDatepickerInput,
    MatDatepickerToggle,
    MatFormField,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    MatSuffix,
    TranslocoPipe,
  ],
  templateUrl: './event-recurrence.html',
  styleUrl: './event-recurrence.scss',
})
export class EventRecurrence {
  // DEPENDENCIES
  private readonly languageService = inject(LanguageService);

  // INPUTS
  readonly rule = input<string | null>(null);
  readonly startAt = input.required<string>();
  readonly editable = input(true);
  readonly ruleChange = output<string | null>();

  // STATE
  readonly presets = RECURRENCE_PRESETS;
  readonly ends = RECURRENCE_ENDS;
  readonly weekdays = WEEKDAYS;
  readonly countMax = RECURRENCE_COUNT_MAX;

  // COMPUTED
  readonly recurrence = linkedSignal<RecurrenceForm>(() =>
    fromRecurrenceRule(this.rule()),
  );

  readonly isRepeating = computed(() => this.recurrence().preset !== 'none');

  readonly untilMin = computed(() => new Date(this.startAt()));

  readonly summary = computed<RecurrenceText[]>(() => {
    const form = this.recurrence();
    if (form.preset === 'none') return [];

    const start = new Date(this.startAt());
    const lang = this.languageService.lang();
    const weekday = (date: Date) =>
      new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(date);

    const texts: RecurrenceText[] = [
      {
        key: `event.recurrence.summary.${form.preset}`,
        params: {
          day: form.preset === 'monthly' ? start.getDate() : weekday(start),
          date: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(
            start,
          ),
          days: form.days
            .map(day =>
              new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(
                this.weekdayDate(day),
              ),
            )
            .join(', '),
        },
      },
    ];

    if (form.end === 'count') {
      texts.push({
        key: 'event.recurrence.summary.count',
        params: { count: form.count },
      });
    }
    if (form.end === 'until' && form.until) {
      texts.push({
        key: 'event.recurrence.summary.until',
        params: {
          date: new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(form.until),
        },
      });
    }

    return texts;
  });

  // ACTIONS
  setPreset(preset: RecurrencePreset): void {
    const form = this.recurrence();

    if (preset === 'none') {
      this.emit(EMPTY_RECURRENCE);
      return;
    }

    this.emit({
      ...form,
      preset,
      days:
        preset === 'weeklyDays' && !form.days.length
          ? [this.weekdayOf(new Date(this.startAt()))]
          : form.days,
    });
  }

  setDays(days: Weekday[]): void {
    if (!days.length) {
      this.recurrence.update(form => ({ ...form, days: [...form.days] }));
      return;
    }
    this.emit({ ...this.recurrence(), days });
  }

  setEnd(end: RecurrenceEnd): void {
    const form = this.recurrence();
    this.emit({
      ...form,
      end,
      until: end === 'until' && !form.until ? addMonths(this.untilMin(), 1) : form.until,
    });
  }

  setUntil(until: Date | null): void {
    if (!until) return;
    this.emit({ ...this.recurrence(), until });
  }

  setCount(count: number): void {
    if (Number.isNaN(count)) return;
    this.emit({
      ...this.recurrence(),
      count: Math.min(Math.max(Math.round(count), 1), this.countMax),
    });
  }

  private emit(form: RecurrenceForm): void {
    this.recurrence.set(form);
    const rule = toRecurrenceRule(form);
    if (rule !== this.rule()) this.ruleChange.emit(rule);
  }

  // HELPERS
  private weekdayOf(date: Date): Weekday {
    return WEEKDAYS[(date.getDay() + 6) % 7];
  }

  private weekdayDate(day: Weekday): Date {
    const date = new Date(REFERENCE_MONDAY);
    date.setDate(date.getDate() + WEEKDAYS.indexOf(day));
    return date;
  }
}
