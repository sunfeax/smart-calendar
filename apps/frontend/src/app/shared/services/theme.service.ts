import { DOCUMENT } from '@angular/common';
import { effect, inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { TabSyncService } from './tab-sync.service';

export type Theme = 'dark' | 'light';

@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly tabSyncService = inject(TabSyncService);
  private readonly _theme = signal<Theme>(this.getInitialTheme());
  readonly theme = this._theme.asReadonly();

  constructor() {
    this.tabSyncService.incoming
      .pipe(
        filter(event => event.type === 'theme'),
        takeUntilDestroyed(),
      )
      .subscribe(event => {
        if (event.value === 'dark' || event.value === 'light') {
          this._theme.set(event.value);
        }
      });

    effect(() => {
      const theme = this.theme();
      const root = this.document.documentElement;
      root.dataset['theme'] = theme;
      root.style.colorScheme = theme;
      try {
        localStorage.setItem('theme', theme);
      } catch {
        console.warn('Failed to save theme');
      }
    });
  }

  toggle(): void {
    this._theme.update(currentTheme => (currentTheme === 'dark' ? 'light' : 'dark'));
    this.tabSyncService.send({ type: 'theme', value: this._theme() });
  }

  private getInitialTheme(): Theme {
    let savedTheme: string | null = null;
    try {
      savedTheme = localStorage.getItem('theme');
    } catch {
      console.warn('Failed to get theme');
    }

    return savedTheme === 'light' ? 'light' : 'dark';
  }
}
