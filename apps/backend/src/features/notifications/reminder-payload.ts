import type { EventReminder } from '../../generated/prisma/client.js';
import {
  NOTIFICATION_LANGUAGES,
  NotificationLanguage,
} from './notification.constants.js';
import { ReminderOccurrence } from './reminder-time.js';

const COPY: Record<NotificationLanguage, { title: string; untitled: string }> = {
  ru: { title: 'Напоминание о событии', untitled: 'Без названия' },
  en: { title: 'Event reminder', untitled: 'Untitled event' },
  es: { title: 'Recordatorio de evento', untitled: 'Evento sin título' },
};

export function reminderPayload(
  reminder: EventReminder,
  occurrence: ReminderOccurrence,
  calendarId: string,
  language: string,
) {
  const lang = NOTIFICATION_LANGUAGES.find(value => value === language) ?? 'en';
  const copy = COPY[lang];
  const date = new Intl.DateTimeFormat(lang, {
    timeZone: occurrence.allDay ? 'UTC' : reminder.timeZone,
    dateStyle: 'medium',
    ...(occurrence.allDay ? {} : { timeStyle: 'short' }),
  }).format(occurrence.startAt);
  const url = `/calendars/${calendarId}?event=${reminder.eventId}&originalStart=${encodeURIComponent(occurrence.originalStart.toISOString())}&date=${occurrence.startAt.toISOString().slice(0, 10)}`;
  return {
    notification: {
      title: copy.title,
      body: `${occurrence.title || copy.untitled} · ${date}`,
      icon: '/icons/icon-192.png',
      tag: `reminder-${reminder.id}-${occurrence.originalStart.toISOString()}`,
      lang,
      timestamp: occurrence.remindAt.getTime(),
      data: {
        onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url } },
      },
    },
  };
}
