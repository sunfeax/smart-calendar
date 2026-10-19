import { EventInput } from '@fullcalendar/angular';
import { EventDto } from '../../../api/generated';

export function toCalendarEvent(event: EventDto): EventInput {
  const input: EventInput = {
    id: event.id,
    title: event.title,
    allDay: event.allDay,
    classNames: event.completedAt ? ['is-completed'] : [],
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
