import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable } from 'rxjs';

@Service()
export class TranslocoHttpLoader implements TranslocoLoader {
  // DEPENDENCIES
  private readonly http = inject(HttpClient);

  // ACTIONS
  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}
