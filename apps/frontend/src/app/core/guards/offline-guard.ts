import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../features/auth/service/auth.service';
import { toSafeReturnUrl } from '../../features/auth/utils/return-url';

export const offlineGuard: CanActivateFn = route => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.unreachable()) return true;
  return router.parseUrl(toSafeReturnUrl(route.queryParamMap.get('returnUrl')));
};
