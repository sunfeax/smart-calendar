import { EventApi, EventInput } from '@fullcalendar/angular';
import { addDays, parseISO } from 'date-fns';
import { EventDto, TagDto } from '../../../api/generated';
import { HOUR_MS } from '../constants/event.constants';

export function toEventKey(event: Pick<EventDto, 'id' | 'originalStart'>): string {
  return event.originalStart ? `${event.id}:${event.originalStart}` : event.id;
}

export function toCalendarEvent(event: EventDto, tags: TagDto[]): EventInput {
  const input: EventInput = {
    id: toEventKey(event),
    title: event.title,
    allDay: event.allDay,
    className: [event.completedAt ? 'is-completed' : '', tags.length ? 'has-tags' : '']
      .filter(Boolean)
      .join(' '),
    extendedProps: {
      eventId: event.id,
      originalStart: event.originalStart,
      completed: event.completedAt !== null,
      tags,
      icon: event.icon,
    },
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

export function toInputRenderKey(input: EventInput): string {
  return toRenderKey(
    String(input.id),
    parseISO(String(input.start)).getTime(),
    input.end ? parseISO(String(input.end)).getTime() : null,
    Boolean(input.allDay),
    input.title ?? '',
    String(input.className ?? ''),
    input.extendedProps ?? {},
  );
}

export function toApiRenderKey(event: EventApi): string {
  return toRenderKey(
    event.id,
    event.start?.getTime() ?? null,
    event.end?.getTime() ?? null,
    event.allDay,
    event.title,
    event.className,
    event.extendedProps,
  );
}

function toRenderKey(
  id: string,
  start: number | null,
  end: number | null,
  allDay: boolean,
  title: string,
  className: string,
  props: Record<string, unknown>,
): string {
  const tags = (props['tags'] as TagDto[] | undefined) ?? [];
  return JSON.stringify([
    id,
    start,
    end,
    allDay,
    title,
    className,
    props['eventId'],
    props['originalStart'],
    props['completed'],
    props['icon'],
    tags.map(tag => `${tag.id}:${tag.name}:${tag.color}`),
  ]);
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

export function fromAllDayIso(value: string): Date {
  const date = new Date(value);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toAllDayIso(date: Date, dayOffset = 0): string {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset),
  ).toISOString();
}
