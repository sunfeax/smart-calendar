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
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import {
  CalendarOptions,
  DateClickInfo,
  DatesSetInfo,
  EventApi,
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
import { catchError, EMPTY, Observable, switchMap, tap } from 'rxjs';
import { EventCreateDto, EventDto, EventUpdateDto } from '../../../../api/generated';
import { routePaths } from '../../../../core/constants/routePaths';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { LanguageService } from '../../../../shared/services/language.service';
import { EventCreateEditDialog } from '../../components/event-create-edit-dialog/event-create-edit-dialog';
import { EventDialogData } from '../../models/event-dialog';
import { EventRange } from '../../models/event-range';
import { CalendarService } from '../../services/calendar.service';
import { EventService } from '../../services/event.service';
import {
  countEventsByDay,
  EventDates,
  fitWeekRow,
  toEventDates,
} from '../../utils/calendar-layout';
import { toCalendarEvent, toEventApiDates } from '../../utils/event.mapper';
import { SnackbarService } from './../../../../shared/services/snackbar.service';

@Component({
  selector: 'app-calendar',
  imports: [
    FullCalendarModule,
    MatButton,
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatTooltip,
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
  private readonly renderedEvents = signal<EventDates[]>([]);

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
  readonly isOwner = computed(
    () => this.calendar.hasValue() && this.calendar.value().role === 'OWNER',
  );

  readonly canEdit = computed(() => {
    const role = this.calendar.hasValue() && this.calendar.value().role;
    return role === 'OWNER' || role === 'EDITOR';
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
    eventDisplay: 'block',
    displayEventEnd: true,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit' },
    rowEventClass: 'app-row-event',
    rowEventBeforeContent: '',
    rowEventAfterContent: '',
    dayRowClass: 'app-week-row',
    tableBodyClass: 'app-month-body',
    moreLinkClass: 'app-more-link',
    dayCellDidMount: info =>
      fitWeekRow(info.el.closest<HTMLElement>('.app-week-row'), this.eventsByDay()),
    dayCellClass: () => (this.canEdit() ? 'app-day-editable' : ''),
    dayCellTopClass: () => (this.canEdit() ? 'app-day-top' : ''),
    plugins: [themePlugin, dayGridPlugin, multiMonthPlugin, interactionPlugin],
    events: this.calendarEvents(),
    eventsSet: events => this.syncRenderedEvents(events),
    editable: this.canEdit(),
    eventDrop: info => this.saveEventDates(info),
    eventResize: info => this.saveEventDates(info),
    dateClick: info => this.createEvent(info),
    eventClick: info => this.openEvent(info.event.id),
    datesSet: info => this.changeDates(info),
  }));

  private readonly calendarEvents = computed(() =>
    this.events.hasValue() ? this.events.value().map(toCalendarEvent) : [],
  );

  private readonly eventsByDay = computed(() => countEventsByDay(this.renderedEvents()));

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
  updateEventFromMenu(eventId: string, payload: EventUpdateDto): void {
    this.updateEvent(eventId, payload).subscribe();
  }

  deleteEventFromMenu(eventId: string): void {
    this.deleteEvent(eventId).subscribe();
  }

  updateCalendarTitle(title: string): void {
    const name = title.trim();
    if (name === this.calendar.value()?.name) return;
    this.calendarService
      .update(this.id(), { name })
      .pipe(
        tap(updated => this.calendar.set(updated)),
        catchError(() => {
          this.snackbarService.error(this.transloco.translate('calendars.updateError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  navigate(action: 'prev' | 'next' | 'today'): void {
    this.fullCalendar().getApi()[action]();
  }

  private updateEvent(
    eventId: string,
    payload: EventUpdateDto,
    rollback?: () => void,
  ): Observable<EventDto> {
    return this.eventService.update(eventId, payload).pipe(
      tap(updated =>
        this.events.update(list =>
          list?.map(item => (item.id === updated.id ? updated : item)),
        ),
      ),
      catchError(() => {
        rollback?.();
        this.snackbarService.error(this.transloco.translate('event.updateError'));
        return EMPTY;
      }),
    );
  }

  private deleteEvent(eventId: string): Observable<void> {
    return ConfirmDialog.open(this.dialog, {
      title: this.transloco.translate('event.deleteTitle'),
      message: this.transloco.translate('event.deleteMessage'),
      confirmText: this.transloco.translate('event.delete'),
      variant: 'danger',
    }).pipe(
      switchMap(() => this.eventService.delete(eventId)),
      tap(() => this.events.update(list => list?.filter(item => item.id !== eventId))),
      catchError(() => {
        this.snackbarService.error(this.transloco.translate('event.deleteError'));
        return EMPTY;
      }),
    );
  }

  private openEventDialog(event: EventDto): void {
    this.dialog.open<EventCreateEditDialog, EventDialogData>(EventCreateEditDialog, {
      data: {
        event,
        editable: this.canEdit(),
        update: (payload, rollback) => this.updateEvent(event.id, payload, rollback),
        remove: () => this.deleteEvent(event.id),
      },
      width: 'min(32rem, calc(100vw - 2rem))',
      height: 'min(28rem, calc(100dvh - 2rem))',
      maxHeight: 'calc(100dvh - 2rem)',
    });
  }

  private saveNewEvent(payload: EventCreateDto): Observable<EventDto> {
    return this.eventService.create(this.id(), payload).pipe(
      tap(event => this.events.update(list => list && [...list, event])),
      catchError(() => {
        this.snackbarService.error(this.transloco.translate('event.createError'));
        return EMPTY;
      }),
    );
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
    this.updateEvent(event.id, payload, revert).subscribe();
  }

  private createEvent({ date }: DateClickInfo): void {
    if (!this.canEdit()) return;
    this.saveNewEvent(
      toEventApiDates({ allDay: true, startAt: date, endAt: null }),
    ).subscribe(event => this.openEventDialog(event));
  }

  private openEvent(eventId: string): void {
    if (!this.events.hasValue()) return;
    const event = this.events.value().find(item => item.id === eventId);
    if (event) this.openEventDialog(event);
  }

  private changeDates({ view, start, end }: DatesSetInfo): void {
    this.year.set(view.currentStart.getFullYear());
    const from = start.toISOString();
    const to = end.toISOString();
    const current = this.range();
    if (current?.from === from && current.to === to) return;
    this.range.set({ from, to });
  }

  private syncRenderedEvents(events: EventApi[]): void {
    this.renderedEvents.set(events.map(toEventDates));
  }
}
