import { fromWallClock, toWallClock } from '../../../../common/wall-clock.js';
import { CalendarParseError } from './parsed-calendar.model.js';

export function parseWallDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone: string | null = null,
): Date {
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day);
  wall.setUTCHours(hour, minute, second, 0);
  if (
    wall.getUTCFullYear() !== year ||
    wall.getUTCMonth() !== month - 1 ||
    wall.getUTCDate() !== day ||
    wall.getUTCHours() !== hour ||
    wall.getUTCMinutes() !== minute ||
    wall.getUTCSeconds() !== second
  ) {
    throw new CalendarParseError('invalidDate');
  }
  assertTimeZone(timeZone);
  const date = fromWallClock(wall, timeZone);
  if (+toWallClock(date, timeZone) !== +wall) {
    throw new CalendarParseError('nonexistentTime');
  }
  return date;
}

export function nextMidnight(date: Date, timeZone: string | null): Date {
  const wall = toWallClock(date, timeZone);
  wall.setUTCDate(wall.getUTCDate() + 1);
  return parseWallDate(
    wall.getUTCFullYear(),
    wall.getUTCMonth() + 1,
    wall.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );
}

export function assertTimeZone(timeZone: string | null): void {
  if (!timeZone) return;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new CalendarParseError('unsupportedTimeZone', timeZone);
  }
}
