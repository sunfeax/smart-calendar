import { EventCreateDto, EventDto, EventUpdateDto } from '../../../api/generated';

export type EventDialogData =
  | { mode: 'create'; date: string; editable: boolean }
  | { mode: 'update'; event: EventDto; editable: boolean };

export type EventDialogResult =
  | { action: 'create'; payload: EventCreateDto }
  | { action: 'update'; eventId: string; payload: EventUpdateDto }
  | { action: 'delete'; eventId: string }
  | undefined;
