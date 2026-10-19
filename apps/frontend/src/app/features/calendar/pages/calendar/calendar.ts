import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { CalendarOptions, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import allLocales from '@fullcalendar/angular/locales-all';
import multiMonthPlugin from '@fullcalendar/angular/multimonth';
import themePlugin from '@fullcalendar/angular/themes/monarch';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, EMPTY } from 'rxjs';
import { routePaths } from '../../../../core/constants/routePaths';
import { EventDialogData } from '../../models/event-dialog';
import { EventRange } from '../../models/event-range';
import { CalendarService } from '../../services/calendar.service';
import { EventService } from '../../services/event.service';
import { toCalendarEvent } from '../../utils/event.mapper';
import { SnackbarService } from './../../../../shared/services/snackbar.service';

@Component({
  selector: 'app-calendar',
  imports: [
    FullCalendarModule,
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
  private readonly calendarService = inject(CalendarService);
  private readonly eventService = inject(EventService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  readonly routePaths = routePaths;
  readonly canEdit = computed(() => {
    const role = this.calendar.hasValue() ? this.calendar.value().role : undefined;
    if (role === 'OWNER' || role === 'EDITOR') return true;
    return false;
  });
  private readonly range = signal<EventRange | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  private readonly calendarEvents = computed(() =>
    this.events.hasValue() ? this.events.value().map(toCalendarEvent) : [],
  );

  readonly options = computed<CalendarOptions>(() => ({
    initialView: 'multiMonthThree',
    locales: allLocales,
    locale: 'ru',
    firstDay: 1,
    height: '100%',
    aspectRatio: 2.5,
    headerToolbar: { start: 'title', end: 'today prev,next' },
    dayCellClass: info =>
      [info.isToday && 'app-today', this.canEdit() && 'app-day-editable']
        .filter(Boolean)
        .join(' '),
    singleMonthHeaderClass: 'app-month-header',
    plugins: [themePlugin, dayGridPlugin, multiMonthPlugin, interactionPlugin],
    views: {
      multiMonthThree: {
        type: 'multiMonth',
        duration: { months: 3 },
        multiMonthMaxColumns: 1,
      },
    },
    events: this.calendarEvents(),
    dateClick: info => {
      if (this.canEdit()) this.openEventDialog({ mode: 'create', date: info.dateStr });
    },
    eventClick: info => this.onEventClick(info.event.id),
    datesSet: info =>
      this.onVisibleRangeChange(info.start.toISOString(), info.end.toISOString()),
  }));

  constructor() {
    effect(() => {
      if (!this.events.error()) return;
      this.snackbarService.error(this.transloco.translate('calendar.eventsError'));
    });

    effect(() => {
      if (!this.calendar.error()) return;
      this.snackbarService.error(this.transloco.translate('calendar.loadError'));
      void this.router.navigateByUrl(routePaths.calendars);
    });

    afterRenderEffect(() => {
      if (!this.calendar.hasValue() || !this.range()) return;
      this.host.nativeElement
        .querySelector('.app-today')
        ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
  }

  onToggleCompleted(eventId: string, completed: boolean): void {
    this.eventService
      .update(eventId, { completed })
      .pipe(
        catchError(() => {
          this.snackbarService.error(this.transloco.translate('event.updateError'));
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private openEventDialog(data: EventDialogData): void {
    // TODO: открыть диалог события (контракт в шаге 10.2 гайда) и по результату сделать запрос
    //       (создание, правка или удаление), затем обновить events.
  }

  private onEventClick(eventId: string): void {
    if (!this.events.hasValue()) return;
    const event = this.events.value().find(item => item.id === eventId);
    if (event) this.openEventDialog({ mode: 'edit', event });
  }

  private onVisibleRangeChange(from: string, to: string): void {
    const current = this.range();
    if (current?.from === from && current.to === to) return;
    this.range.set({ from, to });
  }
}
