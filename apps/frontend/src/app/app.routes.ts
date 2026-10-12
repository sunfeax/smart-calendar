import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { guestGuard } from './core/guards/guest-guard';
import { Login } from './features/auth/pages/login/login';
import { Calendar } from './features/calendar/pages/calendar/calendar';
import { AuthLayout } from './shared/layouts/auth-layout/auth-layout';
import { MainLayout } from './shared/layouts/main-layout/main-layout';

export const routes: Routes = [
  {
    path: 'login',
    component: AuthLayout,
    canActivate: [guestGuard],
    children: [{ path: '', component: Login }],
  },
  { path: '', pathMatch: 'full', redirectTo: 'calendar' },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [{ path: 'calendar', component: Calendar, canActivate: [authGuard] }],
  },
];
