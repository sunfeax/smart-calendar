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
import { addDays, format } from 'date-fns';
import { catchError, defaultIfEmpty, EMPTY, Observable, of, switchMap, tap } from 'rxjs';
import {
  EventCreateDto,
  EventDto,
  EventUpdateDto,
  TagDto,
  TagCreateDto,
} from '../../../../api/generated';
import { routePaths } from '../../../../core/constants/routePaths';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { UserMenu } from '../../../../shared/components/user-menu/user-menu';
import { TruncatePipe } from '../../../../shared/pipes/truncate.pipe';
import { LanguageService } from '../../../../shared/services/language.service';
import {
  CalendarShareDialog,
  CalendarShareDialogData,
  CalendarShareDialogResult,
} from '../../components/calendar-share-dialog/calendar-share-dialog';
import {
  CalendarExportDialog,
  CalendarExportPeriod,
} from '../../components/calendar-export-dialog/calendar-export-dialog';
import { EventEditDialog } from '../../components/event-edit-dialog/event-edit-dialog';
import { EventIcon } from '../../components/event-icon/event-icon';
import { RecurrenceScopeDialog } from '../../components/recurrence-scope-dialog/recurrence-scope-dialog';
import { TAG_CARD_NAME_MAX } from '../../constants/tag.constants';
import { EventDialogData } from '../../models/event-dialog';
import { EventRange } from '../../models/event-range';
import { OccurrenceTarget, RecurrenceScope } from '../../models/recurrence';
import { CalendarService } from '../../services/calendar.service';
import { EventService } from '../../services/event.service';
import { TagService } from '../../services/tag.service';
import {
  countEventsByDay,
  EventDates,
  fitWeekRow,
  toEventDates,
} from '../../utils/calendar-layout';
import { toCalendarEvent, toEventApiDates, toEventKey } from '../../utils/event.mapper';
import { EventsXlsxLabels } from '../../utils/events-xlsx';
import { SnackbarService } from './../../../../shared/services/snackbar.service';

@Component({
  selector: 'app-calendar',
  imports: [
    EventIcon,
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
    TruncatePipe,
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

  // INPUTS
  readonly id = input.required<string>();

  // STATE
  readonly routePaths = routePaths;
  readonly tagNameMax = TAG_CARD_NAME_MAX;
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

  readonly tagCategories = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.tagService.listCategories(params),
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
    borderless: true,
    viewClass: 'app-year-view',
    dayHeaderInnerClass: 'app-weekday',
    dayCellTopInnerClass: 'app-day-number',
    eventInnerClass: 'app-event-content',
    eventClass: info =>
      ['app-calendar-event', info.isStart && 'is-start', info.isEnd && 'is-end']
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

  private readonly tagsById = computed(() => {
    const tags = new Map<string, TagDto>();
    if (!this.tagCategories.hasValue()) return tags;
    for (const category of this.tagCategories.value()) {
      for (const tag of category.tags) tags.set(tag.id, tag);
    }
    return tags;
  });

  private readonly calendarEvents = computed(() => {
    if (!this.events.hasValue()) return [];
    const tags = this.tagsById();
    return this.events.value().map(event =>
      toCalendarEvent(
        event,
        event.tagIds.flatMap(id => tags.get(id) ?? []),
      ),
    );
  });

  private readonly eventsByDay = computed(() => countEventsByDay(this.renderedEvents()));

  // LIFECYCLE
  constructor() {
    this.fitWeekRows();
    this.showEventsError();
    this.showTagsError();
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

  // ACTIONS
  updateEventFromMenu(
    eventId: string,
    originalStart: string | null,
    payload: EventUpdateDto,
  ): void {
    this.updateTarget(
      { id: eventId, originalStart, scope: originalStart ? 'this' : null },
      payload,
    ).subscribe();
  }

  deleteEventFromMenu(eventId: string, originalStart: string | null): void {
    this.deleteTarget({ id: eventId, originalStart, scope: null }).subscribe();
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

  openExport(): void {
    CalendarExportDialog.open(this.dialog)
      .pipe(switchMap(period => this.exportEvents(period)))
      .subscribe();
  }

  navigate(action: 'prev' | 'next' | 'today'): void {
    this.fullCalendar().getApi()[action]();
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
      switchMap(scope => this.eventService.delete(target.id, { scope, originalStart })),
      tap(() => this.events.reload()),
      catchError(() => {
        this.snackbarService.error(this.transloco.translate('event.deleteError'));
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
    const target: OccurrenceTarget = {
      id: event.id,
      originalStart: event.originalStart,
      scope: null,
    };

    this.dialog.open<EventEditDialog, EventDialogData>(EventEditDialog, {
      data: {
        event,
        editable: this.canEdit(),
        update: (payload, rollback) => this.updateTarget(target, payload, rollback),
        remove: () => this.deleteTarget(target),
        categories: this.tagCategories,
        createTag: (categoryId, payload) => this.createTag(categoryId, payload),
        setTag: (tagId, assigned) => this.setEventTag(target.id, tagId, assigned),
      },
      width: 'min(40rem, calc(100vw - 2rem))',
      height: 'min(44rem, calc(100dvh - 2rem))',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: 'calc(100dvh - 2rem)',
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
    this.updateTarget(
      {
        id: event.extendedProps['eventId'] as string,
        originalStart: event.extendedProps['originalStart'] as string | null,
        scope: null,
      },
      payload,
      revert,
    ).subscribe();
  }

  private createEvent({ date }: DateClickInfo): void {
    if (!this.canEdit()) return;
    this.saveNewEvent(
      toEventApiDates({ allDay: true, startAt: date, endAt: null }),
    ).subscribe(event => this.openEventDialog(event));
  }

  private openEvent(eventKey: string): void {
    if (!this.events.hasValue()) return;
    const event = this.events.value().find(item => toEventKey(item) === eventKey);
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
}
