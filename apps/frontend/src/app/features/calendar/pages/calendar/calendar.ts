import { Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CalendarOptions, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import themePlugin from '@fullcalendar/angular/themes/monarch';
import { routePaths } from '../../../../core/constants/routePaths';
import { CalendarService } from '../../services/calendar.service';

@Component({
  selector: 'app-calendar',
  imports: [FullCalendarModule, MatIcon, MatIconButton, RouterLink, TranslocoPipe],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class Calendar {
  private readonly calendarService = inject(CalendarService);

  readonly id = input.required<string>();
  readonly routePaths = routePaths;

  readonly calendar = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.calendarService.get(params),
  });

  readonly options: CalendarOptions = {
    plugins: [themePlugin, dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
  };
}
