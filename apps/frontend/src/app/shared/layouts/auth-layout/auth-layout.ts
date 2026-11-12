import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitch } from '../../components/language-switch/language-switch';

@Component({
  selector: 'app-auth-layout',
  imports: [LanguageSwitch, RouterOutlet, TranslocoPipe],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {
  protected readonly previewDays = [
    { label: 'auth.preview.monday', date: 12 },
    { label: 'auth.preview.tuesday', date: 13 },
    { label: 'auth.preview.wednesday', date: 14 },
    { label: 'auth.preview.thursday', date: 15 },
    { label: 'auth.preview.friday', date: 16 },
  ];
}
