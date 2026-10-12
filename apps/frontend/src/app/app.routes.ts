import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { guestGuard } from './core/guards/guest-guard';
import { Login } from './features/auth/pages/login/login';
import { Calendar } from './features/calendar/pages/calendar/calendar';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'calendar', component: Calendar, canActivate: [authGuard] },
];
