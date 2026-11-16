import { inject, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { TranslocoService } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { SnackbarService } from './snackbar.service';

interface ReminderMessage {
  notification?: {
    title?: string;
    body?: string;
    tag?: string;
    data?: { onActionClick?: { default?: { url?: string } } };
  };
}

interface ReminderAlert {
  text: string;
  tag: string;
  url: string | null;
}

const DESKTOP_QUERY = '(hover: hover) and (pointer: fine)';
const SOUND_LOCK_MS = 5000;

@Service()
export class ReminderAlertService {
  // DEPENDENCIES
  private readonly swPush = inject(SwPush);
  private readonly snackbar = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  // STATE
  private audio: AudioContext | null = null;

  // LIFECYCLE
  constructor() {
    this.alertOnReminder();
  }

  // EFFECTS
  private alertOnReminder(): void {
    this.swPush.messages
      .pipe(
        filter(() => matchMedia(DESKTOP_QUERY).matches),
        map(message => this.toAlert(message as ReminderMessage)),
        filter(alert => alert !== null),
        takeUntilDestroyed(),
      )
      .subscribe(alert => {
        void this.playOnce(alert.tag);
        this.snackbar
          .persistent(alert.text, this.transloco.translate('reminder.open'))
          .subscribe(() => {
            if (alert.url) void this.router.navigateByUrl(alert.url);
          });
      });
  }

  // ACTIONS
  private async playOnce(tag: string): Promise<void> {
    if (!('locks' in navigator)) return this.chime();
    await navigator.locks.request(
      `reminder-sound:${tag}`,
      { ifAvailable: true },
      async lock => {
        if (!lock) return;
        await this.chime();
        await new Promise(resolve => setTimeout(resolve, SOUND_LOCK_MS));
      },
    );
  }

  private async chime(): Promise<void> {
    try {
      const audio = (this.audio ??= new AudioContext());
      await audio.resume();
      const start = audio.currentTime;
      [880, 1318.5].forEach((frequency, index) => {
        const at = start + index * 0.18;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.55);
      });
    } catch {
      return;
    }
  }

  // HELPERS
  private toAlert({ notification }: ReminderMessage): ReminderAlert | null {
    if (!notification?.tag?.startsWith('reminder-')) return null;
    const url = notification.data?.onActionClick?.default?.url ?? null;
    return {
      text: [notification.title, notification.body].filter(Boolean).join(': '),
      tag: notification.tag,
      url: url?.startsWith('/') && !url.startsWith('//') ? url : null,
    };
  }
}
