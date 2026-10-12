import { afterNextRender, Component, ElementRef, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../../../environments/environment.development';
import { loadGoogleScript } from '../../google-script';
import { AuthService } from '../../service/auth.service';

@Component({
  imports: [],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly button = viewChild.required<ElementRef<HTMLElement>>('googleButton');

  constructor() {
    afterNextRender(() => {
      loadGoogleScript()
        .then(() => {
          google.accounts.id.initialize({
            client_id: environment.googleClientId,
            callback: response =>
              this.authService.login(response.credential).subscribe({
                next: () => void this.router.navigateByUrl('/calendar'),
                error: () => alert('Error during login with Google'),
              }),
            use_fedcm_for_button: true,
          });
          google.accounts.id.renderButton(this.button().nativeElement, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
          });
        })
        .catch(() => alert('Failed to load the Google script'));
    });
  }
}
