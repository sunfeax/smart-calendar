import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  ResourceRef,
  signal,
  viewChildren,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatInput, MatLabel, MatPrefix } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, concatMap, defer, EMPTY, Observable, Subject, tap } from 'rxjs';
import { TagCategoryDto, TagDto, TagUpdateDto } from '../../../../api/generated';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { TAG_COLORS, TAG_NAME_MAX } from '../../constants/tag.constants';
import { TagService } from '../../services/tag.service';
import { TagCreateRequest } from '../../models/tag-create-request';

@Component({
  selector: 'app-event-tags',
  imports: [
    MatButton,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatPrefix,
    MatTooltip,
    NgTemplateOutlet,
    TranslocoPipe,
  ],
  templateUrl: './event-tags.html',
  styleUrl: './event-tags.scss',
})
export class EventTags {
  // DEPENDENCIES
  private readonly tagService = inject(TagService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  // INPUTS
  readonly calendarId = input.required<string>();
  readonly categories = input.required<ResourceRef<TagCategoryDto[] | undefined>>();
  readonly tagIds = input.required<string[]>();
  readonly editable = input.required<boolean>();
  readonly tagToggle = output<string>();
  readonly tagCreate = output<TagCreateRequest>();
  readonly categoryDetach = output<string>();

  // STATE
  readonly colors = TAG_COLORS;
  readonly nameMax = TAG_NAME_MAX;
  readonly query = signal('');
  readonly categoryQuery = signal('');
  readonly editingTagId = signal<string | null>(null);
  readonly tagNameDraft = signal('');
  private editingCategoryId: string | null = null;
  private readonly keptIds = signal<string[]>([]);
  private readonly mutations = new Subject<() => Observable<unknown>>();
  private readonly searchInputs = viewChildren<ElementRef<HTMLInputElement>>('tagSearch');
  private readonly nameInputs = viewChildren<ElementRef<HTMLInputElement>>('tagName');

  // COMPUTED
  private readonly selected = computed(() => new Set(this.tagIds()));

  readonly rows = computed(() => {
    const categories = this.categories();
    if (!categories.hasValue()) return [];
    const selected = this.selected();
    const kept = this.keptIds();
    return categories
      .value()
      .map(category => ({
        category,
        assigned: category.tags.filter(tag => selected.has(tag.id)),
      }))
      .filter(row => row.assigned.length > 0 || kept.includes(row.category.id));
  });

  readonly hiddenCategories = computed(() => {
    const categories = this.categories();
    if (!categories.hasValue()) return [];
    const shown = new Set(this.rows().map(row => row.category.id));
    const query = this.categoryQuery().trim().toLowerCase();
    return categories
      .value()
      .filter(
        category =>
          !shown.has(category.id) && category.name.toLowerCase().includes(query),
      );
  });

  readonly canCreateCategory = computed(() => {
    const name = this.categoryQuery().trim();
    return name.length > 0 && !this.findCategory(name);
  });

  // LIFECYCLE
  constructor() {
    this.runMutations();
  }

  // EFFECTS
  private runMutations(): void {
    this.mutations.pipe(concatMap(request => request())).subscribe();
    this.destroyRef.onDestroy(() => this.mutations.complete());
  }

  // ACTIONS
  focusInput(element: HTMLInputElement): void {
    afterNextRender(() => element.select(), { injector: this.injector });
  }

  openPicker(categoryId: string): void {
    this.keepCategory(categoryId);
    this.editingTagId.set(null);
    this.focusTagInput('search');
  }

  closePicker(): void {
    this.saveTagName();
    this.query.set('');
    this.editingTagId.set(null);
  }

  editTag(categoryId: string, tag: TagDto): void {
    this.editingCategoryId = categoryId;
    this.tagNameDraft.set(tag.name);
    this.editingTagId.set(tag.id);
    this.focusTagInput('name');
  }

  backToTags(): void {
    this.saveTagName();
    this.editingTagId.set(null);
    this.query.set('');
    this.focusTagInput('search');
  }

  keepMenuOpen(event: Event): void {
    if (event instanceof KeyboardEvent && event.key === 'Escape') return;
    event.stopPropagation();
  }

  isSelected(tagId: string): boolean {
    return this.selected().has(tagId);
  }

  filteredTags(category: TagCategoryDto): TagDto[] {
    const query = this.query().trim().toLowerCase();
    return category.tags.filter(tag => tag.name.toLowerCase().includes(query));
  }

  tagForEdit(categoryId: string, tagId: string): TagDto | undefined {
    const categories = this.categories();
    if (!categories.hasValue()) return undefined;
    return categories
      .value()
      .find(category => category.id === categoryId)
      ?.tags.find(tag => tag.id === tagId);
  }

  canCreateTag(category: TagCategoryDto): boolean {
    const name = this.query().trim();
    return name.length > 0 && !this.findTag(category, name);
  }

  toggleTag(tagId: string): void {
    this.tagToggle.emit(tagId);
  }

  submitQuery(category: TagCategoryDto): void {
    const name = this.query().trim();
    if (!name) return;
    const existing = this.findTag(category, name);
    if (existing) {
      this.toggleTag(existing.id);
      this.query.set('');
      return;
    }
    this.createTag(category);
  }

  createTag(category: TagCategoryDto): void {
    const name = this.query().trim();
    if (!name || !this.editable()) return;
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

    this.tagCreate.emit({ categoryId: category.id, payload: { name, color } });
    this.query.set('');
  }

  detachCategory(category: TagCategoryDto): void {
    this.keptIds.update(ids => ids.filter(id => id !== category.id));
    this.categoryDetach.emit(category.id);
  }

  keepCategory(categoryId: string): void {
    this.keptIds.update(ids => (ids.includes(categoryId) ? ids : [...ids, categoryId]));
  }

  submitCategoryQuery(): void {
    const name = this.categoryQuery().trim();
    if (!name) return;
    const existing = this.findCategory(name);
    if (existing) {
      this.keepCategory(existing.id);
      return;
    }
    this.createCategory(name);
  }

  createCategory(value: string): void {
    const name = value.trim();
    if (!name) return;

    this.mutate(
      () => {
        const existing = this.findCategory(name);
        if (existing) {
          this.keepCategory(existing.id);
          return EMPTY;
        }
        return this.tagService.createCategory(this.calendarId(), {
          name,
          multiple: true,
        });
      },
      'tags.createError',
      category => {
        this.categories().update(list => list && [...list, category]);
        this.keepCategory(category.id);
      },
    );
  }

  renameCategory(category: TagCategoryDto, value: string): void {
    const name = value.trim();
    if (!name) return;

    this.mutate(
      () =>
        this.categories()
          .value()
          ?.find(item => item.id === category.id)?.name === name
          ? EMPTY
          : this.tagService.updateCategory(category.id, { name }),
      'tags.updateError',
      updated =>
        this.updateCategory(category.id, current => ({ ...updated, tags: current.tags })),
    );
  }

  toggleMultiple(category: TagCategoryDto): void {
    this.mutate(
      () => {
        const current = this.categories()
          .value()
          ?.find(item => item.id === category.id);
        return current
          ? this.tagService.updateCategory(category.id, { multiple: !current.multiple })
          : EMPTY;
      },
      error =>
        error instanceof HttpErrorResponse && error.status === 409
          ? 'tags.multipleConflict'
          : 'tags.updateError',
      updated =>
        this.updateCategory(category.id, current => ({ ...updated, tags: current.tags })),
    );
  }

  deleteCategory(category: TagCategoryDto): void {
    this.confirm('tags.deleteCategoryTitle', 'tags.deleteCategoryMessage')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.mutate(
          () => this.tagService.deleteCategory(category.id),
          'tags.deleteError',
          () =>
            this.categories().update(list =>
              list?.filter(item => item.id !== category.id),
            ),
        ),
      );
  }

