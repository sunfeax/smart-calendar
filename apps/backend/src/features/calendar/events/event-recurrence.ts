import rrule from 'rrule';
import { ONE_DAY_MS } from '../../../common/constants.js';

const { RRule } = rrule;

export interface Series {
  startAt: Date;
  endAt: Date;
  recurrenceRule: string;
  timeZone: string | null;
}

export interface Occurrence {
  startAt: Date;
  endAt: Date;
}

export function expandSeries(
  series: Series,
  from: Date,
  to: Date,
  limit: number,
): Occurrence[] {
  const duration = series.endAt.getTime() - series.startAt.getTime();
  const rule = new RRule({
    ...RRule.parseString(series.recurrenceRule),
    dtstart: toWallClock(series.startAt, series.timeZone),
  });

  const after = new Date(from.getTime() - duration - ONE_DAY_MS);
  const before = new Date(to.getTime() + ONE_DAY_MS);

  return rule
    .between(after, before, true, (_, index) => index < limit)
    .map(start => {
      const startAt = fromWallClock(start, series.timeZone);
      return { startAt, endAt: new Date(startAt.getTime() + duration) };
    })
    .filter(occurrence => occurrence.startAt < to && occurrence.endAt > from);
}

export function isOccurrence(series: Series, originalStart: Date): boolean {
  const to = new Date(originalStart.getTime() + 1);
  return expandSeries(series, originalStart, to, 1000).some(
    occurrence => occurrence.startAt.getTime() === originalStart.getTime(),
  );
}

export function countBefore(series: Series, originalStart: Date): number {
  return expandSeries(series, series.startAt, originalStart, Number.MAX_SAFE_INTEGER)
    .length;
}

export function ruleEndingBefore(series: Series, originalStart: Date): string {
  const parts = parseRule(series.recurrenceRule);

  if (parts.has('COUNT')) {
    parts.set('COUNT', String(countBefore(series, originalStart)));
  } else {
    const lastWall = toWallClock(
      new Date(originalStart.getTime() - 1000),
      series.timeZone,
    );
    parts.set('UNTIL', formatRuleDate(lastWall));
  }

  return formatRule(parts);
}

export function ruleStartingAt(series: Series, originalStart: Date): string {
  const parts = parseRule(series.recurrenceRule);
  const count = parts.get('COUNT');

  if (count) {
    parts.set('COUNT', String(Number(count) - countBefore(series, originalStart)));
  }

  return formatRule(parts);
}

export function toWallClock(date: Date, timeZone: string | null): Date {
  if (!timeZone) return date;

  const parts = Object.fromEntries(
    createFormatter(timeZone)
      .formatToParts(date)
      .map(part => [part.type, Number(part.value)]),
  );

  return new Date(
    Date.UTC(
      parts['year'],
      parts['month'] - 1,
      parts['day'],
      parts['hour'],
      parts['minute'],
      parts['second'],
      date.getUTCMilliseconds(),
    ),
  );
}

export function fromWallClock(wall: Date, timeZone: string | null): Date {
  if (!timeZone) return wall;

  const offsetAt = (date: Date) => toWallClock(date, timeZone).getTime() - date.getTime();
  const guess = new Date(wall.getTime() - offsetAt(wall));
  return new Date(wall.getTime() - offsetAt(guess));
}

function createFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
}

function parseRule(rule: string): Map<string, string> {
  const parts = new Map<string, string>();

  for (const part of rule.split(';')) {
    const [key, value] = part.split('=');
    if (key && value) parts.set(key, value);
  }

  return parts;
}

function formatRule(parts: Map<string, string>): string {
  return [...parts].map(([key, value]) => `${key}=${value}`).join(';');
}

function formatRuleDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}
