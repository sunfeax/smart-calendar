import { Routes } from '@angular/router';
import { Login } from './features/auth/pages/login/login';
import { Calendar } from './features/calendar/pages/calendar/calendar';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'calendar', component: Calendar },
];