  renameTag(categoryId: string, tag: TagDto, value: string): void {
    const name = value.trim();
    if (!name) return;
    this.saveTag(categoryId, tag.id, { name });
  }

  recolorTag(categoryId: string, tag: TagDto, color: TagDto['color']): void {
    this.saveTag(categoryId, tag.id, { color });
  }

  deleteTag(categoryId: string, tag: TagDto): void {
    this.confirm('tags.deleteTagTitle', 'tags.deleteTagMessage')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.mutate(
          () => this.tagService.deleteTag(tag.id),
          'tags.deleteError',
          () =>
            this.updateCategory(categoryId, item => ({
              ...item,
              tags: item.tags.filter(current => current.id !== tag.id),
            })),
        ),
      );
  }

  private saveTag(categoryId: string, tagId: string, body: TagUpdateDto): void {
    this.mutate(
      () => {
        const current = this.tagForEdit(categoryId, tagId);
        if (!current) return EMPTY;
        const payload: TagUpdateDto = {};
        if (body.name !== undefined && body.name !== current.name)
          payload.name = body.name;
        if (body.color !== undefined && body.color !== current.color)
          payload.color = body.color;
        return Object.keys(payload).length
          ? this.tagService.updateTag(tagId, payload)
          : EMPTY;
      },
      'tags.updateError',
      updated =>
        this.updateCategory(categoryId, item => ({
          ...item,
          tags: item.tags.map(current => (current.id === tagId ? updated : current)),
        })),
    );
  }

  private mutate<T>(
    request: () => Observable<T>,
    errorKey: string | ((error: unknown) => string),
    apply: (result: T) => void,
  ): void {
    if (!this.editable()) return;
    this.mutations.next(() =>
      defer(request).pipe(
        tap(apply),
        catchError((error: unknown) => {
          this.notifyError(typeof errorKey === 'string' ? errorKey : errorKey(error));
          return EMPTY;
        }),
      ),
    );
  }

  private updateCategory(
    categoryId: string,
    change: (category: TagCategoryDto) => TagCategoryDto,
  ): void {
    this.categories().update(list =>
      list?.map(item => (item.id === categoryId ? change(item) : item)),
    );
  }

  private saveTagName(): void {
    const categoryId = this.editingCategoryId;
    const tagId = this.editingTagId();
    if (!categoryId || !tagId) return;
    const tag = this.tagForEdit(categoryId, tagId);
    if (tag) this.renameTag(categoryId, tag, this.tagNameDraft());
  }

  private confirm(titleKey: string, messageKey: string): Observable<true> {
    return ConfirmDialog.open(this.dialog, {
      title: this.transloco.translate(titleKey),
      message: this.transloco.translate(messageKey),
      confirmText: this.transloco.translate('tags.delete'),
      variant: 'danger',
    });
  }

  private notifyError(key: string): void {
    this.snackbarService.error(this.transloco.translate(key));
  }

  // HELPERS
  private focusTagInput(type: 'search' | 'name'): void {
    afterNextRender(
      () => {
        const inputs = type === 'search' ? this.searchInputs() : this.nameInputs();
        inputs.find(input => input.nativeElement.isConnected)?.nativeElement.select();
      },
      { injector: this.injector },
    );
  }

  private findCategory(name: string): TagCategoryDto | undefined {
    const categories = this.categories();
    if (!categories.hasValue()) return undefined;
    const lower = name.toLowerCase();
    return categories.value().find(category => category.name.toLowerCase() === lower);
  }

  private findTag(category: TagCategoryDto, name: string): TagDto | undefined {
    const lower = name.toLowerCase();
    return category.tags.find(tag => tag.name.toLowerCase() === lower);
  }
}
