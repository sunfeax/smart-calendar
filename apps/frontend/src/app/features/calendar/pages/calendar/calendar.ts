import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButton, MatFabButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import {
  CalendarOptions,
  DatesSetInfo,
  EventApi,
  EventChangeInfo,
  EventDragStartInfo,
  EventDragStopInfo,
  EventDropInfo,
  FullCalendarComponent,
  FullCalendarModule,
} from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import allLocales from '@fullcalendar/angular/locales-all';
import multiMonthPlugin from '@fullcalendar/angular/multimonth';
import timeGridPlugin from '@fullcalendar/angular/timegrid';
import themePlugin from '@fullcalendar/angular/themes/monarch';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { addDays, addYears, format, isToday, setMonth } from 'date-fns';
import {
  catchError,
  concat,
  defaultIfEmpty,
  EMPTY,
  exhaustMap,
  filter,
  fromEvent,
  map,
  Observable,
  of,
  switchMap,
  tap,
} from 'rxjs';
import {
  EventCreateDto,
  EventDto,
  EventDuplicateDto,
  EventUpdateDto,
  TagDto,
  TagCreateDto,
} from '../../../../api/generated';
import { routePaths } from '../../../../core/constants/routePaths';
import { UserMenu } from '../../../../shared/components/user-menu/user-menu';
import { LanguageService } from '../../../../shared/services/language.service';
import {
  CalendarShareDialog,
  CalendarShareDialogData,
  CalendarShareDialogResult,
} from '../../components/calendar-share-dialog/calendar-share-dialog';
import { CalendarArchiveDialog } from '../../components/calendar-archive-dialog/calendar-archive-dialog';
import {
  CalendarExportDialog,
  CalendarExportPeriod,
} from '../../components/calendar-export-dialog/calendar-export-dialog';
import { CalendarImportDialog } from '../../components/calendar-import-dialog/calendar-import-dialog';
import { EventEditDialog } from '../../components/event-edit-dialog/event-edit-dialog';
import { EventCard } from '../../components/event-card/event-card';
import { EventSearchDialog } from '../../components/event-search-dialog/event-search-dialog';
import { RecurrenceScopeDialog } from '../../components/recurrence-scope-dialog/recurrence-scope-dialog';
import { CalendarSwipe } from '../../directives/calendar-swipe';
import { MOBILE_QUERY } from '../../../../core/constants/breakpoints';
import { UNDO_STEPS_MAX } from '../../constants/event.constants';
import { EventDialogData } from '../../models/event-dialog';
import { EventRange } from '../../models/event-range';
import { OccurrenceTarget, RecurrenceScope } from '../../models/recurrence';
import { UndoStep } from '../../models/undo-step';
import { CalendarService } from '../../services/calendar.service';
import { EventScopeParams, EventService } from '../../services/event.service';
import { TagService } from '../../services/tag.service';
import {
  countEventsByDay,
  EventDates,
  fitWeekRow,
  pinWeekRow,
  toEventDates,
} from '../../utils/calendar-layout';
import { toCalendarEvent, toEventApiDates, toEventKey } from '../../utils/event.mapper';
import { EventsXlsxLabels } from '../../utils/events-xlsx';
import { SnackbarService } from './../../../../shared/services/snackbar.service';

