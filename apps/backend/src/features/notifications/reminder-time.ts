import type {
  Event,
  EventException,
  EventReminder,
} from '../../generated/prisma/client.js';
import { ONE_DAY_MS } from '../../common/constants.js';
import { fromWallClock } from '../../common/wall-clock.js';
import { nextOccurrence } from '../calendar/events/event-recurrence.js';
import { REMINDER_GRACE_MS } from './notification.constants.js';

export type ReminderEvent = Event & { exceptions: EventException[] };

export interface ReminderOccurrence {
  originalStart: Date;
  startAt: Date;
  remindAt: Date;
  allDay: boolean;
  title: string;
}

export function reminderWindow(reminder: EventReminder, now: Date) {
  const offset = reminder.minutesBefore * 60000;
  return {
    from: new Date(+now - REMINDER_GRACE_MS + offset - 2 * ONE_DAY_MS),
    to: new Date(+now + offset + 2 * ONE_DAY_MS),
  };
}

export function dueReminderOccurrences(
  event: ReminderEvent,
  reminder: EventReminder,
  now: Date,
): ReminderOccurrence[] {
  if (event.archivedAt) return [];
  const { from, to } = reminderWindow(reminder, now);
  const starts = new Map<number, Date>();
  if (event.recurrenceRule) {
    const series = { ...event, recurrenceRule: event.recurrenceRule };
    let next = nextOccurrence(series, from);
    while (next && next <= to) {
      starts.set(+next, next);
      next = nextOccurrence(series, new Date(+next + 1));
    }
  } else {
    starts.set(+event.startAt, event.startAt);
  }
  const exceptions = new Map(event.exceptions.map(item => [+item.originalStart, item]));
  for (const exception of event.exceptions) {
    if (!exception.cancelled)
      starts.set(+exception.originalStart, exception.originalStart);
  }
  const result: ReminderOccurrence[] = [];
  for (const originalStart of starts.values()) {
    const exception = exceptions.get(+originalStart);
    if (exception?.cancelled) continue;
    const value = exception?.overrides;
    const overrides =
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const completedAt =
      overrides['completedAt'] !== undefined
        ? overrides['completedAt']
        : event.completedAt;
    if (completedAt) continue;
    const startAt =
      typeof overrides['startAt'] === 'string'
        ? new Date(overrides['startAt'])
        : originalStart;
    const allDay =
      typeof overrides['allDay'] === 'boolean' ? overrides['allDay'] : event.allDay;
    const title =
      typeof overrides['title'] === 'string' ? overrides['title'] : event.title;
    const anchor = allDay
      ? fromWallClock(
          new Date(`${startAt.toISOString().slice(0, 10)}T${reminder.allDayTime}:00Z`),
          reminder.timeZone,
        )
      : startAt;
    const remindAt = new Date(+anchor - reminder.minutesBefore * 60000);
    if (
      +remindAt < +reminder.updatedAt ||
      +remindAt < +now - REMINDER_GRACE_MS ||
      remindAt > now
    )
      continue;
    result.push({ originalStart, startAt, remindAt, allDay, title });
  }
  return result;
}
