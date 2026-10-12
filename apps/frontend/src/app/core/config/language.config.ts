import {
  EnvironmentProviders,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '../../shared/services/language.service';
import { DEFAULT_LANGUAGE, LANGUAGES } from '../constants/languages';
import { TranslocoHttpLoader } from '../../shared/services/transloco-http-loader';

export function provideLanguage(): EnvironmentProviders[] {
  return [
    ...provideTransloco({
      config: {
        availableLangs: [...LANGUAGES],
        defaultLang: DEFAULT_LANGUAGE,
        fallbackLang: DEFAULT_LANGUAGE,
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(() => {
      const lang = inject(LanguageService).lang();
      return inject(TranslocoService).load(lang);
    }),
  ];
}
