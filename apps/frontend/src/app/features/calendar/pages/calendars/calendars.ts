import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CalendarAddCard } from '../../components/calendar-add-card/calendar-add-card';
import { CalendarCard } from '../../components/calendar-card/calendar-card';
import { CalendarService } from '../../services/calendar.service';

@Component({
  imports: [CalendarCard, CalendarAddCard],
  selector: 'app-calendars',
  styleUrl: './calendars.scss',
  templateUrl: './calendars.html',
})
export class Calendars {
  private readonly calendarService = inject(CalendarService);

  readonly calendars = rxResource({
    stream: () => this.calendarService.getList(),
  });
}
