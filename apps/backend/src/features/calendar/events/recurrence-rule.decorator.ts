import rrule from 'rrule';
import { ValidateBy, ValidationOptions } from 'class-validator';
import {
  RECURRENCE_FREQUENCIES,
  RECURRENCE_KEYS,
  RECURRENCE_NUMBER_MAX,
  RECURRENCE_RULE_MAX,
} from './event.constants.js';

const { RRule } = rrule;

export function isRecurrenceRule(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > RECURRENCE_RULE_MAX) return false;

  const parts = new Map<string, string>();

  for (const part of value.split(';')) {
    const [key, partValue, ...rest] = part.split('=');
    if (!key || !partValue || rest.length || parts.has(key)) return false;
    if (!RECURRENCE_KEYS.includes(key)) return false;
    parts.set(key, partValue);
  }

  const freq = parts.get('FREQ');
  if (!freq || !RECURRENCE_FREQUENCIES.includes(freq)) return false;
  if (parts.has('COUNT') && parts.has('UNTIL')) return false;

  for (const key of ['INTERVAL', 'COUNT']) {
    const number = parts.get(key);
    if (number === undefined) continue;
    if (!/^\d+$/.test(number)) return false;
    if (Number(number) < 1 || Number(number) > RECURRENCE_NUMBER_MAX) return false;
  }

  try {
    new RRule(RRule.parseString(value));
    return true;
  } catch {
    return false;
  }
}

export const IsRecurrenceRule = (options?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'isRecurrenceRule',
      validator: {
        validate: isRecurrenceRule,
        defaultMessage: () =>
          '$property must be an RRULE (RFC 5545) with FREQ DAILY, WEEKLY, MONTHLY or YEARLY',
      },
    },
    options,
  );
