import { EventInput } from '@fullcalendar/angular';
import { addDays } from 'date-fns';
import { EventDto, TagDto } from '../../../api/generated';
import { HOUR_MS } from '../constants/event.constants';

export function toCalendarEvent(event: EventDto, tags: TagDto[]): EventInput {
  const input: EventInput = {
    id: event.id,
    title: event.title,
    allDay: event.allDay,
    className: [event.completedAt ? 'is-completed' : '', tags.length ? 'has-tags' : '']
      .filter(Boolean)
      .join(' '),
    extendedProps: { completed: event.completedAt !== null, tags, icon: event.icon },
  };

  if (event.allDay) {
    input.start = event.startAt.slice(0, 10);
    if (event.endAt) input.end = event.endAt.slice(0, 10);
  } else {
    input.start = event.startAt;
    if (event.endAt) input.end = event.endAt;
  }

  return input;
}

interface EventFormDates {
  allDay: boolean;
  startAt: Date;
  endAt: Date | null;
}

export function toEventFormDates(event: Pick<EventDto, 'allDay' | 'startAt' | 'endAt'>): {
  startAt: Date;
  endAt: Date;
} {
  if (!event.allDay) {
    return { startAt: new Date(event.startAt), endAt: new Date(event.endAt) };
  }

  return {
    startAt: fromAllDayIso(event.startAt),
    endAt: addDays(fromAllDayIso(event.endAt), -1),
  };
}

export function toEventApiDates(form: EventFormDates): {
  allDay: boolean;
  startAt: string;
  endAt: string;
} {
  const end =
    form.endAt ??
    (form.allDay ? form.startAt : new Date(form.startAt.getTime() + HOUR_MS));

  return form.allDay
    ? { allDay: true, startAt: toAllDayIso(form.startAt), endAt: toAllDayIso(end, 1) }
    : { allDay: false, startAt: form.startAt.toISOString(), endAt: end.toISOString() };
}

function fromAllDayIso(value: string): Date {
  const date = new Date(value);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toAllDayIso(date: Date, dayOffset = 0): string {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset),
  ).toISOString();
}
