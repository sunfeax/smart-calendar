import { Component, inject, signal } from '@angular/core';
import { form, FormField, required, validate } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatDateRangeInput,
  MatDateRangePicker,
  MatDatepickerToggle,
  MatEndDate,
  MatStartDate,
} from '@angular/material/datepicker';
import {
  MatDialog,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { differenceInCalendarDays, endOfMonth, isValid, startOfMonth } from 'date-fns';
import { filter, Observable } from 'rxjs';
import { EXPORT_MAX_DAYS } from '../../constants/export.constants';

export interface CalendarExportPeriod {
  start: Date;
  end: Date;
}

@Component({
  selector: 'app-calendar-export-dialog',
  imports: [
    FormField,
    MatButton,
    MatDateRangeInput,
    MatDateRangePicker,
    MatDatepickerToggle,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatEndDate,
    MatError,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatLabel,
    MatStartDate,
    MatSuffix,
    TranslocoPipe,
  ],
  templateUrl: './calendar-export-dialog.html',
  styleUrl: './calendar-export-dialog.scss',
})
export class CalendarExportDialog {
  // STATIC
  static open(dialog: MatDialog): Observable<CalendarExportPeriod> {
    return dialog
      .open<CalendarExportDialog, void, CalendarExportPeriod>(CalendarExportDialog, {
        width: 'min(26rem, calc(100vw - 2rem))',
      })
      .afterClosed()
      .pipe(filter(period => period !== undefined));
  }

  // DEPENDENCIES
  private readonly dialogRef =
    inject<MatDialogRef<CalendarExportDialog, CalendarExportPeriod>>(MatDialogRef);

  // STATE
  readonly today = new Date();
  private readonly model = signal<{ start: Date | null; end: Date | null }>({
    start: startOfMonth(this.today),
    end: endOfMonth(this.today),
  });

  readonly periodForm = form(this.model, schema => {
    required(schema.start);
    required(schema.end);
    validate(schema.end, context => {
      const end = context.value();
      const start = context.valueOf(schema.start);

      if (!start || !end || !isValid(start) || !isValid(end)) return null;

      const days = differenceInCalendarDays(end, start);
      if (days < 0) return { kind: 'endBeforeStart' };
      return days < EXPORT_MAX_DAYS ? null : { kind: 'periodTooLong' };
    });
  });

  // ACTIONS
  download(): void {
    const { start, end } = this.periodForm().value();
    if (this.periodForm().invalid() || !start || !end) return;
    this.dialogRef.close({ start, end });
  }

  close(): void {
    this.dialogRef.close();
  }
}
