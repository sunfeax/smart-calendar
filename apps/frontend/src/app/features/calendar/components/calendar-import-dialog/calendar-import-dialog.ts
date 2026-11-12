import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  applyEach,
  FieldContext,
  form,
  FormField,
  maxLength,
  required,
  validate,
} from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatCheckbox } from '@angular/material/checkbox';
import {
  MatDateRangeInput,
  MatDateRangePicker,
  MatDatepickerToggle,
  MatEndDate,
  MatStartDate,
} from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import {
  MatError,
  MatFormField,
  MatHint,
  MatInput,
  MatLabel,
  MatSuffix,
} from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import {
  MatTimepicker,
  MatTimepickerInput,
  MatTimepickerToggle,
} from '@angular/material/timepicker';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { isValid } from 'date-fns';
import {
  catchError,
  filter,
  finalize,
  from,
  map,
  Observable,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import {
  CalendarImportDto,
  EventCreateDto,
  ImportBrokenEventDto,
  ImportColumnsDto,
  ImportFixDto,
} from '../../../../api/generated';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import {
  DESCRIPTION_MAX,
  TIME_STEP_MINUTES,
  TITLE_MAX,
} from '../../constants/event.constants';
import {
  IMPORT_FILE_MAX_BYTES,
  IMPORT_FILE_TYPES,
} from '../../constants/import.constants';
import { ImportService } from '../../services/import.service';
import { toEventApiDates, toEventFormDates } from '../../utils/event.mapper';

export interface CalendarImportDialogData {
  calendarId: string;
}

type ImportSource = CalendarImportDto['source'];

interface ImportFile {
  name: string;
  content: string;
}

type ImportFileError = 'tooLarge' | 'unreadable';

interface ImportMessage {
  key: string;
  params: { value?: string | null };
}

interface ImportColumns {
  title?: string;
  date?: string;
  tags?: string[];
}

interface ImportFix {
  skip: boolean;
  title: string;
  description: string;
  allDay: boolean;
  startAt: Date | null;
  endAt: Date | null;
}

@Component({
  selector: 'app-calendar-import-dialog',
  imports: [
    FormField,
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    MatCheckbox,
    MatDateRangeInput,
    MatDateRangePicker,
    MatDatepickerToggle,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatEndDate,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatOption,
    MatProgressBar,
    MatSelect,
    MatStartDate,
    MatSuffix,
    MatTimepicker,
    MatTimepickerInput,
    MatTimepickerToggle,
    TranslocoPipe,
  ],
  templateUrl: './calendar-import-dialog.html',
  styleUrl: './calendar-import-dialog.scss',
})
export class CalendarImportDialog {
  // STATIC
  static open(dialog: MatDialog, data: CalendarImportDialogData): Observable<number> {
    return dialog
      .open<CalendarImportDialog, CalendarImportDialogData, number>(
        CalendarImportDialog,
        {
          data,
          width: 'min(40rem, calc(100vw - 2rem))',
          maxWidth: 'calc(100vw - 2rem)',
          maxHeight: 'calc(100dvh - 2rem)',
        },
      )
      .afterClosed()
      .pipe(filter(created => created !== undefined));
  }

  // DEPENDENCIES
  private readonly dialogRef =
    inject<MatDialogRef<CalendarImportDialog, number>>(MatDialogRef);
  private readonly data = inject<CalendarImportDialogData>(MAT_DIALOG_DATA);
  private readonly importService = inject(ImportService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);

  // STATE
  readonly titleMax = TITLE_MAX;
  readonly descriptionMax = DESCRIPTION_MAX;
  readonly timeStep = `${TIME_STEP_MINUTES}m`;
  readonly fileTypes = IMPORT_FILE_TYPES;
  readonly source = signal<ImportSource>('google');
  readonly file = signal<ImportFile | null>(null);
  readonly fileError = signal<ImportFileError | null>(null);
  private readonly fileSelection = new Subject<File | null>();
  private readonly columns = signal<ImportColumns>({});
  readonly reviewing = signal(false);
  readonly columnsOpen = signal(false);
  readonly saving = signal(false);
  private readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // DATA
  readonly preview = rxResource({
    params: () => {
      const file = this.file();
      return file ? this.toRequest(file) : undefined;
    },
    stream: ({ params }) => this.importService.preview(this.data.calendarId, params),
  });

  // COMPUTED
  readonly broken = computed<ImportBrokenEventDto[]>(() =>
    this.preview.hasValue() ? this.preview.value().broken : [],
  );

  private readonly fixes = linkedSignal(() =>
    this.broken().map(item => this.toFix(item)),
  );

  readonly fixForm = form(this.fixes, schema => {
    applyEach(schema, item => {
      const active = {
        when: (context: FieldContext<unknown>) => !context.valueOf(item.skip),
      };
      required(item.startAt, active);
      maxLength(item.title, TITLE_MAX, active);
      maxLength(item.description, DESCRIPTION_MAX, active);
      validate(item.endAt, context => {
        const start = context.valueOf(item.startAt);
        const end = context.value();
        if (context.valueOf(item.skip) || !start || !isValid(start)) return null;
        if (!end || !isValid(end)) return { kind: 'required' };
        const dates = toEventApiDates({
          allDay: context.valueOf(item.allDay),
          startAt: start,
          endAt: end,
        });
        return dates.endAt > dates.startAt ? null : { kind: 'endBeforeStart' };
      });
    });
  });

  readonly selectedColumns = linkedSignal<
    { file: ImportFile | null; columns: ImportColumnsDto | undefined },
    ImportColumnsDto | null
  >({
    source: () => ({
      file: this.file(),
      columns: this.preview.hasValue() ? this.preview.value().columns : undefined,
    }),
    computation: ({ file, columns }, previous) =>
      columns ?? (previous?.source.file === file ? previous.value : null),
  });

  readonly columnNames = computed(() => this.selectedColumns()?.names ?? []);

  readonly skippedCount = computed(() => this.fixes().filter(fix => fix.skip).length);

  readonly importCount = computed(() =>
    this.preview.hasValue()
      ? this.preview.value().ready + this.broken().length - this.skippedCount()
      : 0,
  );

  readonly canImport = computed(
    () => !this.saving() && this.importCount() > 0 && this.fixForm().valid(),
  );

  readonly errorMessage = computed<ImportMessage | null>(() => {
    const fileError = this.fileError();
    if (fileError) return { key: `import.errors.${fileError}`, params: {} };
    const error = this.preview.error();
    return error ? this.toErrorMessage(error) : null;
  });

  // LIFECYCLE
  constructor() {
    this.readSelectedFiles();
  }

  // EFFECTS
  private readSelectedFiles(): void {
    this.fileSelection
      .pipe(
        switchMap(selected => (selected ? this.readFile(selected) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe(file => this.file.set(file));
  }

  // ACTIONS
  selectSource(source: ImportSource): void {
    this.source.set(source);
    this.fileError.set(null);
    this.resetFile(null);
  }

  selectFile(input: HTMLInputElement): void {
    const selected = input.files?.[0];
    input.value = '';
    if (!selected) return;

    const tooLarge = selected.size > IMPORT_FILE_MAX_BYTES;
    this.fileError.set(tooLarge ? 'tooLarge' : null);
    this.resetFile(tooLarge ? null : selected);
  }

  selectColumn(role: 'title' | 'date', name: string): void {
    this.columns.update(columns => ({
      ...columns,
      [role]: name,
      tags: columns.tags?.filter(tag => tag !== name),
    }));
  }

  selectTagColumns(names: string[]): void {
    this.columns.update(columns => ({ ...columns, tags: names }));
  }

  skipAll(): void {
    this.fixes.update(fixes => fixes.map(fix => ({ ...fix, skip: true })));
    this.reviewing.set(false);
  }

  review(): void {
    this.fixes.update(fixes => fixes.map(fix => ({ ...fix, skip: false })));
    this.reviewing.set(true);
  }

  importEvents(): void {
    const file = this.file();
    if (!file || !this.canImport()) return;

    this.saving.set(true);
    this.dialogRef.disableClose = true;
    this.importService
      .commit(this.data.calendarId, { ...this.toRequest(file), fixes: this.toFixDtos() })
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.dialogRef.disableClose = false;
        }),
      )
      .subscribe({
        next: ({ created }) => this.dialogRef.close(created),
        error: (error: unknown) => {
          const { key, params } = this.toErrorMessage(error);
          this.snackbarService.error(this.transloco.translate(key, params));
        },
      });
  }

  close(): void {
    this.dialogRef.close();
  }

  private resetFile(selected: File | null): void {
    this.file.set(null);
    this.columns.set({});
    this.reviewing.set(false);
    this.fileSelection.next(selected);
  }

  private readFile(selected: File): Observable<ImportFile | null> {
    return from(selected.text()).pipe(
      map(content => ({ name: selected.name, content })),
      catchError(() => {
        this.fileError.set('unreadable');
        return of(null);
      }),
    );
  }

  // HELPERS
  private toErrorMessage(error: unknown): ImportMessage {
    if (!(error instanceof HttpErrorResponse)) {
      return { key: 'import.errors.unknown', params: {} };
    }
    const body: unknown = error.error;
    if (error.status === 400 && body && typeof body === 'object' && 'code' in body) {
      const { code, value } = body as { code: string; value?: string | null };
      return { key: `import.problems.${code}`, params: { value } };
    }
    if (error.status === 413) return { key: 'import.errors.tooLarge', params: {} };
    if (error.status === 429) return { key: 'import.errors.throttled', params: {} };
    return {
      key: error.status === 400 ? 'import.errors.invalid' : 'import.errors.unknown',
      params: {},
    };
  }

  private toRequest(file: ImportFile): CalendarImportDto {
    const { title, date, tags } = this.columns();
    return {
      source: this.source(),
      content: file.content,
      timeZone: this.timeZone,
      ...(this.source() === 'notion' && {
        titleColumn: title,
        dateColumn: date,
        tagColumns: tags,
      }),
    };
  }

  private toFix({ draft }: ImportBrokenEventDto): ImportFix {
    const { startAt, endAt, allDay } = draft;
    return {
      skip: false,
      title: draft.title,
      description: draft.description ?? '',
      allDay,
      ...(startAt && endAt
        ? toEventFormDates({ allDay, startAt, endAt })
        : { startAt: null, endAt: null }),
    };
  }

  private toFixDtos(): ImportFixDto[] {
    const broken = this.broken();
    return this.fixes().flatMap((fix, index) => {
      if (fix.skip || !fix.startAt) return [];
      const { draft } = broken[index];
      const dates = toEventApiDates({
        allDay: fix.allDay,
        startAt: fix.startAt,
        endAt: fix.endAt,
      });
      const data: EventCreateDto = {
        title: fix.title,
        description: fix.description || null,
        ...dates,
        recurrenceRule: draft.recurrenceRule,
        timeZone: draft.recurrenceRule ? (draft.timeZone ?? this.timeZone) : null,
      };
      return [{ index: broken[index].index, data }];
    });
  }
}
