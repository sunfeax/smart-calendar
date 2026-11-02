import rrule from 'rrule';
import { ONE_DAY_MS } from '../../../common/constants.js';

const { RRule } = rrule;

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

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

export interface MovedSeries extends Series {
  cancelledStarts: Date[];
}

export function moveSeries(
  series: Series,
  originalStart: Date,
  startAt: Date,
  duration: number,
  timeZone: string | null,
  cancelledStarts: Date[] = [],
): MovedSeries {
  const originalWall = toWallClock(originalStart, series.timeZone);
  const nextWall = toWallClock(startAt, timeZone);
  const shift = nextWall.getTime() - originalWall.getTime();
  const days =
    Math.floor(+nextWall / ONE_DAY_MS) - Math.floor(+originalWall / ONE_DAY_MS);
  const rule = ruleWithMovedDay(series.recurrenceRule, originalWall, days);
  const changesWeekday = rule !== series.recurrenceRule;
  const timeShift = shift - (changesWeekday ? days * ONE_DAY_MS : 0);
  const options = RRule.parseString(series.recurrenceRule);
  const oldRule = new RRule({
    ...options,
    dtstart: toWallClock(series.startAt, series.timeZone),
  });
  const cancelled = new Set(
    cancelledStarts.map(date => +toWallClock(date, series.timeZone)),
  );
  const move = (wall: Date) =>
    new Date(
      +wall +
        (changesWeekday && wall.getUTCDay() !== originalWall.getUTCDay()
          ? timeShift
          : shift),
    );
  const parts = parseRule(rule);
  if (!changesWeekday) {
    if (options.until)
      parts.set('UNTIL', formatRuleDate(new Date(+options.until + shift)));
    const nextStart = fromWallClock(new Date(+oldRule.options.dtstart + shift), timeZone);
    return {
      startAt: nextStart,
      endAt: new Date(+nextStart + duration),
      recurrenceRule: formatRule(parts),
      timeZone,
      cancelledStarts: cancelledStarts.map(date =>
        fromWallClock(move(toWallClock(date, series.timeZone)), timeZone),
      ),
    };
  }
  const weekdayRules = oldRule.options.byweekday.map(
    weekday =>
      new RRule({ ...options, dtstart: oldRule.options.dtstart, byweekday: [weekday] }),
  );
  const firstStarts = weekdayRules
    .map(rule => rule.after(oldRule.options.dtstart, true))
    .filter((date): date is Date => date !== null);
  let anchor: Date;
  let exclusions: Date[];

  if (options.count || options.until) {
    if (options.count) {
      const starts = oldRule
        .all()
        .filter(wall => !cancelled.has(+wall))
        .map(move);
      const expected = new Set(starts.map(Number));
      anchor = new Date(Math.min(...expected));
      const last = new Date(Math.max(...expected));
      const expanded = new RRule({
        ...RRule.parseString(rule),
        dtstart: anchor,
        count: null,
        until: last,
      }).all();
      parts.set('COUNT', String(expanded.length));
      exclusions = expanded.filter(wall => !expected.has(+wall));
    } else {
      const lastStarts = weekdayRules
        .map(rule => rule.before(options.until!, true))
        .filter((date): date is Date => date !== null);
      const edges = [...firstStarts, ...lastStarts];
      const moved = edges.map(move);
      anchor = new Date(Math.min(...moved.map(Number)));
      const until = new Date(Math.max(...moved.map(Number)));
      parts.set('UNTIL', formatRuleDate(until));
      exclusions = boundaryExclusions(anchor, until);
    }
  } else {
    anchor = new Date(Math.min(...firstStarts.map(wall => +move(wall))));
    exclusions = boundaryExclusions(
      anchor,
      new Date(Math.max(...firstStarts.map(wall => +move(wall)))),
    );
  }

  const nextStart = fromWallClock(anchor, timeZone);
  return {
    startAt: nextStart,
    endAt: new Date(+nextStart + duration),
    recurrenceRule: formatRule(parts),
    timeZone,
    cancelledStarts: exclusions.map(wall => fromWallClock(wall, timeZone)),
  };

  function boundaryExclusions(anchor: Date, until: Date): Date[] {
    const nextRule = new RRule({
      ...RRule.parseString(formatRule(parts)),
      dtstart: anchor,
    });
    const isExpected = (wall: Date) => {
      for (const delta of new Set([shift, timeShift])) {
        const previous = new Date(+wall - delta);
        if (+move(previous) !== +wall || cancelled.has(+previous)) continue;
        if (oldRule.before(previous, true)?.getTime() === +previous) return true;
      }
      return false;
    };
    const width = Math.abs(days) * ONE_DAY_MS + ONE_DAY_MS;
    const candidates = new Map<number, Date>();
    for (const wall of nextRule.between(
      anchor,
      new Date(Math.min(+until, +anchor + width)),
      true,
    ))
      candidates.set(+wall, wall);
    if (options.until)
      for (const wall of nextRule.between(
        new Date(Math.max(+anchor, +until - width)),
        until,
        true,
      ))
        candidates.set(+wall, wall);
    for (const cancelledWall of cancelled) {
      const wall = move(new Date(cancelledWall));
      if (nextRule.before(wall, true)?.getTime() === +wall) candidates.set(+wall, wall);
    }
    return [...candidates.values()].filter(wall => !isExpected(wall));
  }
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
  return nextOccurrence(series, originalStart)?.getTime() === originalStart.getTime();
}

export function nextOccurrence(series: Series, from: Date): Date | null {
  const rule = new RRule({
    ...RRule.parseString(series.recurrenceRule),
    dtstart: toWallClock(series.startAt, series.timeZone),
  });
  const next = rule.after(toWallClock(from, series.timeZone), true);
  return next ? fromWallClock(next, series.timeZone) : null;
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

export function ruleWithMovedDay(rule: string, from: Date, days: number): string {
  const parts = parseRule(rule);
  const byDay = parts.get('BYDAY');

  if (!byDay || days % 7 === 0) return rule;

  const index = (from.getUTCDay() + 6) % 7;
  const source = WEEKDAYS[index];
  const target = WEEKDAYS[(((index + days) % 7) + 7) % 7];
  const moved = byDay.split(',').map(day => (day === source ? target : day));
  parts.set('BYDAY', [...new Set(moved)].join(','));

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
