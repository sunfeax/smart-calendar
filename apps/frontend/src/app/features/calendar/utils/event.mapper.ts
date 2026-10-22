import { EventInput } from '@fullcalendar/angular';
import { EventDto } from '../../../api/generated';

export function toCalendarEvent(event: EventDto): EventInput {
  const input: EventInput = {
    id: event.id,
    title: event.title,
    allDay: event.allDay,
    className: event.completedAt ? 'is-completed' : '',
    extendedProps: { completed: event.completedAt !== null },
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

import { addDays } from 'date-fns';
import { HOUR_MS } from '../constants/event.constants';

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
  startAt: string;
  endAt: string;
} {
  const end =
    form.endAt ??
    (form.allDay ? form.startAt : new Date(form.startAt.getTime() + HOUR_MS));

  return form.allDay
    ? { startAt: toAllDayIso(form.startAt), endAt: toAllDayIso(end, 1) }
    : { startAt: form.startAt.toISOString(), endAt: end.toISOString() };
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
