import { Component, computed, input, linkedSignal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { toEventIconView } from '../../utils/event-icon';

@Component({
  selector: 'app-event-icon',
  imports: [MatIcon],
  templateUrl: './event-icon.html',
  styleUrl: './event-icon.scss',
})
export class EventIcon {
  // INPUTS
  readonly icon = input.required<string>();

  // COMPUTED
  readonly view = computed(() => toEventIconView(this.icon()));

  readonly failed = linkedSignal(() => {
    this.icon();
    return false;
  });
}
