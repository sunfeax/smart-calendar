import { EventCreateDto, EventDto, EventUpdateDto } from '../../../api/generated';

export type EventDialogData =
  { mode: 'create'; date: string } | { mode: 'update'; event: EventDto };

export type EventDialogResult =
  | { action: 'create'; value: EventCreateDto }
  | { action: 'update'; value: EventUpdateDto }
  | { action: 'delete' }
  | undefined;
