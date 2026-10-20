import {
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
import { MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import {
  CalendarOptions,
  FullCalendarComponent,
  FullCalendarModule,
} from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import allLocales from '@fullcalendar/angular/locales-all';
import themePlugin from '@fullcalendar/angular/themes/monarch';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, EMPTY } from 'rxjs';
import { routePaths } from '../../../../core/constants/routePaths';
import { EventCreateEditDialog } from '../../components/event-create-edit-dialog/event-create-edit-dialog';
import { EventDialogData, EventDialogResult } from '../../models/event-dialog';
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
  private readonly dialog = inject(MatDialog);
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
  private readonly fullCalendar = viewChild.required(FullCalendarComponent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private lastWheelAt = 0;
  private wheelHandled = false;
  private navAxis: 'x' | 'y' = 'x';

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
    initialView: 'dayGridMonth',
    locales: allLocales,
    locale: 'ru',
    firstDay: 1,
    height: '100%',
    dayMaxEvents: true,
    headerToolbar: { start: 'title', end: 'today prev,next' },
    dayCellClass: info =>
      [info.isToday && 'app-today', this.canEdit() && 'app-day-editable']
        .filter(Boolean)
        .join(' '),
    dayCellTopClass: () => (this.canEdit() ? 'app-day-top' : ''),
    viewClass: 'app-view',
    plugins: [themePlugin, dayGridPlugin, interactionPlugin],
    events: this.calendarEvents(),
    dateClick: info => {
      if (this.canEdit()) this.openEventDialog({ mode: 'create', date: info.dateStr });
    },
    eventClick: info => this.onEventClick(info.event.id),
    datesSet: info => {
      this.animateNavigation(info.start.toISOString());
      this.onVisibleRangeChange(info.start.toISOString(), info.end.toISOString());
    },
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
  }

  onWheel(event: WheelEvent): void {
    if (event.ctrlKey) return;
    const now = event.timeStamp;
    if (now - this.lastWheelAt > 200) this.wheelHandled = false;
    this.lastWheelAt = now;

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (this.wheelHandled || Math.abs(delta) < 10) return;

    this.wheelHandled = true;
    this.navAxis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 'x' : 'y';
    const api = this.fullCalendar().getApi();
    if (delta > 0) api.next();
    else api.prev();
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
    this.dialog.open<EventCreateEditDialog, EventDialogData, EventDialogResult>(
      EventCreateEditDialog,
      { data, width: 'min(40rem, calc(100vw - 2rem))' },
    );
  }

  private onEventClick(eventId: string): void {
    if (!this.events.hasValue()) return;
    const event = this.events.value().find(item => item.id === eventId);
    if (event) this.openEventDialog({ mode: 'update', event });
  }

  private animateNavigation(from: string): void {
    const previous = this.range()?.from;
    const axis = this.navAxis;
    this.navAxis = 'x';

    const view = this.host.nativeElement.querySelector<HTMLElement>('.app-view');
    if (!view || !previous || previous === from) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const offset = from > previous ? '2rem' : '-2rem';
    const styles = getComputedStyle(view);
    view.animate(
      [
        { opacity: 0, translate: axis === 'x' ? `${offset} 0` : `0 ${offset}` },
        { opacity: 1, translate: '0 0' },
      ],
      {
        duration: parseFloat(styles.getPropertyValue('--duration-slow')),
        easing: styles.getPropertyValue('--ease-standard'),
      },
    );
  }

  private onVisibleRangeChange(from: string, to: string): void {
    const current = this.range();
    if (current?.from === from && current.to === to) return;
    this.range.set({ from, to });
  }
}
