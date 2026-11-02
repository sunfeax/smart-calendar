import { Component, computed, effect, inject, signal, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatInput, MatPrefix } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { format } from 'date-fns';
import { catchError, EMPTY, finalize, switchMap, tap } from 'rxjs';
import { EventDto, TagDto } from '../../../../api/generated';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { LanguageService } from '../../../../shared/services/language.service';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { EventService } from '../../services/event.service';
import { EventIcon } from '../event-icon/event-icon';

export interface CalendarArchiveDialogData {
  calendarId: string;
  tags: Signal<Map<string, TagDto>>;
  restored: (event: EventDto) => void;
}

interface ArchiveRow {
  event: EventDto;
  dates: string;
  archivedAt: string;
  tags: TagDto[];
  search: string;
}

interface ArchiveGroup {
  label: string | null;
  rows: ArchiveRow[];
}

@Component({
  selector: 'app-calendar-archive-dialog',
  imports: [
    EventIcon,
    MatButton,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatPrefix,
    MatTooltip,
    TranslocoPipe,
  ],
  templateUrl: './calendar-archive-dialog.html',
  styleUrl: './calendar-archive-dialog.scss',
})
export class CalendarArchiveDialog {
  // STATIC
  static open(dialog: MatDialog, data: CalendarArchiveDialogData): void {
    dialog.open<CalendarArchiveDialog, CalendarArchiveDialogData>(CalendarArchiveDialog, {
      data,
      width: 'min(48rem, calc(100vw - 2rem))',
      height: 'min(44rem, calc(100dvh - 2rem))',
      maxWidth: 'calc(100vw - 2rem)',
    });
  }

  // DEPENDENCIES
  private readonly dialogRef = inject<MatDialogRef<CalendarArchiveDialog>>(MatDialogRef);
  private readonly dialog = inject(MatDialog);
  private readonly eventService = inject(EventService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);
  private readonly languageService = inject(LanguageService);

  readonly data = inject<CalendarArchiveDialogData>(MAT_DIALOG_DATA);

  // STATE
  readonly pendingId = signal<string | null>(null);
  readonly query = signal('');

  // DATA
  readonly events = rxResource({
    params: () => this.data.calendarId,
    stream: ({ params }) => this.eventService.listArchived(params),
  });

  // COMPUTED
  private readonly rows = computed(() => {
    const tags = this.data.tags();
    return (this.events.hasValue() ? this.events.value() : [])
      .map(event => this.toRow(event, tags))
      .sort((a, b) => b.event.startAt.localeCompare(a.event.startAt));
  });

  readonly groups = computed<ArchiveGroup[]>(() => {
    const query = this.query().trim().toLocaleLowerCase();
    if (query) {
      return [
        { label: null, rows: this.rows().filter(row => row.search.includes(query)) },
      ];
    }

    const groups = new Map<string, ArchiveRow[]>();
    for (const row of this.rows()) {
      const label = this.toMonthLabel(row.event);
      groups.set(label, [...(groups.get(label) ?? []), row]);
    }
    return [...groups].map(([label, rows]) => ({ label, rows }));
  });

  readonly isEmpty = computed(() => this.groups().every(group => !group.rows.length));

  // LIFECYCLE
  constructor() {
    this.showLoadError();
  }

  // EFFECTS
  private showLoadError(): void {
    effect(() => {
      if (!this.events.error()) return;
      this.snackbarService.error(this.transloco.translate('archive.loadError'));
    });
  }

  // ACTIONS
  restore(event: EventDto): void {
    this.pendingId.set(event.id);
    this.eventService
      .restore(event.id)
      .pipe(
        tap(restored => {
          this.removeLocally(event.id);
          this.data.restored(restored);
          this.snackbarService.success(this.transloco.translate('archive.restored'));
        }),
        catchError(() => {
          this.snackbarService.error(this.transloco.translate('archive.restoreError'));
          return EMPTY;
        }),
        finalize(() => this.pendingId.set(null)),
      )
      .subscribe();
  }

  deleteForever(event: EventDto): void {
    ConfirmDialog.open(this.dialog, {
      title: this.transloco.translate('archive.deleteTitle'),
      message: this.transloco.translate('archive.deleteMessage'),
      confirmText: this.transloco.translate('archive.delete'),
      variant: 'danger',
    })
      .pipe(
        tap(() => this.pendingId.set(event.id)),
        switchMap(() => this.eventService.deleteArchived(event.id)),
        tap(() => this.removeLocally(event.id)),
        catchError(() => {
          this.snackbarService.error(this.transloco.translate('archive.deleteError'));
          return EMPTY;
        }),
        finalize(() => this.pendingId.set(null)),
      )
      .subscribe();
  }

  close(): void {
    this.dialogRef.close();
  }

  private removeLocally(eventId: string): void {
    this.events.update(list => list?.filter(item => item.id !== eventId));
  }

  // HELPERS
  private toRow(event: EventDto, tagsById: Map<string, TagDto>): ArchiveRow {
    const dates = this.toDatesText(event);
    const start = this.toLocalDate(event.startAt, event.allDay);
    return {
      event,
      dates,
      archivedAt: new Intl.DateTimeFormat(this.languageService.lang(), {
        day: 'numeric',
        month: 'short',
      }).format(new Date(event.archivedAt ?? event.updatedAt)),
      tags: event.tagIds.flatMap(id => tagsById.get(id) ?? []),
      search: [
        event.title,
        event.description ?? '',
        dates,
        format(start, 'dd.MM.yyyy'),
        format(start, 'yyyy-MM-dd'),
      ]
        .join(' ')
        .toLocaleLowerCase(),
    };
  }

  private toMonthLabel(event: EventDto): string {
    const label = new Intl.DateTimeFormat(this.languageService.lang(), {
      month: 'long',
      year: 'numeric',
    }).format(this.toLocalDate(event.startAt, event.allDay));
    return label.charAt(0).toLocaleUpperCase() + label.slice(1);
  }

  private toDatesText(event: EventDto): string {
    const formatter = new Intl.DateTimeFormat(this.languageService.lang(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(event.allDay ? { timeZone: 'UTC' } : { hour: '2-digit', minute: '2-digit' }),
    });
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    if (event.allDay) end.setUTCDate(end.getUTCDate() - 1);
    return start.getTime() === end.getTime()
      ? formatter.format(start)
      : formatter.formatRange(start, end);
  }

  private toLocalDate(value: string, allDay: boolean): Date {
    const date = new Date(value);
    return allDay
      ? new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      : date;
  }
}
