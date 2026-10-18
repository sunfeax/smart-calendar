import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CalendarDto } from '../../../../api/generated';
import { LanguageService } from '../../../../shared/services/language.service';

@Component({
  imports: [TranslocoPipe],
  selector: 'app-calendar-card',
  styleUrl: './calendar-card.scss',
  templateUrl: './calendar-card.html',
})
export class CalendarCard {
  private readonly languageService = inject(LanguageService);

  readonly calendar = input.required<CalendarDto>();

  // Decorative only: four weeks starting on Monday
  protected readonly days = Array.from({ length: 28 }, (_, i) => i + 1);
  protected readonly weekdays = computed(() => {
    const format = new Intl.DateTimeFormat(this.languageService.lang(), {
      weekday: 'short',
      timeZone: 'UTC',
    });
    // 2024-01-01 is a Monday
    return Array.from({ length: 7 }, (_, i) => format.format(Date.UTC(2024, 0, 1 + i)));
  });
}
