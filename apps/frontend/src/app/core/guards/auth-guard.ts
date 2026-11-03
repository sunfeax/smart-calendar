import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../features/auth/service/auth.service';
import { routePaths } from '../constants/routePaths';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) return true;

  return router.createUrlTree(
    [authService.unreachable() ? routePaths.offline : routePaths.login],
    {
      queryParams: { returnUrl: state.url },
    },
  );
};
