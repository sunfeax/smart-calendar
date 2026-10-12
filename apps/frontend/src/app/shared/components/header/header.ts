import { Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of, switchMap } from 'rxjs';
import { routePaths } from '../../../core/constants/routePaths';
import { LANGUAGE_NAMES, LANGUAGES, Language } from '../../../core/constants/languages';
import { AuthService } from '../../../features/auth/service/auth.service';
import { DialogService } from '../../services/dialog.service';
import { LanguageService } from '../../services/language.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-header',
  imports: [
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  private readonly authService = inject(AuthService);
  private readonly dialogService = inject(DialogService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly themeService = inject(ThemeService);
  protected readonly language = inject(LanguageService);
  protected readonly languages = LANGUAGES;
  protected readonly languageNames = LANGUAGE_NAMES;
  protected readonly user = this.authService.user;
  protected readonly routePaths = routePaths;

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected setLanguage(lang: Language): void {
    this.language.setLang(lang);
  }

  protected logout(): void {
    this.dialogService
      .confirm({
        title: this.transloco.translate('header.logoutTitle'),
        message: this.transloco.translate('header.logoutMessage'),
        confirmText: this.transloco.translate('header.logout'),
        cancelText: this.transloco.translate('common.cancel'),
        variant: 'danger',
      })
      .pipe(
        switchMap(() => this.authService.logout().pipe(catchError(() => of(undefined)))),
      )
      .subscribe(() => void this.router.navigateByUrl(routePaths.login));
  }
}
