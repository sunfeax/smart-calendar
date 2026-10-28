import {
  afterNextRender,
  Component,
  computed,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuTrigger } from '@angular/material/menu';
import { TranslocoPipe } from '@jsverse/transloco';
import { BRAND_ICONS, ICON_URL_MAX } from '../../constants/icon.constants';
import { brandIconSrc, resolveIconInput } from '../../utils/event-icon';
import { EventIcon } from '../event-icon/event-icon';

@Component({
  selector: 'app-event-icon-picker',
  imports: [EventIcon, MatButton, MatIcon, MatMenu, MatMenuTrigger, TranslocoPipe],
  templateUrl: './event-icon-picker.html',
  styleUrl: './event-icon-picker.scss',
})
export class EventIconPicker {
  // DEPENDENCIES
  private readonly injector = inject(Injector);

  // INPUTS
  readonly icon = input<string | null>(null);
  readonly editable = input(false);
  readonly iconChange = output<string | null>();

  // STATE
  readonly brands = BRAND_ICONS;
  readonly urlMax = ICON_URL_MAX;
  readonly brandSrc = brandIconSrc;
  readonly query = signal('');
  readonly invalid = signal(false);
  private readonly trigger = viewChild(MatMenuTrigger);

  // COMPUTED
  readonly candidate = computed(() => resolveIconInput(this.query()));

  // ACTIONS
  focusField(element: HTMLInputElement): void {
    afterNextRender(() => element.focus(), { injector: this.injector });
  }

  keepMenuOpen(event: Event): void {
    if (event instanceof KeyboardEvent && event.key === 'Escape') return;
    event.stopPropagation();
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.invalid.set(false);
  }

  submit(): void {
    const icon = this.candidate();
    this.invalid.set(!icon);
    if (icon) this.choose(icon);
  }

  choose(icon: string | null): void {
    this.iconChange.emit(icon);
    this.trigger()?.closeMenu();
  }

  reset(): void {
    this.query.set('');
    this.invalid.set(false);
  }
}
