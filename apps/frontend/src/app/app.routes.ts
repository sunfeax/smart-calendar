import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { guestGuard } from './core/guards/guest-guard';
import { Login } from './features/auth/pages/login/login';
import { AuthLayout } from './shared/layouts/auth-layout/auth-layout';
import { MainLayout } from './shared/layouts/main-layout/main-layout';

export const routes: Routes = [
  {
    path: 'login',
    component: AuthLayout,
    canActivate: [guestGuard],
    children: [{ path: '', component: Login }],
  },
  { path: '', pathMatch: 'full', redirectTo: 'calendars' },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      {
        path: 'calendars',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/calendar/pages/calendars/calendars').then(m => m.Calendars),
      },
      {
        path: 'invite/:token',
        loadComponent: () =>
          import('./features/calendar/pages/invite/invite').then(m => m.Invite),
      },
      {
        path: 'calendars/:id',
        loadComponent: () =>
          import('./features/calendar/pages/calendar/calendar').then(m => m.Calendar),
      },
    ],
  },
];
