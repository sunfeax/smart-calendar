import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DateAdapter } from '@angular/material/core';
import { TranslocoService } from '@jsverse/transloco';
import { type Locale } from 'date-fns';
import { filter } from 'rxjs';
import { DATE_LOCALES } from '../../core/constants/date-locales';
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  Language,
  LANGUAGE_STORAGE_KEY,
} from '../../core/constants/languages';
import { TabSyncService } from './tab-sync.service';

@Service()
export class LanguageService {
  // DEPENDENCIES
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private readonly tabSyncService = inject(TabSyncService);
  private readonly dateAdapter = inject<DateAdapter<Date, Locale>>(DateAdapter);

  // STATE
  private readonly _lang = signal<Language>(this.getInitialLanguage());
  readonly lang = this._lang.asReadonly();

  // LIFECYCLE
  constructor() {
    this.apply(this._lang());
    this.syncLangFromTabs();
  }

  // EFFECTS
  private syncLangFromTabs(): void {
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

  // ACTIONS
  setLang(lang: Language): void {
    this._lang.set(lang);
    this.apply(lang);
    this.tabSyncService.send({ type: 'lang', value: lang });
  }

  private apply(lang: Language): void {
    this.transloco.setActiveLang(lang);
    this.document.documentElement.lang = lang;
    this.dateAdapter.setLocale(DATE_LOCALES[lang]);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      console.warn('Failed to save language');
    }
  }

  // HELPERS
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
