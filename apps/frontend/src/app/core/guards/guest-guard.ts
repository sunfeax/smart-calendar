import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../features/auth/service/auth.service';
import { routePaths } from '../constants/routePaths';

export const guestGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.unreachable()) {
    return router.createUrlTree([routePaths.offline], {
      queryParams: { returnUrl: state.url },
    });
  }
  if (!authService.isAuthenticated()) return true;
  return router.parseUrl(routePaths.home);
};
