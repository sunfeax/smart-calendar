import { afterNextRender, Component, ElementRef, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../../../environments/environment.development';
import { routePaths } from '../../../../core/constants/routePaths';
import { LanguageService } from '../../../../shared/services/language.service';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AuthService } from '../../service/auth.service';
import { loadGoogleScript } from '../../utils/google-script';

@Component({
  imports: [],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly button = viewChild.required<ElementRef<HTMLElement>>('googleButton');

  constructor() {
    afterNextRender(() => {
      loadGoogleScript()
        .then(() => {
          google.accounts.id.initialize({
            client_id: environment.googleClientId,
            callback: response =>
              this.authService.login(response.credential).subscribe({
                next: () => void this.router.navigateByUrl(routePaths.calendar),
                error: () =>
                  this.snackbar.error(this.transloco.translate('auth.loginError')),
              }),
            use_fedcm_for_button: true,
          });
          google.accounts.id.renderButton(this.button().nativeElement, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            locale: this.language.lang(),
          });
        })
        .catch(() =>
          this.snackbar.error(this.transloco.translate('auth.googleScriptError')),
        );
    });
  }
}
