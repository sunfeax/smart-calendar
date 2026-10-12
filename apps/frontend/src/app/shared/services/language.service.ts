import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  Language,
  LANGUAGE_STORAGE_KEY,
} from '../../core/constants/languages';

@Service()
export class LanguageService {
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private readonly _lang = signal<Language>(this.getInitialLanguage());
  readonly lang = this._lang.asReadonly();

  constructor() {
    this.apply(this._lang());
  }

  setLang(lang: Language): void {
    this._lang.set(lang);
    this.apply(lang);
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
