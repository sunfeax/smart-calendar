import { Component, effect, inject } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, EMPTY, exhaustMap, filter, Subject, switchMap, tap } from 'rxjs';
import { CalendarDto, CalendarUpdateDto } from '../../../../api/generated';
import { routePaths } from '../../../../core/constants/routePaths';
import { CalendarAddCard } from '../../components/calendar-add-card/calendar-add-card';
import { CalendarCard } from '../../components/calendar-card/calendar-card';
import { CalendarEditDialog } from '../../components/calendar-edit-dialog/calendar-edit-dialog';
import { CalendarService } from '../../services/calendar.service';
import { DialogService } from './../../../../shared/services/dialog.service';
import { SnackbarService } from './../../../../shared/services/snackbar.service';

@Component({
  imports: [CalendarCard, CalendarAddCard],
  selector: 'app-calendars',
  styleUrl: './calendars.scss',
  templateUrl: './calendars.html',
})
export class Calendars {
  private readonly calendarService = inject(CalendarService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialogService = inject(DialogService);
  private readonly transloco = inject(TranslocoService);

  readonly routePaths = routePaths;

  readonly calendars = rxResource({
    stream: () => this.calendarService.getList(),
  });

  private readonly createClick$ = new Subject<void>();

  private readonly createResponse$ = this.createClick$.pipe(
    exhaustMap(() =>
      this.calendarService.create().pipe(
        tap(() => {
          this.snackbarService.success(
            this.transloco.translate('calendars.createSuccess'),
          );
          this.calendars.reload();
        }),
        catchError(() => {
          this.snackbarService.error(this.transloco.translate('calendars.createError'));
          return EMPTY;
        }),
      ),
    ),
    takeUntilDestroyed(),
  );

  constructor() {
    this.createResponse$.subscribe();

    effect(() => {
      if (!this.calendars.error()) return;
      this.snackbarService.error(this.transloco.translate('calendars.loadError'));
    });
  }

  createRequest(): void {
    this.createClick$.next();
  }

  edit(calendar: CalendarDto): void {
    this.dialogService
      .open<CalendarEditDialog, CalendarUpdateDto, CalendarUpdateDto>(
        CalendarEditDialog,
        {
          data: { name: calendar.name },
          autoFocus: 'input',
        },
      )
      .pipe(
        filter(body => body !== undefined),
        switchMap(body => this.calendarService.update(calendar.id, body)),
      )
      .subscribe(this.handleResult('update'));
  }

  delete(calendarId: string): void {
    this.dialogService
      .confirm({
        title: this.transloco.translate('calendars.deleteTitle'),
        message: this.transloco.translate('calendars.deleteMessage'),
        confirmText: this.transloco.translate('calendars.delete'),
        cancelText: this.transloco.translate('common.cancel'),
        variant: 'danger',
      })
      .pipe(switchMap(() => this.calendarService.delete(calendarId)))
      .subscribe(this.handleResult('delete'));
  }

  private handleResult(action: 'update' | 'delete') {
    return {
      next: () => {
        this.snackbarService.success(
          this.transloco.translate(`calendars.${action}Success`),
        );
        this.calendars.reload();
      },
      error: () =>
        this.snackbarService.error(this.transloco.translate(`calendars.${action}Error`)),
    };
  }
}
