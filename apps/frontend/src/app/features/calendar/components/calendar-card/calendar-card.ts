import { Component, computed, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CalendarDto } from '../../../../api/generated';
import { routePaths } from '../../../../core/constants/routePaths';
import { CalendarRole } from './../../../../../../../backend/src/generated/prisma/enums';

@Component({
  imports: [MatIcon, MatIconButton, RouterLink, TranslocoPipe],
  selector: 'app-calendar-card',
  styleUrl: './calendar-card.scss',
  templateUrl: './calendar-card.html',
})
export class CalendarCard {
  // INPUTS
  readonly calendar = input.required<CalendarDto>();
  readonly edit = output();
  readonly remove = output();

  // STATE
  protected readonly routePaths = routePaths;

  // COMPUTED
  readonly isOwner = computed(() => this.calendar().role === CalendarRole.OWNER);
}