@Component({
  selector: 'app-calendar',
  imports: [
    EventCard,
    FullCalendarModule,
    MatButton,
    MatFabButton,
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatTooltip,
    CalendarSwipe,
    RouterLink,
    TranslocoPipe,
    UserMenu,
  ],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class Calendar {
  // DEPENDENCIES
  private readonly calendarService = inject(CalendarService);
  private readonly eventService = inject(EventService);
  private readonly tagService = inject(TagService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly injector = inject(Injector);

  // INPUTS
  readonly id = input.required<string>();

  // STATE
  readonly routePaths = routePaths;
  private readonly viewDate = signal(new Date());
  readonly mobilePeriodMode = signal<'months' | 'years'>('months');
  readonly isDayView = signal(false);
  private readonly fullCalendar = viewChild.required(FullCalendarComponent);
  private readonly calendarSwipe = viewChild.required(CalendarSwipe);
  private readonly desktopYearMenuItems = viewChildren<MatMenuItem>('desktopYearOption');
  private readonly mobileYearMenuItems = viewChildren<MatMenuItem>('mobileYearOption');
  private readonly monthMenuItems = viewChildren<MatMenuItem>('monthOption');
  private readonly range = signal<EventRange | null>(null);
  private readonly renderedEvents = signal<EventDates[]>([]);
  private readonly trash = viewChild<ElementRef<HTMLElement>>('trash');
  readonly dragging = signal(false);
  readonly overTrash = signal(false);
  readonly copying = signal(false);
  private droppedOnTrash = false;
  private unpinToday = (): void => undefined;
  readonly isMobile = toSignal(
    this.breakpointObserver.observe(MOBILE_QUERY).pipe(map(state => state.matches)),
    { initialValue: this.breakpointObserver.isMatched(MOBILE_QUERY) },
  );

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

  readonly tagCategories = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.tagService.listCategories(params),
  });

  // COMPUTED
  readonly selectedYear = computed(() => this.viewDate().getFullYear());
  readonly yearOptions = computed(() =>
    Array.from({ length: 21 }, (_, index) => this.selectedYear() + index - 10),
  );
  readonly selectedMonth = computed(() => this.viewDate().getMonth());
  readonly monthOptions = computed(() => {
    const formatter = new Intl.DateTimeFormat(this.languageService.lang(), {
      month: 'long',
    });
    return Array.from({ length: 12 }, (_, month) => ({
      value: month,
      label: formatter.format(new Date(2000, month, 1)),
    }));
  });
  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat(this.languageService.lang(), {
      month: this.isDayView() ? 'short' : 'long',
    }).format(this.viewDate()),
  );
  readonly dayLabel = computed(() =>
    new Intl.DateTimeFormat(this.languageService.lang(), {
      weekday: 'short',
      day: 'numeric',
    }).format(this.viewDate()),
  );

  readonly periodLabel = computed(() => {
    const mobile = this.isMobile();
    return new Intl.DateTimeFormat(
      this.languageService.lang(),
      mobile
        ? this.isDayView()
          ? { weekday: 'short', day: 'numeric', month: 'short' }
          : { month: 'long', year: 'numeric' }
        : { year: 'numeric' },
    ).format(this.viewDate());
  });

  readonly previousPeriodKey = computed(() =>
    !this.isMobile()
      ? 'calendar.previousYear'
      : this.isDayView()
        ? 'calendar.previousDay'
        : 'calendar.previousMonth',
  );

  readonly nextPeriodKey = computed(() =>
    !this.isMobile()
      ? 'calendar.nextYear'
      : this.isDayView()
        ? 'calendar.nextDay'
        : 'calendar.nextMonth',
  );

  readonly isOwner = computed(
    () => this.calendar.hasValue() && this.calendar.value().role === 'OWNER',
  );

  readonly canEdit = computed(() => {
    const role = this.calendar.hasValue() && this.calendar.value().role;
    return role === 'OWNER' || role === 'EDITOR';
  });

  private readonly hasAllDayEvents = computed(() => {
    const day = format(this.viewDate(), 'yyyy-MM-dd');
    return this.renderedEvents().some(event => {
      const start = event.startAt.slice(0, 10);
      const end = event.endAt.slice(0, 10);
      return event.allDay && start <= day && (day < end || day === start);
    });
  });

  readonly options = computed<CalendarOptions>(() => ({
    initialView: this.isMobile() ? 'dayGridMonth' : 'multiMonthYear',
    multiMonthMaxColumns: 1,
    locales: allLocales,
    locale: this.languageService.lang(),
    firstDay: 1,
    height: '100%',
    fixedWeekCount: false,
    headerToolbar: false,
    borderless: true,
    viewClass: ({ view }) =>
      view.type === 'multiMonthYear'
        ? 'app-year-view'
        : view.type === 'dayGridMonth'
          ? 'app-mobile-month-view'
          : 'app-mobile-day-view',
    views: {
      dayGridMonth: {
        dayHeaderFormat: { weekday: 'narrow' },
        dayMaxEventRows: true,
        moreLinkClick: 'timeGridDay',
        displayEventEnd: false,
        expandRows: true,
      },
      timeGridDay: {
        dayHeaders: false,
        dayMaxEventRows: 4,
        slotDuration: '00:30:00',
        slotHeaderInterval: '01:00:00',
        slotHeaderFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
        scrollTime: '00:00:00',
        allDaySlot: this.hasAllDayEvents(),
        nowIndicator: true,
        eventDurationEditable: false,
        eventLongPressDelay: 300,
        dayLaneInnerClass: 'app-day-lane-inner',
        slotHeaderClass: 'app-slot-tick',
        columnEventBeforeClass: info => (info.isSelected ? 'app-touch-resizer' : ''),
        columnEventAfterClass: info => (info.isSelected ? 'app-touch-resizer' : ''),
      },
    },
    noEventsText: this.transloco.translate('calendar.noEvents'),
    dayHeaderInnerClass: 'app-weekday',
    dayCellTopInnerClass: 'app-day-number',
    eventInnerClass: 'app-event-content',
    eventClass: info =>
      [
        'app-calendar-event',
        info.isStart && 'is-start',
        info.isEnd && 'is-end',
        info.isDragging && 'is-dragging',
        info.isMirror && 'is-mirror',
      ]
        .filter(Boolean)
        .join(' '),
    eventDisplay: 'block',
    displayEventEnd: true,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit' },
    rowEventClass: 'app-row-event',
    rowEventBeforeContent: '',
    rowEventAfterContent: '',
    dayRowClass: 'app-week-row',
    tableBodyClass: 'app-month-body',
    moreLinkClass: 'app-more-link',
    highlightClass: 'app-drop-highlight',
    dayCellDidMount: info => {
      if (!this.isMobile()) {
        fitWeekRow(info.el.closest<HTMLElement>('.app-week-row'), this.eventsByDay());
      }
    },
    dayCellClass: () => (this.canEdit() || this.isMobile() ? 'app-day-editable' : ''),
    dayCellTopClass: () =>
      this.isMobile() ? 'app-day-top-center' : this.canEdit() ? 'app-day-top' : '',
    plugins: [
      themePlugin,
      dayGridPlugin,
      multiMonthPlugin,
      timeGridPlugin,
      interactionPlugin,
    ],
    events: this.calendarEvents(),
    eventsSet: events => this.syncRenderedEvents(events),
    editable: this.canEdit() && (!this.isMobile() || this.isDayView()),
    eventDragStart: info => this.startDrag(info),
    eventDragStop: info => this.stopDrag(info),
    eventDrop: info => this.dropEvent(info),
    eventResize: info => this.saveEventDates(info),
    dateClick: info => {
      if (this.calendarSwipe().ignoreTap()) return;
      if (this.isMobile() && info.view.type === 'dayGridMonth') {
        this.fullCalendar().getApi().changeView('timeGridDay', info.date);
      } else {
        this.createEvent(info.date, info.allDay);
      }
    },
    eventClick: info => {
      if (!this.calendarSwipe().ignoreTap()) this.openEvent(info.event.id);
    },
    datesSet: info => this.changeDates(info),
    viewDidMount: ({ el, view }) => {
      if (isToday(view.calendar.getDate())) this.pinToday(el);
    },
    viewWillUnmount: () => this.unpinToday(),
  }));

  private readonly tagsById = computed(() => {
    const tags = new Map<string, TagDto>();
    if (!this.tagCategories.hasValue()) return tags;
    for (const category of this.tagCategories.value()) {
      for (const tag of category.tags) tags.set(tag.id, tag);
    }
    return tags;
  });

  private readonly cardTags = computed(() =>
    this.tagCategories.hasValue()
      ? this.tagCategories
          .value()
          .filter(category => category.showOnCard)
          .flatMap(category => category.tags)
      : [],
  );

  private readonly calendarEvents = computed(() => {
    if (!this.events.hasValue()) return [];
    const tags = this.cardTags();
    return this.events.value().map(event => {
      const ids = new Set(event.tagIds);
      return toCalendarEvent(
        event,
        tags.filter(tag => ids.has(tag.id)),
      );
    });
  });

  private readonly eventsByDay = computed(() => countEventsByDay(this.renderedEvents()));

  private readonly undoSteps = linkedSignal<string, UndoStep[]>({
    source: this.id,
    computation: () => [],
  });

  // LIFECYCLE
  constructor() {
    this.fitWeekRows();
    this.syncViewWithScreen();
    this.showEventsError();
    this.showTagsError();
    this.leaveOnCalendarError();
    this.undoOnShortcut();
  }

  // EFFECTS
  private fitWeekRows(): void {
    afterRenderEffect(onCleanup => {
      if (this.isMobile()) return;
      const host = this.host.nativeElement;
      const counts = this.eventsByDay();
      const fit = (): void => {
        for (const row of host.querySelectorAll<HTMLElement>('.app-week-row')) {
          fitWeekRow(row, counts);
        }
      };
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(host);
      onCleanup(() => observer.disconnect());
    });
  }

  private syncViewWithScreen(): void {
    afterRenderEffect(() => {
      const mobile = this.isMobile();
      const api = this.fullCalendar().getApi();
      if (mobile && api.view.type === 'multiMonthYear') {
        api.changeView('dayGridMonth');
      } else if (!mobile && api.view.type !== 'multiMonthYear') {
        api.changeView('multiMonthYear');
      }
    });
  }

  private showEventsError(): void {
    effect(() => {
      if (!this.events.error()) return;
      this.snackbarService.error(this.transloco.translate('calendar.eventsError'));
    });
  }

  private showTagsError(): void {
    effect(() => {
      if (!this.tagCategories.error()) return;
      this.snackbarService.error(this.transloco.translate('tags.loadError'));
    });
  }

  private leaveOnCalendarError(): void {
    effect(() => {
      if (!this.calendar.error()) return;
      this.snackbarService.error(this.transloco.translate('calendar.loadError'));
      void this.router.navigateByUrl(routePaths.calendars);
    });
  }

  private undoOnShortcut(): void {
    fromEvent<KeyboardEvent>(document, 'keydown')
      .pipe(
        filter(event => this.isUndoShortcut(event)),
        tap(event => event.preventDefault()),
        exhaustMap(() => this.undoLast()),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  // ACTIONS
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

  openShare(): void {
    if (!this.calendar.hasValue()) return;
    const { id, role } = this.calendar.value();

    this.dialog
      .open<CalendarShareDialog, CalendarShareDialogData, CalendarShareDialogResult>(
        CalendarShareDialog,
        {
          data: { calendarId: id, role },
          width: 'min(34rem, calc(100vw - 2rem))',
          maxHeight: 'calc(100dvh - 2rem)',
        },
      )
      .afterClosed()
      .subscribe(result => {
        if (!result?.left) return;
        this.snackbarService.success(this.transloco.translate('share.left'));
        void this.router.navigateByUrl(routePaths.calendars);
      });
  }

  openArchive(): void {
    CalendarArchiveDialog.open(this.dialog, {
      calendarId: this.id(),
      tags: this.tagsById,
      restored: event => this.applyRestored(event),
    });
  }

  openSearch(): void {
    EventSearchDialog.open(this.dialog, {
      calendarId: this.id(),
      tags: this.tagsById,
    }).subscribe(event => this.openEventDialog(event));
  }

  openExport(): void {
    CalendarExportDialog.open(this.dialog)
      .pipe(switchMap(period => this.exportEvents(period)))
      .subscribe();
  }

  openImport(): void {
    CalendarImportDialog.open(this.dialog, { calendarId: this.id() }).subscribe(
      created => {
        this.events.reload();
        this.tagCategories.reload();
        this.snackbarService.success(
          this.transloco.translate('import.success', { count: created }),
        );
      },
    );
  }

  createEventInView(): void {
    this.createEvent(this.fullCalendar().getApi().getDate());
  }

  showMonth(): void {
    this.fullCalendar().getApi().changeView('dayGridMonth');
  }

  navigate(action: 'prev' | 'next' | 'today'): void {
    const api = this.fullCalendar().getApi();
    if (action === 'today' && this.isDayView() && !isToday(api.getDate())) {
      api.changeView('dayGridMonth', new Date());
      return;
    }
    api[action]();
    if (action === 'today') {
      this.pinToday(this.host.nativeElement.querySelector<HTMLElement>('.app-year-view'));
    }
  }

  selectYear(year: number): void {
    const api = this.fullCalendar().getApi();
    const date = api.getDate();
    api.gotoDate(addYears(date, year - date.getFullYear()));
  }

  selectMobileYear(year: number, event: Event): void {
    event.stopPropagation();
    const january = new Date(this.fullCalendar().getApi().getDate());
    january.setFullYear(year, 0, 1);
    this.viewDate.set(january);
    this.fullCalendar().getApi().gotoDate(january);
    this.mobilePeriodMode.set('months');
    this.focusMobilePeriod('months');
  }

  selectMonth(month: number): void {
    const api = this.fullCalendar().getApi();
    api.gotoDate(setMonth(api.getDate(), month));
  }

  openMobilePeriodPicker(): void {
    this.mobilePeriodMode.set('months');
    this.focusMobilePeriod('months');
  }

  showMobilePeriod(period: 'months' | 'years', event: Event): void {
    event.stopPropagation();
    this.mobilePeriodMode.set(period);
    this.focusMobilePeriod(period);
  }

  focusSelectedYear(): void {
    afterNextRender(
      () =>
        this.desktopYearMenuItems()[
          this.yearOptions().indexOf(this.selectedYear())
        ]?.focus('program'),
      { injector: this.injector },
    );
  }

  private pinToday(view: HTMLElement | null): void {
    this.unpinToday();
    if (view?.classList.contains('app-year-view')) {
      this.unpinToday = pinWeekRow(view, format(new Date(), 'yyyy-MM-dd'));
    }
  }

  private focusMobilePeriod(period: 'months' | 'years'): void {
    afterNextRender(
      () => {
        const item =
          period === 'years'
            ? this.mobileYearMenuItems()[this.yearOptions().indexOf(this.selectedYear())]
            : this.monthMenuItems()[this.selectedMonth()];
        item?.focus('program');
      },
      { injector: this.injector },
    );
  }

  private updateTarget(
    target: OccurrenceTarget,
    payload: EventUpdateDto,
    rollback?: () => void,
  ): Observable<EventDto> {
    let scope$: Observable<RecurrenceScope | null | undefined> = of(undefined);
    if (target.originalStart) {
      scope$ =
        payload.recurrenceRule !== undefined
          ? of('all')
          : this.askScope(target, 'update');
    }

    return scope$.pipe(
      switchMap(scope => {
        if (scope === null) {
          rollback?.();
          return EMPTY;
        }
        return this.eventService.update(
          target.id,
          this.withTimeZone(payload, scope),
          scope && target.originalStart
            ? { scope, originalStart: target.originalStart }
            : undefined,
        );
      }),
      tap(updated => this.applyUpdate(target, payload, updated)),
      catchError(() => {
        rollback?.();
        this.snackbarService.error(this.transloco.translate('event.updateError'));
        return EMPTY;
      }),
    );
  }

  private applyUpdate(
    target: OccurrenceTarget,
    payload: EventUpdateDto,
    updated: EventDto,
  ): void {
    const isSeries =
      target.originalStart !== null ||
      updated.recurrenceRule !== null ||
      payload.recurrenceRule !== undefined;

    target.id = updated.id;
    target.originalStart = updated.originalStart;
    if (target.scope === 'following') target.scope = 'all';

    if (isSeries) {
      this.events.reload();
    } else {
      this.replaceEvent(updated);
    }
  }

  private askScope(
    target: OccurrenceTarget,
    action: 'update' | 'delete',
  ): Observable<RecurrenceScope | null> {
    if (target.scope) return of(target.scope);
    return RecurrenceScopeDialog.open(this.dialog, { action }).pipe(
      tap(scope => (target.scope = scope)),
      defaultIfEmpty(null),
    );
  }

  private exportEvents({ start, end }: CalendarExportPeriod): Observable<void> {
    const range = { from: start.toISOString(), to: addDays(end, 1).toISOString() };

    return this.eventService.getListRange(this.id(), range).pipe(
      switchMap(events =>
        import('../../utils/events-xlsx').then(({ downloadEventsXlsx }) =>
          downloadEventsXlsx(
            events,
            this.tagCategories.value() ?? [],
            this.toExportLabels(),
            this.toExportFileName(start, end),
          ),
        ),
      ),
      catchError(() => {
        this.snackbarService.error(this.transloco.translate('export.error'));
        return EMPTY;
      }),
    );
  }

  private deleteTarget(target: OccurrenceTarget): Observable<void> {
    const { originalStart } = target;
    if (!originalStart) return this.deleteEvent(target.id);

    return RecurrenceScopeDialog.open(this.dialog, { action: 'delete' }).pipe(
      switchMap(scope =>
        this.eventService.delete(target.id, { scope, originalStart }).pipe(
          tap(() => {
            this.events.reload();
            if (scope === 'following') {
              this.snackbarService.success(this.transloco.translate('event.deleted'));
            } else {
              this.offerRestore(
                target.id,
                scope === 'this' ? { scope, originalStart } : undefined,
              );
            }
          }),
        ),
      ),
      catchError(() => {
        this.snackbarService.error(this.transloco.translate('event.deleteError'));
        return EMPTY;
      }),
    );
  }

  private deleteEvent(eventId: string): Observable<void> {
    return this.eventService.delete(eventId).pipe(
      tap(() => {
        this.events.update(list => list?.filter(item => item.id !== eventId));
        this.offerRestore(eventId);
      }),
      catchError(() => {
        this.snackbarService.error(this.transloco.translate('event.deleteError'));
        return EMPTY;
      }),
    );
  }

  private offerRestore(eventId: string, scope?: EventScopeParams): void {
    const step: UndoStep = () =>
      this.eventService
        .restore(eventId, scope)
        .pipe(tap(restored => this.applyRestored(restored)));
    this.pushUndo(step);
    this.snackbarService
      .withAction(
        this.transloco.translate('event.deleted'),
        this.transloco.translate('common.undo'),
      )
      .pipe(switchMap(() => this.runUndo(step)))
      .subscribe();
  }

  private pushUndo(step: UndoStep): void {
    this.undoSteps.update(steps => [...steps, step].slice(-UNDO_STEPS_MAX));
  }

  private undoLast(): Observable<unknown> {
    const step = this.undoSteps().at(-1);
    if (!step) return EMPTY;
    this.snackbarService.dismiss();
    return this.runUndo(step);
  }

  private runUndo(step: UndoStep): Observable<unknown> {
    this.undoSteps.update(steps => steps.filter(item => item !== step));
    return step().pipe(
      catchError(() => {
        this.snackbarService.error(this.transloco.translate('event.undoError'));
        this.events.reload();
        return EMPTY;
      }),
    );
  }

  private duplicateEvent(eventId: string, dates: EventDuplicateDto): void {
    this.eventService
      .duplicate(eventId, dates)
      .pipe(
        tap(created => {
          this.events.update(list => list && [...list, created]);
          this.pushUndo(this.undoCreate(created.id));
        }),
        catchError(() => {
          this.snackbarService.error(this.transloco.translate('event.duplicateError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private applyRestored(restored: EventDto): void {
    if (restored.recurrenceRule) {
      this.events.reload();
      return;
    }
    this.events.update(list => (list ? [...list, restored] : [restored]));
  }

  private openEventDialog(event: EventDto, undoable = true): void {
    const target: OccurrenceTarget = {
      id: event.id,
      originalStart: event.originalStart,
      scope: null,
    };
    let canUndoEdit =
      undoable && event.originalStart === null && event.recurrenceRule === null;
    const markEdited = (): void => {
      if (!canUndoEdit) return;
      canUndoEdit = false;
      this.pushUndo(this.undoEdit(event));
    };

    this.dialog.open<EventEditDialog, EventDialogData>(EventEditDialog, {
      data: {
        event,
        editable: this.canEdit(),
        update: (payload, rollback) =>
          this.updateTarget(target, payload, rollback).pipe(tap(markEdited)),
        remove: () => this.deleteTarget(target),
        categories: this.tagCategories,
        createTag: (categoryId, payload) => this.createTag(categoryId, payload),
        setTag: (tagId, assigned) =>
          this.setEventTag(target.id, tagId, assigned).pipe(tap(markEdited)),
      },
      width: 'min(40rem, calc(100vw - var(--event-dialog-gutter)))',
      height:
        'min(var(--event-dialog-max-height), calc(100dvh - var(--event-dialog-gutter)))',
      maxWidth: '100vw',
      maxHeight: '100dvh',
      panelClass: 'app-event-dialog',
    });
  }

  private createTag(categoryId: string, payload: TagCreateDto): Observable<TagDto> {
    return this.tagService.createTag(categoryId, payload).pipe(
      tap(tag =>
        this.tagCategories.update(list =>
          list?.map(category =>
            category.id === categoryId
              ? { ...category, tags: [...category.tags, tag] }
              : category,
          ),
        ),
      ),
      catchError(() => {
        this.snackbarService.error(this.transloco.translate('tags.createError'));
        return EMPTY;
      }),
    );
  }

  private setEventTag(
    eventId: string,
    tagId: string,
    assigned: boolean,
  ): Observable<EventDto> {
    const request = assigned
      ? this.eventService.addTag(eventId, tagId)
      : this.eventService.removeTag(eventId, tagId);

    return request.pipe(
      tap(updated =>
        this.events.update(list =>
          list?.map(item =>
            item.id === updated.id ? { ...item, tagIds: updated.tagIds } : item,
          ),
        ),
      ),
      catchError(() => {
        this.snackbarService.error(this.transloco.translate('tags.setError'));
        return EMPTY;
      }),
    );
  }

  private replaceEvent(updated: EventDto): void {
    this.events.update(list =>
      list?.map(item => (item.id === updated.id ? updated : item)),
    );
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
  private startDrag({ jsEvent }: EventDragStartInfo): void {
    this.droppedOnTrash = false;
    this.dragging.set(true);
    this.trackCopy(jsEvent);
    document.addEventListener('pointermove', this.trackTrash);
    document.addEventListener('pointermove', this.trackCopy);
    document.addEventListener('keydown', this.trackCopy);
    document.addEventListener('keyup', this.trackCopy);
  }

  private stopDrag({ event }: EventDragStopInfo): void {
    document.removeEventListener('pointermove', this.trackTrash);
    document.removeEventListener('pointermove', this.trackCopy);
    document.removeEventListener('keydown', this.trackCopy);
    document.removeEventListener('keyup', this.trackCopy);
    this.droppedOnTrash = this.overTrash();
    this.dragging.set(false);
    this.overTrash.set(false);
    this.copying.set(false);
    if (!this.droppedOnTrash) return;

    const target: OccurrenceTarget = {
      id: event.extendedProps['eventId'] as string,
      originalStart: event.extendedProps['originalStart'] as string | null,
      scope: null,
    };
    setTimeout(() => this.deleteTarget(target).subscribe());
  }

  private dropEvent(info: EventDropInfo): void {
    if (this.droppedOnTrash) {
      info.revert();
      return;
    }
    if (info.jsEvent.altKey || info.jsEvent.metaKey) {
      const dates = this.toDropDates(info.event);
      info.revert();
      if (dates)
        this.duplicateEvent(info.event.extendedProps['eventId'] as string, dates);
      return;
    }
    this.saveEventDates(info);
  }

  private readonly trackCopy = ({
    altKey,
    metaKey,
  }: MouseEvent | KeyboardEvent): void => {
    this.copying.set(altKey || metaKey);
  };

  private readonly trackTrash = ({ clientX, clientY }: PointerEvent): void => {
    const rect = this.trash()?.nativeElement.getBoundingClientRect();
    this.overTrash.set(
      !!rect &&
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom,
    );
  };

  private saveEventDates({ event, oldEvent, revert }: EventChangeInfo): void {
    const payload = this.toDropDates(event);
    if (!payload) {
      revert();
      return;
    }
    const eventId = event.extendedProps['eventId'] as string;
    const originalStart = event.extendedProps['originalStart'] as string | null;
    const previous = this.toDropDates(oldEvent);

    this.updateTarget(
      { id: eventId, originalStart, scope: null },
      payload,
      revert,
    ).subscribe(() => {
      if (originalStart === null && previous) {
        this.pushUndo(this.undoDates(eventId, previous));
      }
    });
  }

  private createEvent(date: Date, allDay = true): void {
    if (!this.canEdit()) return;
    this.saveNewEvent(toEventApiDates({ allDay, startAt: date, endAt: null })).subscribe(
      event => {
        this.pushUndo(this.undoCreate(event.id));
        this.openEventDialog(event, false);
      },
    );
  }

  private openEvent(eventKey: string): void {
    if (!this.events.hasValue()) return;
    const event = this.events.value().find(item => toEventKey(item) === eventKey);
    if (event) this.openEventDialog(event);
  }

  private changeDates({ view, start, end }: DatesSetInfo): void {
    this.viewDate.set(view.currentStart);
    this.isDayView.set(view.type === 'timeGridDay');
    const from = start.toISOString();
    const to = end.toISOString();
    const current = this.range();
    if (current?.from === from && current.to === to) return;
    this.range.set({ from, to });
  }

  private syncRenderedEvents(events: EventApi[]): void {
    this.renderedEvents.set(events.map(toEventDates));
  }

  // HELPERS
  private toExportLabels(): EventsXlsxLabels {
    const t = (key: string) => this.transloco.translate(key);
    return {
      title: t('event.title'),
      untitled: t('event.untitled'),
      description: t('event.description'),
      startAt: t('event.startAt'),
      endAt: t('event.endAt'),
      allDay: t('export.allDay'),
      completed: t('event.completed'),
      tags: t('tags.tags'),
      yes: t('export.yes'),
      no: t('export.no'),
    };
  }

  private toExportFileName(start: Date, end: Date): string {
    const name =
      this.calendar.value()?.name || this.transloco.translate('calendars.unnamed');
    return `${name} ${format(start, 'yyyy-MM-dd')} – ${format(end, 'yyyy-MM-dd')}.xlsx`;
  }

  private withTimeZone(
    payload: EventUpdateDto,
    scope: RecurrenceScope | undefined,
  ): EventUpdateDto {
    if (scope === 'this' || (payload.allDay !== false && !payload.recurrenceRule)) {
      return payload;
    }
    return { ...payload, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  }

  private toDropDates({ allDay, start, end }: EventApi): EventDuplicateDto | null {
    if (!start) return null;
    return toEventApiDates({
      allDay,
      startAt: start,
      endAt: end && allDay ? addDays(end, -1) : end,
    });
  }

  private isUndoShortcut(event: KeyboardEvent): boolean {
    const target = event.target;
    const editingText =
      target instanceof HTMLElement &&
      (target.isContentEditable || !!target.closest('input, textarea, select'));
    return (
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.code === 'KeyZ' &&
      !editingText &&
      this.canEdit() &&
      this.dialog.openDialogs.length === 0
    );
  }

  private undoCreate(eventId: string): UndoStep {
    return () =>
      this.eventService.delete(eventId).pipe(
        switchMap(() => this.eventService.deleteArchived(eventId)),
        tap(() => this.events.update(list => list?.filter(item => item.id !== eventId))),
      );
  }

  private undoDates(eventId: string, dates: EventDuplicateDto): UndoStep {
    return () =>
      this.eventService
        .update(eventId, this.withTimeZone(dates, undefined))
        .pipe(tap(updated => this.replaceEvent(updated)));
  }

  private undoEdit(snapshot: EventDto): UndoStep {
    const { id, title, description, icon, allDay, startAt, endAt, completedAt, tagIds } =
      snapshot;
    const payload: EventUpdateDto = {
      title,
      description,
      icon,
      allDay,
      startAt,
      endAt,
      completed: completedAt !== null,
      recurrenceRule: null,
    };

    return () =>
      this.eventService.update(id, this.withTimeZone(payload, undefined)).pipe(
        switchMap(updated => {
          const current = new Set(updated.tagIds);
          const original = new Set(tagIds);
          const requests = [
            ...tagIds
              .filter(tagId => !current.has(tagId))
              .map(tagId => this.eventService.addTag(id, tagId)),
            ...updated.tagIds
              .filter(tagId => !original.has(tagId))
              .map(tagId => this.eventService.removeTag(id, tagId)),
          ];
          return concat(...requests);
        }),
        tap({ complete: () => this.events.reload() }),
      );
  }
}
