import { Component, computed, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { EventDto, TagDto } from '../../../../api/generated';
import { LanguageService } from '../../../../shared/services/language.service';
import { EventIcon } from '../event-icon/event-icon';

@Component({
  selector: 'app-event-row',
  imports: [EventIcon, MatIcon, TranslocoPipe],
  templateUrl: './event-row.html',
  styleUrl: './event-row.scss',
})
export class EventRow {
  // DEPENDENCIES
  private readonly languageService = inject(LanguageService);

  // INPUTS
  readonly event = input.required<EventDto>();
  readonly tagsById = input.required<Map<string, TagDto>>();

  // COMPUTED
  readonly tags = computed(() =>
    this.event().tagIds.flatMap(id => this.tagsById().get(id) ?? []),
  );

  readonly dates = computed(() =>
    this.toDatesText(this.event(), this.languageService.lang()),
  );

  readonly archivedAt = computed(() => {
    const { archivedAt } = this.event();
    return archivedAt
      ? new Intl.DateTimeFormat(this.languageService.lang(), {
          day: 'numeric',
          month: 'short',
        }).format(new Date(archivedAt))
      : null;
  });

  // HELPERS
  private toDatesText(event: EventDto, lang: string): string {
    const formatter = new Intl.DateTimeFormat(lang, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(event.allDay ? { timeZone: 'UTC' } : { hour: '2-digit', minute: '2-digit' }),
    });
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    if (event.allDay) end.setUTCDate(end.getUTCDate() - 1);
    return start.getTime() === end.getTime()
      ? formatter.format(start)
      : formatter.formatRange(start, end);
  }
}
