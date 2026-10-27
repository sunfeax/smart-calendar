import { EventDto } from '../../../api/generated';

export interface EventDialogData {
  event: EventDto;
  editable: boolean;
}

export type EventDialogResult = { action: 'delete' } | undefined;
