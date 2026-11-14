import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
} from '@angular/cdk/overlay';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  BRAND_ICONS,
  ICON_URL_MAX,
  QUICK_ICONS_MAX,
} from '../../constants/icon.constants';
import { EventService } from '../../services/event.service';
import {
  iconLabel,
  IconInputKind,
  resolveIconInput,
  toEventIconView,
} from '../../utils/event-icon';
import { EventIcon } from '../event-icon/event-icon';

@Component({
  selector: 'app-event-icon-picker',
  imports: [
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    CdkTrapFocus,
    EventIcon,
    MatButton,
    MatIcon,
    MatIconButton,
    TranslocoPipe,
  ],
  templateUrl: './event-icon-picker.html',
  styleUrl: './event-icon-picker.scss',
})
export class EventIconPicker {
  // STATIC
  private static nextId = 0;

  // DEPENDENCIES
  private readonly injector = inject(Injector);
  private readonly eventService = inject(EventService);

  // INPUTS
  readonly calendarId = input.required<string>();
  readonly icon = input<string | null>(null);
  readonly editable = input(false);
  readonly iconChange = output<string | null>();

  // STATE
  readonly dialogId = `event-icon-picker-${EventIconPicker.nextId++}`;
  readonly hintId = `${this.dialogId}-hint`;
  readonly urlMax = ICON_URL_MAX;
  readonly opened = signal(false);
  readonly inputKind = signal<IconInputKind>('site');
  readonly query = signal('');
  readonly invalid = signal(false);
  readonly positions: ConnectedPosition[] = [
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 8,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -8,
    },
  ];
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('triggerButton');

  // DATA
  readonly frequentIcons = rxResource({
    params: () => (this.editable() ? this.calendarId() : undefined),
    stream: ({ params }) => this.eventService.listFrequentIcons(params),
  });

  // COMPUTED
  readonly quickIcons = computed(() => {
    const frequent = this.frequentIcons.hasValue() ? this.frequentIcons.value() : [];
    const icons = new Set([
      ...frequent.filter(icon => toEventIconView(icon)),
      ...BRAND_ICONS.map(brand => `brand:${brand}`),
    ]);
    return [...icons]
      .slice(0, QUICK_ICONS_MAX)
      .map(icon => ({ icon, label: iconLabel(icon) }));
  });
  readonly candidate = computed(() => resolveIconInput(this.query(), this.inputKind()));
  readonly hintKey = computed(() => {
    if (this.invalid()) return 'event.icon.inputInvalid';
    return this.inputKind() === 'image' ? 'event.icon.imageHint' : 'event.icon.inputHint';
  });
  readonly placeholderKey = computed(() =>
    this.inputKind() === 'image'
      ? 'event.icon.imagePlaceholder'
      : 'event.icon.inputPlaceholder',
  );
  readonly inputLabelKey = computed(() =>
    this.inputKind() === 'image' ? 'event.icon.imageInputLabel' : 'event.icon.inputLabel',
  );

  // ACTIONS
  open(): void {
    if (this.editable()) this.opened.set(true);
  }

  close(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.opened()) return;
    this.opened.set(false);
    this.query.set('');
    this.invalid.set(false);
    afterNextRender(() => this.trigger()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  setKind(kind: IconInputKind): void {
    this.inputKind.set(kind);
    this.invalid.set(false);
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.invalid.set(false);
  }

  submit(event: Event): void {
    event.preventDefault();
    const icon = this.candidate();
    this.invalid.set(!icon);
    if (icon) this.choose(icon);
  }

  choose(icon: string | null): void {
    if (!this.editable()) return;
    this.iconChange.emit(icon);
    this.close();
  }
}
