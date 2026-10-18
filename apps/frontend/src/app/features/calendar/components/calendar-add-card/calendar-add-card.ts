import { Component } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  imports: [MatIcon, TranslocoPipe],
  selector: 'app-calendar-add-card',
  styleUrl: './calendar-add-card.scss',
  templateUrl: './calendar-add-card.html',
})
export class CalendarAddCard {}
