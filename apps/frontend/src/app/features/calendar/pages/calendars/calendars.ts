import { Component, effect, inject } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import {
  catchError,
  EMPTY,
  exhaustMap,
  filter,
  Observable,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { CalendarDto, CalendarUpdateDto } from '../../../../api/generated';
import { routePaths } from '../../../../core/constants/routePaths';
import { AuthService } from '../../../auth/service/auth.service';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { CalendarAddCard } from '../../components/calendar-add-card/calendar-add-card';
import { CalendarCard } from '../../components/calendar-card/calendar-card';
import { CalendarEditDialog } from '../../components/calendar-edit-dialog/calendar-edit-dialog';
import { CalendarAction } from '../../models/calendar-action';
import { CalendarService } from '../../services/calendar.service';
import { MemberService } from '../../services/member.service';
import { SnackbarService } from './../../../../shared/services/snackbar.service';

@Component({
  imports: [CalendarCard, CalendarAddCard],
  selector: 'app-calendars',
  styleUrl: './calendars.scss',
  templateUrl: './calendars.html',
})
export class Calendars {
  // DEPENDENCIES
  private readonly calendarService = inject(CalendarService);
  private readonly memberService = inject(MemberService);
  private readonly authService = inject(AuthService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  // STATE
  readonly routePaths = routePaths;

  private readonly createClick$ = new Subject<void>();

  private readonly createResponse$ = this.createClick$.pipe(
    exhaustMap(() => this.submitCalendar({ action: 'create' })),
    takeUntilDestroyed(),
  );

  // DATA
  readonly calendars = rxResource({
    stream: () => this.calendarService.getList(),
  });

  // LIFECYCLE
  constructor() {
    this.listenCreateRequests();
    this.showLoadError();
  }

  // EFFECTS
  private listenCreateRequests(): void {
    this.createResponse$.subscribe();
  }

  private showLoadError(): void {
    effect(() => {
      if (!this.calendars.error()) return;
      this.snackbarService.error(this.transloco.translate('calendars.loadError'));
    });
  }

  // ACTIONS
  createCalendar(): void {
    this.createClick$.next();
  }

  editCalendar(calendar: CalendarDto): void {
    this.dialog
      .open<CalendarEditDialog, CalendarUpdateDto, CalendarUpdateDto>(
        CalendarEditDialog,
        {
          data: { name: calendar.name },
          autoFocus: 'input',
        },
      )
      .afterClosed()
      .pipe(
        filter(payload => payload !== undefined),
        switchMap(payload =>
          this.submitCalendar({ action: 'update', calendarId: calendar.id, payload }),
        ),
      )
      .subscribe();
  }

  deleteCalendar(calendarId: string): void {
    this.submitCalendar({ action: 'delete', calendarId }).subscribe();
  }

  leaveCalendar(calendarId: string): void {
    const userId = this.authService.user()?.id;
    if (!userId) return;

    ConfirmDialog.open(this.dialog, {
      title: this.transloco.translate('share.leaveTitle'),
      message: this.transloco.translate('share.leaveMessage'),
      confirmText: this.transloco.translate('share.leave'),
      variant: 'danger',
    })
      .pipe(
        switchMap(() => this.memberService.remove(calendarId, userId)),
        tap(() => {
          this.calendars.update(list => list?.filter(item => item.id !== calendarId));
          this.snackbarService.success(this.transloco.translate('share.left'));
        }),
        catchError(() => {
          this.snackbarService.error(this.transloco.translate('share.leaveError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private submitCalendar(result: CalendarAction): Observable<unknown> {
    return this.sendCalendar(result).pipe(
      tap(() =>
        this.snackbarService.success(
          this.transloco.translate(`calendars.${result.action}Success`),
        ),
      ),
      catchError(() => {
        this.snackbarService.error(
          this.transloco.translate(`calendars.${result.action}Error`),
        );
        return EMPTY;
      }),
    );
  }

  private sendCalendar(result: CalendarAction): Observable<unknown> {
    switch (result.action) {
      case 'create':
        return this.calendarService
          .create()
          .pipe(
            tap(created => void this.router.navigate([routePaths.calendars, created.id])),
          );
      case 'update':
        return this.calendarService
          .update(result.calendarId, result.payload)
          .pipe(
            tap(updated =>
              this.calendars.update(list =>
                list?.map(item => (item.id === updated.id ? updated : item)),
              ),
            ),
          );
      case 'delete':
        return this.confirmDeleteCalendar(result.calendarId).pipe(
          tap(() =>
            this.calendars.update(list =>
              list?.filter(item => item.id !== result.calendarId),
            ),
          ),
        );
    }
  }

  private confirmDeleteCalendar(calendarId: string): Observable<void> {
    return ConfirmDialog.open(this.dialog, {
      title: this.transloco.translate('calendars.deleteTitle'),
      message: this.transloco.translate('calendars.deleteMessage'),
      confirmText: this.transloco.translate('calendars.delete'),
      variant: 'danger',
    }).pipe(switchMap(() => this.calendarService.delete(calendarId)));
  }
}
