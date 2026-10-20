import { type Locale } from 'date-fns';
import { enUS, es, ru } from 'date-fns/locale';
import { type Language } from './languages';

export const DATE_LOCALES: Record<Language, Locale> = {
  ru,
  en: enUS,
  es,
};
