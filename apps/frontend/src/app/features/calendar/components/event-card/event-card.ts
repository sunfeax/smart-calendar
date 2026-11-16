import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { TagDto } from '../../../../api/generated';
import { EventIcon } from '../event-icon/event-icon';

@Component({
  selector: 'app-event-card',
  imports: [EventIcon, MatIcon, MatTooltip, TranslocoPipe],
  templateUrl: './event-card.html',
  styleUrl: './event-card.scss',
})
export class EventCard {
  readonly title = input.required<string>();
  readonly allDay = input.required<boolean>();
  readonly timeText = input('');
  readonly icon = input<string | null>(null);
  readonly tags = input<TagDto[]>([]);
}
