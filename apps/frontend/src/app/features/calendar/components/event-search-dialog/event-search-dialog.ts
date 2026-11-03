import { Component, computed, effect, inject, signal, Signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatInput, MatPrefix } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged, filter, map, Observable } from 'rxjs';
import { EventDto, TagDto } from '../../../../api/generated';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
} from '../../constants/event.constants';
import { EventService } from '../../services/event.service';
import { EventRow } from '../event-row/event-row';

export interface EventSearchDialogData {
  calendarId: string;
  tags: Signal<Map<string, TagDto>>;
}

@Component({
  selector: 'app-event-search-dialog',
  imports: [
    EventRow,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatPrefix,
    TranslocoPipe,
  ],
  templateUrl: './event-search-dialog.html',
  styleUrl: './event-search-dialog.scss',
})
export class EventSearchDialog {
  // STATIC
  static open(dialog: MatDialog, data: EventSearchDialogData): Observable<EventDto> {
    return dialog
      .open<EventSearchDialog, EventSearchDialogData, EventDto>(EventSearchDialog, {
        data,
        width: 'min(48rem, calc(100vw - 2rem))',
        height: 'min(44rem, calc(100dvh - 2rem))',
        maxWidth: 'calc(100vw - 2rem)',
      })
      .afterClosed()
      .pipe(filter((event): event is EventDto => !!event));
  }

  // DEPENDENCIES
  private readonly dialogRef =
    inject<MatDialogRef<EventSearchDialog, EventDto>>(MatDialogRef);
  private readonly eventService = inject(EventService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);

  readonly data = inject<EventSearchDialogData>(MAT_DIALOG_DATA);

  // STATE
  readonly maxLength = SEARCH_MAX_LENGTH;
  readonly query = signal('');

  private readonly settledQuery = toSignal(
    toObservable(this.query).pipe(
      map(query => query.trim()),
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  // DATA
  readonly results = rxResource({
    params: () => {
      const query = this.settledQuery();
      return query.length >= SEARCH_MIN_LENGTH ? query : undefined;
    },
    stream: ({ params }) => this.eventService.search(this.data.calendarId, params),
  });

  // COMPUTED
  readonly isTooShort = computed(() => this.query().trim().length < SEARCH_MIN_LENGTH);

  // LIFECYCLE
  constructor() {
    this.showSearchError();
  }

  // EFFECTS
  private showSearchError(): void {
    effect(() => {
      if (!this.results.error()) return;
      this.snackbarService.error(this.transloco.translate('search.error'));
    });
  }

  // ACTIONS
  open(event: EventDto): void {
    this.dialogRef.close(event);
  }

  close(): void {
    this.dialogRef.close();
  }
}
