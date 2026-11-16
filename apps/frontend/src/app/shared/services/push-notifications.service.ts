import { computed, inject, Service, signal } from '@angular/core';
import {
  rxResource,
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { combineLatest, firstValueFrom } from 'rxjs';
import { PushSubscriptionDto } from '../../api/generated';
import { AuthService } from '../../features/auth/service/auth.service';
import { NotificationApiService } from '../../features/calendar/services/notification-api.service';
import { LanguageService } from './language.service';

@Service()
export class PushNotificationsService {
  // DEPENDENCIES
  private readonly swPush = inject(SwPush);
  private readonly api = inject(NotificationApiService);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);

  // STATE
  private readonly subscription = toSignal(this.swPush.subscription, {
    initialValue: null,
  });
  private readonly registeredUser = signal<string | null>(null);
  private readonly _pending = signal(false);
  private readonly syncing = signal(0);
  private readonly permission = signal<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  private queue: Promise<void> = Promise.resolve();
  private manual = false;
  readonly supported =
    this.swPush.isEnabled &&
    typeof Notification !== 'undefined' &&
    typeof PushManager !== 'undefined';
  readonly isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // DATA
  readonly config = rxResource({
    params: () => this.auth.user()?.id,
    stream: () => this.api.getConfig(),
  });

  // COMPUTED
  readonly pending = computed(() => this._pending() || this.syncing() > 0);
  readonly enabled = computed(
    () =>
      !!this.subscription() &&
      this.registeredUser() !== null &&
      this.registeredUser() === this.auth.user()?.id,
  );
  readonly blocked = computed(() => this.supported && this.permission() === 'denied');
  readonly available = computed(
    () => this.supported && this.config.hasValue() && !!this.config.value().publicKey,
  );

  // LIFECYCLE
  constructor() {
    this.syncDevice();
  }

  // EFFECTS
  private syncDevice(): void {
    combineLatest([
      toObservable(this.auth.user),
      toObservable(this.language.lang),
      this.swPush.subscription,
    ])
      .pipe(takeUntilDestroyed())
      .subscribe(([user, language, subscription]) => {
        if (!user) this.registeredUser.set(null);
        if (!user || !subscription || this.manual) return;
        void this.enqueue(async () => {
          if (this.manual || this.auth.user() !== user) return;
          await firstValueFrom(this.api.subscribe(this.toDto(subscription, language)));
          if (this.auth.user() === user) this.registeredUser.set(user.id);
        }).catch(() => undefined);
      });
  }

  // ACTIONS
  async enable(): Promise<void> {
    const publicKey = this.config.hasValue() ? this.config.value().publicKey : null;
    const user = this.auth.user();
    if (!this.supported || !publicKey || !user || this.pending()) return;
    this.manual = true;
    this._pending.set(true);
    try {
      const permission = await Notification.requestPermission();
      this.permission.set(permission);
      if (permission !== 'granted') throw new Error('Notifications were not allowed');
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: publicKey,
      });
      await this.enqueue(async () => {
        if (this.auth.user() !== user) return;
        await firstValueFrom(
          this.api.subscribe(this.toDto(subscription, this.language.lang())),
        );
        this.registeredUser.set(user.id);
      });
    } finally {
      this.manual = false;
      this._pending.set(false);
    }
  }

  async disable(): Promise<void> {
    const subscription = this.subscription();
    if (!subscription || this.pending()) return;
    this.manual = true;
    this._pending.set(true);
    try {
      await this.enqueue(async () => {
        await this.swPush.unsubscribe();
        this.registeredUser.set(null);
        await firstValueFrom(this.api.unsubscribe(subscription.endpoint));
      });
    } finally {
      this.manual = false;
      this._pending.set(false);
    }
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    this.syncing.update(value => value + 1);
    const result = this.queue
      .then(action)
      .finally(() => this.syncing.update(value => value - 1));
    this.queue = result.catch(() => undefined);
    return result;
  }

  // HELPERS
  private toDto(
    subscription: PushSubscription,
    language: 'ru' | 'en' | 'es',
  ): PushSubscriptionDto {
    const keys = subscription.toJSON().keys;
    if (!keys?.['p256dh'] || !keys['auth']) throw new Error('Invalid push subscription');
    return {
      endpoint: subscription.endpoint,
      keys: { p256dh: keys['p256dh'], auth: keys['auth'] },
      language,
    };
  }
}
