export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type RecurrenceEnd = 'never' | 'until' | 'count';

export type RecurrenceScope = 'this' | 'following' | 'all';

export interface OccurrenceTarget {
  id: string;
  originalStart: string | null;
  scope: RecurrenceScope | null;
}

export interface RecurrenceForm {
  preset: RecurrencePreset;
  days: Weekday[];
  end: RecurrenceEnd;
  until: Date | null;
  count: number;
}
