import { EventApi } from '@fullcalendar/angular';
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { EventDto, TagDto } from '../../../api/generated';
import { TAG_CARD_NAME_MAX } from '../constants/tag.constants';

const TAG_CHAR_WIDTH = 7.5;
const TAG_CHROME_WIDTH = 16;
const EVENT_INSET_WIDTH = 20;

export type EventDates = Pick<EventDto, 'startAt' | 'endAt' | 'allDay'> & {
  tagNames: string[];
};

export interface DayLoad {
  count: number;
  tagNames: string[][];
}

export function toEventDates(event: EventApi): EventDates {
  const tags = (event.extendedProps['tags'] as TagDto[] | undefined) ?? [];
  return {
    allDay: event.allDay,
    startAt: event.startStr,
    endAt: event.endStr || event.startStr,
    tagNames: tags.map(tag => tag.name),
  };
}

export function countEventsByDay(events: EventDates[]): Map<string, DayLoad> {
  const counts = new Map<string, DayLoad>();

  for (const event of events) {
    const start = event.allDay
      ? parseISO(event.startAt.slice(0, 10))
      : new Date(event.startAt);
    const end = event.allDay
      ? addDays(parseISO(event.endAt.slice(0, 10)), -1)
      : new Date(new Date(event.endAt).getTime() - 1);

    for (let day = startOfDay(start); day <= end; day = addDays(day, 1)) {
      const key = format(day, 'yyyy-MM-dd');
      const load = counts.get(key) ?? { count: 0, tagNames: [] };
      counts.set(key, {
        count: load.count + 1,
        tagNames: event.tagNames.length
          ? [...load.tagNames, event.tagNames]
          : load.tagNames,
      });
    }
  }

  return counts;
}

export function fitWeekRow(row: HTMLElement | null, counts: Map<string, DayLoad>): void {
  if (!row) return;
  let count = 0;
  let tagLines = 0;
  for (const cell of row.querySelectorAll<HTMLElement>('[data-date]')) {
    const load = counts.get(cell.dataset['date'] ?? '');
    if (!load) continue;
    const width = cell.clientWidth - EVENT_INSET_WIDTH;
    count = Math.max(count, load.count);
    tagLines = Math.max(
      tagLines,
      load.tagNames.reduce((sum, names) => sum + countTagLines(names, width), 0),
    );
  }
  row.style.setProperty('--app-week-event-count', String(count));
  row.style.setProperty('--app-week-tag-lines', String(tagLines));
}

function countTagLines(names: string[], width: number): number {
  let lines = 1;
  let used = 0;
  for (const name of names) {
    const chip =
      Math.min(name.length, TAG_CARD_NAME_MAX) * TAG_CHAR_WIDTH + TAG_CHROME_WIDTH;
    if (used > 0 && used + chip > width) {
      lines++;
      used = 0;
    }
    used += chip;
  }
  return lines;
}

export function pinWeekRow(view: HTMLElement, date: string): () => void {
  const scroller = view.firstElementChild;
  const tiles = scroller?.firstElementChild;
  if (!(scroller instanceof HTMLElement) || !tiles) return () => undefined;

  const align = (): void => {
    const row = scroller
      .querySelector(`[data-date="${date}"]`)
      ?.closest<HTMLElement>('.app-week-row');
    const month = row?.closest<HTMLElement>('[data-date]');
    const firstRow = month?.querySelector('.app-week-row');
    if (!row || !month || !firstRow) return;
    const top =
      scroller.scrollTop +
      month.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      row.getBoundingClientRect().top -
      firstRow.getBoundingClientRect().top;
    if (Math.abs(scroller.scrollTop - top) > 1) scroller.scrollTop = top;
  };

  const observer = new ResizeObserver(align);
  const listeners = new AbortController();
  const release = (): void => {
    observer.disconnect();
    listeners.abort();
  };
  observer.observe(tiles);
  scroller.addEventListener('scroll', align, { signal: listeners.signal });
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    view.ownerDocument.addEventListener(type, release, {
      capture: true,
      passive: true,
      signal: listeners.signal,
    });
  }
  return release;
}
