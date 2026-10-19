import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { CalendarOptions, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import allLocales from '@fullcalendar/angular/locales-all';
import multiMonthPlugin from '@fullcalendar/angular/multimonth';
import themePlugin from '@fullcalendar/angular/themes/monarch';
import { TranslocoPipe } from '@jsverse/transloco';
import { routePaths } from '../../../../core/constants/routePaths';
import { EventRange } from '../../models/event-range';
import { CalendarService } from '../../services/calendar.service';
import { EventService } from '../../services/event.service';
import { toCalendarEvent } from '../../utils/event.mapper';

@Component({
  selector: 'app-calendar',
  imports: [FullCalendarModule, MatIcon, MatIconButton, RouterLink, TranslocoPipe],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class Calendar {
  private readonly calendarService = inject(CalendarService);
  private readonly eventService = inject(EventService);

  readonly id = input.required<string>();
  readonly routePaths = routePaths;
  readonly canEdit = computed(() => {
    const role = this.calendar.value()?.role;
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
    (this.events.value() ?? []).map(toCalendarEvent),
  );

  readonly options = computed<CalendarOptions>(() => ({
    initialView: 'multiMonthThree',
    locales: allLocales,
    locale: 'ru',
    firstDay: 1,
    height: '100%',
    aspectRatio: 2.5,
    headerToolbar: { start: 'title', end: 'today prev,next' },
    dayCellClass: info => (info.isToday ? 'app-today' : ''),
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
    datesSet: info =>
      this.onVisibleRangeChange(info.start.toISOString(), info.end.toISOString()),
  }));

  constructor() {
    afterRenderEffect(() => {
      if (!this.calendar.value() || !this.range()) return;
      this.host.nativeElement
        .querySelector('.app-today')
        ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
  }

  private onVisibleRangeChange(from: string, to: string): void {
    const current = this.range();
    if (current?.from === from && current.to === to) return;
    this.range.set({ from, to });
  }
}
