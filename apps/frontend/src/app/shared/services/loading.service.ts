import { computed, inject, Service, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { filter, finalize, map, Observable } from 'rxjs';

@Service()
export class LoadingService {
  // DEPENDENCIES
  private readonly router = inject(Router);

  // STATE
  private readonly pending = signal(0);
  private readonly navigating = toSignal(
    this.router.events.pipe(
      filter(
        event =>
          event instanceof NavigationStart ||
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError,
      ),
      map(event => event instanceof NavigationStart),
    ),
    { initialValue: false },
  );

  // COMPUTED
  readonly active = computed(() => this.pending() > 0 || this.navigating());

  // ACTIONS
  track<T>(source: Observable<T>): Observable<T> {
    this.pending.update(count => count + 1);
    return source.pipe(finalize(() => this.pending.update(count => count - 1)));
  }
}
