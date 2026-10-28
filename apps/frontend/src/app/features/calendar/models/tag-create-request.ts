import { TagCreateDto } from '../../../api/generated';

export interface TagCreateRequest {
  categoryId: string;
  payload: TagCreateDto;
}
