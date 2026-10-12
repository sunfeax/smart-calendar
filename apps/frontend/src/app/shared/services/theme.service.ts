import { DOCUMENT } from '@angular/common';
import { effect, inject, Service, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly _theme = signal<Theme>(this.getInitialTheme());
  readonly theme = this._theme.asReadonly();

  constructor() {
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
