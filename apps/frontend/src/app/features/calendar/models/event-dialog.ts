import { ResourceRef } from '@angular/core';
import { Observable } from 'rxjs';
import {
  EventDto,
  EventUpdateDto,
  TagCategoryDto,
  TagCreateDto,
  TagDto,
} from '../../../api/generated';

export interface EventDialogData {
  event: EventDto;
  editable: boolean;
  update: (payload: EventUpdateDto, rollback: () => void) => Observable<EventDto>;
  remove: () => Observable<void>;
  categories: ResourceRef<TagCategoryDto[] | undefined>;
  createTag: (categoryId: string, payload: TagCreateDto) => Observable<TagDto>;
  setTag: (tagId: string, assigned: boolean) => Observable<EventDto>;
}
