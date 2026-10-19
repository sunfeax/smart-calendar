import { EventDto } from '../../../api/generated';

export type EventDialogData =
  { mode: 'create'; date: string } | { mode: 'edit'; event: EventDto };
