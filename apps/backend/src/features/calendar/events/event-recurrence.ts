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
  const formatter = series.timeZone ? createFormatter(series.timeZone) : null;
  const toWallClock = (date: Date) => (formatter ? wallClock(formatter, date) : date);
  const fromWallClock = (date: Date) =>
    formatter ? instantFromWallClock(formatter, date) : date;

  const rule = new RRule({
    ...RRule.parseString(series.recurrenceRule),
    dtstart: toWallClock(series.startAt),
  });

  const after = new Date(from.getTime() - duration - ONE_DAY_MS);
  const before = new Date(to.getTime() + ONE_DAY_MS);

  return rule
    .between(after, before, true, (_, index) => index < limit)
    .map(start => {
      const startAt = fromWallClock(start);
      return { startAt, endAt: new Date(startAt.getTime() + duration) };
    })
    .filter(occurrence => occurrence.startAt < to && occurrence.endAt > from);
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

function wallClock(formatter: Intl.DateTimeFormat, date: Date): Date {
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(part => [part.type, Number(part.value)]),
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

function instantFromWallClock(formatter: Intl.DateTimeFormat, wall: Date): Date {
  const offsetAt = (date: Date) => wallClock(formatter, date).getTime() - date.getTime();
  const guess = new Date(wall.getTime() - offsetAt(wall));
  return new Date(wall.getTime() - offsetAt(guess));
}
