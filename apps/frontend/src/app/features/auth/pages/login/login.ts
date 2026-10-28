import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../../../environments/environment.development';
import { routePaths } from '../../../../core/constants/routePaths';
import { LanguageService } from '../../../../shared/services/language.service';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AuthService } from '../../service/auth.service';
import { loadGoogleScript } from '../../utils/google-script';

const GOOGLE_FRAME_TIMEOUT_MS = 3000;

@Component({
  imports: [TranslocoPipe],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  // DEPENDENCIES
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  // STATE
  private readonly button = viewChild.required<ElementRef<HTMLElement>>('googleButton');
  protected readonly googleButtonState = signal<'loading' | 'ready' | 'error'>('loading');

  // LIFECYCLE
  constructor() {
    this.renderGoogleButton();
  }

  // EFFECTS
  private renderGoogleButton(): void {
    afterNextRender(() => {
      loadGoogleScript()
        .then(() => {
          google.accounts.id.initialize({
            client_id: environment.googleClientId,
            callback: response =>
              this.authService.login(response.credential).subscribe({
                next: () => void this.router.navigateByUrl(this.returnUrl()),
                error: () =>
                  this.snackbar.error(this.transloco.translate('auth.loginError')),
              }),
            use_fedcm_for_button: true,
          });
          google.accounts.id.renderButton(this.button().nativeElement, {
            type: 'standard',
            theme: 'outline',
            size: 'medium',
            shape: 'pill',
            text: 'signin_with',
            locale: this.language.lang(),
          });
          return this.waitForGoogleFrame(this.button().nativeElement);
        })
        .then(() => this.googleButtonState.set('ready'))
        .catch(() => this.googleButtonState.set('error'));
    });
  }

  // HELPERS
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url?.startsWith('/') && !url.startsWith('//') ? url : routePaths.calendars;
  }

  private waitForGoogleFrame(host: HTMLElement): Promise<void> {
    return new Promise(resolve => {
      const done = (): void => {
        observer.disconnect();
        clearTimeout(fallback);
        resolve();
      };
      const watch = (frame: HTMLIFrameElement): void => {
        observer.disconnect();
        frame.addEventListener('load', done, { once: true });
      };
      const observer = new MutationObserver(() => {
        const frame = host.querySelector('iframe');
        if (frame) watch(frame);
      });
      const fallback = setTimeout(done, GOOGLE_FRAME_TIMEOUT_MS);

      const frame = host.querySelector('iframe');
      if (frame) watch(frame);
      else observer.observe(host, { childList: true, subtree: true });
    });
  }
}
