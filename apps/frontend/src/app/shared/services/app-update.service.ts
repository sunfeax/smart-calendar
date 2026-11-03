import { DOCUMENT } from '@angular/common';
import { inject, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { TranslocoService } from '@jsverse/transloco';
import { filter, switchMap } from 'rxjs';
import { SnackbarService } from './snackbar.service';

@Service()
export class AppUpdateService {
  // DEPENDENCIES
  private readonly document = inject(DOCUMENT);
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackbarService = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);

  // LIFECYCLE
  constructor() {
    this.offerReloadOnUpdate();
  }

  // EFFECTS
  private offerReloadOnUpdate(): void {
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.versionUpdates
      .pipe(
        filter(event => event.type === 'VERSION_READY'),
        switchMap(() =>
          this.snackbarService.withAction(
            this.transloco.translate('common.updateReady'),
            this.transloco.translate('common.reload'),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.document.location.reload());
  }
}
