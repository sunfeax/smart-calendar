import {
  RecurrenceEnd,
  RecurrenceForm,
  RecurrencePreset,
  RecurrenceScope,
  Weekday,
} from '../models/recurrence';

export const RECURRENCE_PRESETS: readonly RecurrencePreset[] = [
  'none',
  'daily',
  'weekdays',
  'weekly',
  'weeklyDays',
  'monthly',
  'yearly',
];

export const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export const WORKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

export const RECURRENCE_ENDS: readonly RecurrenceEnd[] = ['never', 'until', 'count'];

export const RECURRENCE_SCOPES: readonly RecurrenceScope[] = ['this', 'following', 'all'];

export const RECURRENCE_COUNT_DEFAULT = 10;
export const RECURRENCE_COUNT_MAX = 1000;

export const EMPTY_RECURRENCE: RecurrenceForm = {
  preset: 'none',
  days: [],
  end: 'never',
  until: null,
  count: RECURRENCE_COUNT_DEFAULT,
};
