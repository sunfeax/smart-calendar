import { Observable } from 'rxjs';
import { EventDto, EventUpdateDto } from '../../../api/generated';

export interface EventDialogData {
  event: EventDto;
  editable: boolean;
  update: (payload: EventUpdateDto, rollback: () => void) => Observable<EventDto>;
  remove: () => Observable<void>;
}
