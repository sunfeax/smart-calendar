import { CalendarUpdateDto } from '../../../api/generated';

export type CalendarAction =
  | { action: 'create' }
  | { action: 'update'; calendarId: string; payload: CalendarUpdateDto }
  | { action: 'delete'; calendarId: string };
