import { DOCUMENT } from '@angular/common';
import { inject, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';

@Service()
export class AppUpdateService {
  // DEPENDENCIES
  private readonly document = inject(DOCUMENT);
  private readonly swUpdate = inject(SwUpdate);

  // LIFECYCLE
  constructor() {
    this.reloadOnUnrecoverableState();
  }

  // EFFECTS
  private reloadOnUnrecoverableState(): void {
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.unrecoverable
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.document.location.reload());
  }
}
