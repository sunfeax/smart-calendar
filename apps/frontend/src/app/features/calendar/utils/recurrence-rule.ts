import { format, parse } from 'date-fns';
import {
  EMPTY_RECURRENCE,
  RECURRENCE_COUNT_DEFAULT,
  WEEKDAYS,
} from '../constants/recurrence.constants';
import { RecurrenceForm, RecurrencePreset, Weekday } from '../models/recurrence';

export function toRecurrenceRule(form: RecurrenceForm): string | null {
  const parts: string[] = [];

  switch (form.preset) {
    case 'none':
      return null;
    case 'daily':
      parts.push('FREQ=DAILY');
      break;
    case 'weekly': {
      const days = WEEKDAYS.filter(day => form.days.includes(day));
      parts.push('FREQ=WEEKLY', ...(days.length ? [`BYDAY=${days.join(',')}`] : []));
      break;
    }
    case 'monthly':
      parts.push('FREQ=MONTHLY');
      break;
    case 'yearly':
      parts.push('FREQ=YEARLY');
      break;
  }

  if (form.end === 'count') parts.push(`COUNT=${form.count}`);
  if (form.end === 'until' && form.until) {
    parts.push(`UNTIL=${format(form.until, "yyyyMMdd'T235959Z'")}`);
  }

  return parts.join(';');
}

export function fromRecurrenceRule(rule: string | null): RecurrenceForm {
  if (!rule) return EMPTY_RECURRENCE;

  const parts = new Map(
    rule.split(';').map(part => part.split('=') as [string, string | undefined]),
  );
  const days = (parts.get('BYDAY')?.split(',') ?? []).filter(isWeekday);
  const preset = toPreset(parts.get('FREQ'));
  const count = parts.get('COUNT');
  const until = parts.get('UNTIL');

  return {
    preset,
    days: preset === 'weekly' ? days : [],
    end: count ? 'count' : until ? 'until' : 'never',
    until: until ? parse(until.slice(0, 8), 'yyyyMMdd', new Date()) : null,
    count: count ? Number(count) : RECURRENCE_COUNT_DEFAULT,
  };
}

function toPreset(freq: string | undefined): RecurrencePreset {
  switch (freq) {
    case 'DAILY':
      return 'daily';
    case 'WEEKLY':
      return 'weekly';
    case 'MONTHLY':
      return 'monthly';
    case 'YEARLY':
      return 'yearly';
    default:
      return 'none';
  }
}

function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}
