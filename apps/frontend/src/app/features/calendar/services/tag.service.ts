import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  TagCategoryCreateDto,
  TagCategoryDto,
  TagCategoryUpdateDto,
  TagCreateDto,
  TagDto,
  TagUpdateDto,
} from '../../../api/generated';

@Service()
export class TagService {
  // DEPENDENCIES
  private readonly http = inject(HttpClient);

  // ACTIONS
  listCategories(calendarId: string) {
    return this.http.get<TagCategoryDto[]>(`/api/calendars/${calendarId}/tag-categories`);
  }

  createCategory(calendarId: string, body: TagCategoryCreateDto) {
    return this.http.post<TagCategoryDto>(
      `/api/calendars/${calendarId}/tag-categories`,
      body,
    );
  }

  updateCategory(categoryId: string, body: TagCategoryUpdateDto) {
    return this.http.patch<TagCategoryDto>(`/api/tag-categories/${categoryId}`, body);
  }

  deleteCategory(categoryId: string) {
    return this.http.delete<void>(`/api/tag-categories/${categoryId}`);
  }

  createTag(categoryId: string, body: TagCreateDto) {
    return this.http.post<TagDto>(`/api/tag-categories/${categoryId}/tags`, body);
  }

  updateTag(tagId: string, body: TagUpdateDto) {
    return this.http.patch<TagDto>(`/api/tags/${tagId}`, body);
  }

  deleteTag(tagId: string) {
    return this.http.delete<void>(`/api/tags/${tagId}`);
  }
}
