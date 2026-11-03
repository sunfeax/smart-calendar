import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize } from 'rxjs';
import { AuthService } from '../../service/auth.service';
import { toSafeReturnUrl } from '../../utils/return-url';

@Component({
  imports: [MatButton, MatIcon, TranslocoPipe],
  selector: 'app-offline',
  styleUrl: './offline.scss',
  templateUrl: './offline.html',
})
export class Offline {
  // DEPENDENCIES
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // STATE
  protected readonly pending = signal(false);

  // ACTIONS
  protected retry(): void {
    this.pending.set(true);
    this.authService
      .me()
      .pipe(finalize(() => this.pending.set(false)))
      .subscribe(() => {
        if (this.authService.unreachable()) return;
        void this.router.navigateByUrl(
          toSafeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
        );
      });
  }
}
