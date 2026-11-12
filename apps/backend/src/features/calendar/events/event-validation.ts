import { BadRequestException } from '@nestjs/common';
import { ONE_DAY_MS } from '../../../common/constants.js';

export function assertEventDates(startAt: Date, endAt: Date, allDay: boolean): void {
  if (endAt <= startAt) {
    throw new BadRequestException('endAt must be later than startAt');
  }

  if (allDay) {
    const isUtcMidnight = (date: Date) => date.getTime() % ONE_DAY_MS === 0;

    if (!isUtcMidnight(startAt) || !isUtcMidnight(endAt)) {
      throw new BadRequestException('All-day events must start and end at 00:00:00 UTC');
    }
  }
}

export function resolveEventTimeZone(
  recurrenceRule: string | null,
  allDay: boolean,
  timeZone: string | null,
): string | null {
  if (!recurrenceRule || allDay) return null;

  if (!timeZone) {
    throw new BadRequestException('timeZone is required for timed recurring events');
  }

  return timeZone;
}
