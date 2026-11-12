import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { provideLanguage } from './core/config/language.config';
import { DATE_LOCALES } from './core/constants/date-locales';
import { DEFAULT_LANGUAGE } from './core/constants/languages';
import { loadingInterceptor } from './core/interceptors/loading-interceptor';
import { AuthService } from './features/auth/service/auth.service';
import { AppUpdateService } from './shared/services/app-update.service';
import { ThemeService } from './shared/services/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([loadingInterceptor])),
    provideLanguage(),
    { provide: MAT_DATE_LOCALE, useValue: DATE_LOCALES[DEFAULT_LANGUAGE] },
    provideDateFnsAdapter(),
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        width: 'min(28rem, calc(100vw - 2rem))',
        maxWidth: 'calc(100vw - 2rem)',
      },
    },
    {
      provide: MAT_ICON_DEFAULT_OPTIONS,
      useValue: { fontSet: 'material-symbols-outlined' },
    },
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', hideRequiredMarker: true },
    },
    provideAppInitializer(() => void inject(ThemeService)),
    provideAppInitializer(() => inject(AuthService).me()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => void inject(AppUpdateService)),
  ],
};
