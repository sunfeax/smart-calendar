export const LANGUAGES = ['ru', 'en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
  es: 'Español',
};

export const DEFAULT_LANGUAGE: Language = 'ru';
export const LANGUAGE_STORAGE_KEY = 'lang';

export function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.some(lang => lang === value);
}
