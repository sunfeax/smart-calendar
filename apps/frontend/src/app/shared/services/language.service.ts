import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  Language,
  LANGUAGE_STORAGE_KEY,
} from '../../core/constants/languages';
import { TabSyncService } from './tab-sync.service';

@Service()
export class LanguageService {
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private readonly tabSyncService = inject(TabSyncService);
  private readonly _lang = signal<Language>(this.getInitialLanguage());
  readonly lang = this._lang.asReadonly();

  constructor() {
    this.apply(this._lang());

    this.tabSyncService.incoming
      .pipe(
        filter(event => event.type === 'lang'),
        takeUntilDestroyed(),
      )
      .subscribe(event => {
        if (isLanguage(event.value)) {
          this._lang.set(event.value);
          this.apply(event.value);
        }
      });
  }

  setLang(lang: Language): void {
    this._lang.set(lang);
    this.apply(lang);
    this.tabSyncService.send({ type: 'lang', value: lang });
  }

  private apply(lang: Language): void {
    this.transloco.setActiveLang(lang);
    this.document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      console.warn('Failed to save language');
    }
  }

  private getInitialLanguage(): Language {
    let savedLang: string | null = null;
    try {
      savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      console.warn('Failed to get language');
    }
    if (isLanguage(savedLang)) return savedLang;

    const browserLang = this.document.defaultView?.navigator.language
      .slice(0, 2)
      .toLowerCase();
    return isLanguage(browserLang) ? browserLang : DEFAULT_LANGUAGE;
  }
}
