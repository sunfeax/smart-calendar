import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { EventDto } from '../../../api/generated';

export function countEventsByDay(
  events: Pick<EventDto, 'startAt' | 'endAt' | 'allDay'>[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const event of events) {
    const start = event.allDay
      ? parseISO(event.startAt.slice(0, 10))
      : new Date(event.startAt);
    const end = event.allDay
      ? addDays(parseISO(event.endAt.slice(0, 10)), -1)
      : new Date(new Date(event.endAt).getTime() - 1);

    for (let day = startOfDay(start); day <= end; day = addDays(day, 1)) {
      const key = format(day, 'yyyy-MM-dd');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

export function fitWeekRow(row: HTMLElement | null, counts: Map<string, number>): void {
  if (!row) return;
  let count = 0;
  for (const cell of row.querySelectorAll<HTMLElement>('[data-date]')) {
    count = Math.max(count, counts.get(cell.dataset['date'] ?? '') ?? 0);
  }
  row.style.setProperty('--app-week-event-count', String(count));
}
