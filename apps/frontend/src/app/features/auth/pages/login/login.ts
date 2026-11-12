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
import { LanguageService } from '../../../../shared/services/language.service';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AuthService } from '../../service/auth.service';
import { loadGoogleScript } from '../../utils/google-script';
import { toSafeReturnUrl } from '../../utils/return-url';

const MAX_BUTTON_WIDTH = 400;

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
  protected readonly loadFailed = signal(false);

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
          });
          google.accounts.id.renderButton(this.button().nativeElement, {
            type: 'standard',
            size: 'large',
            text: 'continue_with',
            width: Math.min(MAX_BUTTON_WIDTH, this.button().nativeElement.clientWidth),
            locale: this.language.lang(),
          });
        })
        .catch(() => this.loadFailed.set(true));
    });
  }

  // HELPERS
  private returnUrl(): string {
    return toSafeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  }
}
