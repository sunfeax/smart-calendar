import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import {
  CalendarOptions,
  EventChangeInfo,
  FullCalendarComponent,
  FullCalendarModule,
} from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import allLocales from '@fullcalendar/angular/locales-all';
import multiMonthPlugin from '@fullcalendar/angular/multimonth';
import themePlugin from '@fullcalendar/angular/themes/monarch';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { addDays } from 'date-fns';
import { catchError, EMPTY, filter, Observable, switchMap, tap } from 'rxjs';
import { routePaths } from '../../../../core/constants/routePaths';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { LanguageService } from '../../../../shared/services/language.service';
import { EventCreateEditDialog } from '../../components/event-create-edit-dialog/event-create-edit-dialog';
import { EventDialogData, EventDialogResult } from '../../models/event-dialog';
import { EventRange } from '../../models/event-range';
import { CalendarService } from '../../services/calendar.service';
import { EventService } from '../../services/event.service';
import { countEventsByDay, fitWeekRow } from '../../utils/calendar-layout';
import { toCalendarEvent, toEventApiDates } from '../../utils/event.mapper';
import { SnackbarService } from './../../../../shared/services/snackbar.service';

@Component({
  selector: 'app-calendar',
  imports: [
    FullCalendarModule,
    MatButton,
    MatCheckbox,
    MatIcon,
    MatIconButton,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class Calendar {
  // DEPENDENCIES
  private readonly calendarService = inject(CalendarService);
  private readonly eventService = inject(EventService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // INPUTS
  readonly id = input.required<string>();

  // STATE
  readonly routePaths = routePaths;
  readonly year = signal(new Date().getFullYear());
  private readonly fullCalendar = viewChild.required(FullCalendarComponent);
  private readonly range = signal<EventRange | null>(null);

  // DATA
  readonly calendar = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.calendarService.get(params),
  });

  readonly events = rxResource({
    params: () => {
      const range = this.range();
      if (!range) return undefined;
      return { id: this.id(), range };
    },
    stream: ({ params }) => this.eventService.getListRange(params.id, params.range),
  });

  // COMPUTED
  readonly canEdit = computed(() => {
    const role = this.calendar.hasValue() ? this.calendar.value().role : undefined;
    if (role === 'OWNER' || role === 'EDITOR') return true;
    return false;
  });

  readonly options = computed<CalendarOptions>(() => ({
    initialView: 'multiMonthYear',
    multiMonthMaxColumns: 1,
    locales: allLocales,
    locale: this.languageService.lang(),
    firstDay: 1,
    height: '100%',
    fixedWeekCount: false,
    headerToolbar: false,
    borderlessTop: true,
    viewClass: 'app-year-view',
    dayHeaderInnerClass: 'app-weekday',
    dayCellTopInnerClass: 'app-day-number',
    eventInnerClass: 'app-event-content',
    eventClass: 'app-calendar-event',
    rowEventBeforeContent: '',
    rowEventAfterContent: '',
    dayRowClass: 'app-week-row',
    tableBodyClass: 'app-month-body',
    dayCellDidMount: info =>
      fitWeekRow(info.el.closest<HTMLElement>('.app-week-row'), this.eventsByDay()),
    dayCellClass: () => (this.canEdit() ? 'app-day-editable' : ''),
    dayCellTopClass: () => (this.canEdit() ? 'app-day-top' : ''),
    plugins: [themePlugin, dayGridPlugin, multiMonthPlugin, interactionPlugin],
    events: this.calendarEvents(),
    editable: this.canEdit(),
    eventDrop: info => this.saveEventDates(info),
    eventResize: info => this.saveEventDates(info),
    dateClick: info => {
      if (this.canEdit())
        this.openEventDialog({
          mode: 'create',
          date: info.dateStr,
          editable: this.canEdit(),
        });
    },
    eventClick: info => this.editEvent(info.event.id),
    datesSet: info => {
      this.year.set(info.view.currentStart.getFullYear());
      this.setRange(info.start.toISOString(), info.end.toISOString());
    },
  }));

  private readonly calendarEvents = computed(() =>
    this.events.hasValue() ? this.events.value().map(toCalendarEvent) : [],
  );

  private readonly eventsByDay = computed(() =>
    countEventsByDay(this.events.hasValue() ? this.events.value() : []),
  );

  // LIFECYCLE
  constructor() {
    this.fitWeekRows();
    this.showEventsError();
    this.leaveOnCalendarError();
  }

  // EFFECTS
  private fitWeekRows(): void {
    afterRenderEffect(() => {
      for (const row of this.host.nativeElement.querySelectorAll<HTMLElement>(
        '.app-week-row',
      )) {
        fitWeekRow(row, this.eventsByDay());
      }
    });
  }

  private showEventsError(): void {
    effect(() => {
      if (!this.events.error()) return;
      this.snackbarService.error(this.transloco.translate('calendar.eventsError'));
    });
  }

  private leaveOnCalendarError(): void {
    effect(() => {
      if (!this.calendar.error()) return;
      this.snackbarService.error(this.transloco.translate('calendar.loadError'));
      void this.router.navigateByUrl(routePaths.calendars);
    });
  }

  // ACTIONS
  toggleCompleted(eventId: string, completed: boolean): void {
    this.submitEvent({ action: 'update', eventId, payload: { completed } }).subscribe();
  }

  navigate(action: 'prev' | 'next' | 'today'): void {
    this.fullCalendar().getApi()[action]();
  }

  private openEventDialog(data: EventDialogData): void {
    this.dialog
      .open<EventCreateEditDialog, EventDialogData, EventDialogResult>(
        EventCreateEditDialog,
        {
          data,
          width: 'min(40rem, calc(100vw - 2rem))',
          height: 'min(32rem, calc(100dvh - 2rem))',
          maxHeight: 'calc(100dvh - 2rem)',
        },
      )
      .afterClosed()
      .pipe(
        filter(result => result !== undefined),
        switchMap(result => this.submitEvent(result)),
      )
      .subscribe();
  }

  private submitEvent(
    result: NonNullable<EventDialogResult>,
    rollback?: () => void,
  ): Observable<unknown> {
    return this.sendEvent(result).pipe(
      catchError(() => {
        rollback?.();
        this.snackbarService.error(
          this.transloco.translate(`event.${result.action}Error`),
        );
        return EMPTY;
      }),
    );
  }

  private sendEvent(result: NonNullable<EventDialogResult>): Observable<unknown> {
    switch (result.action) {
      case 'create':
        return this.eventService
          .create(this.id(), result.payload)
          .pipe(tap(created => this.events.update(list => list && [...list, created])));
      case 'update':
        return this.eventService
          .update(result.eventId, result.payload)
          .pipe(
            tap(updated =>
              this.events.update(list =>
                list?.map(item => (item.id === updated.id ? updated : item)),
              ),
            ),
          );
      case 'delete':
        return this.confirmDeleteEvent(result.eventId).pipe(
          tap(() =>
            this.events.update(list => list?.filter(item => item.id !== result.eventId)),
          ),
        );
    }
  }

  private confirmDeleteEvent(eventId: string): Observable<void> {
    return ConfirmDialog.open(this.dialog, {
      title: this.transloco.translate('event.deleteTitle'),
      message: this.transloco.translate('event.deleteMessage'),
      confirmText: this.transloco.translate('event.delete'),
      variant: 'danger',
    }).pipe(switchMap(() => this.eventService.delete(eventId)));
  }

  // HANDLERS
  private saveEventDates({ event, revert }: EventChangeInfo): void {
    const { allDay, start, end } = event;
    if (!start) {
      revert();
      return;
    }

    const payload = toEventApiDates({
      allDay,
      startAt: start,
      endAt: end && allDay ? addDays(end, -1) : end,
    });

    this.submitEvent(
      { action: 'update', eventId: event.id, payload },
      revert,
    ).subscribe();
  }

  private editEvent(eventId: string): void {
    if (!this.events.hasValue()) return;
    const event = this.events.value().find(item => item.id === eventId);
    if (event) this.openEventDialog({ mode: 'update', event, editable: this.canEdit() });
  }

  private setRange(from: string, to: string): void {
    const current = this.range();
    if (current?.from === from && current.to === to) return;
    this.range.set({ from, to });
  }
}
