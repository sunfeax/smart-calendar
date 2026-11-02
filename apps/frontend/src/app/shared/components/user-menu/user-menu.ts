import { Component, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of, switchMap } from 'rxjs';
import { routePaths } from '../../../core/constants/routePaths';
import { LANGUAGE_NAMES, LANGUAGES, Language } from '../../../core/constants/languages';
import { AuthService } from '../../../features/auth/service/auth.service';
import { LanguageService } from '../../services/language.service';
import { ThemeService } from '../../services/theme.service';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-user-menu',
  imports: [MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, TranslocoPipe],
  templateUrl: './user-menu.html',
  styleUrl: './user-menu.scss',
})
export class UserMenu {
  // DEPENDENCIES
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly themeService = inject(ThemeService);
  protected readonly language = inject(LanguageService);

  // STATE
  protected readonly languages = LANGUAGES;
  protected readonly languageNames = LANGUAGE_NAMES;
  protected readonly user = this.authService.user;

  // COMPUTED
  protected readonly themeLabel = computed(() =>
    this.themeService.theme() === 'dark' ? 'userMenu.lightTheme' : 'userMenu.darkTheme',
  );

  // ACTIONS
  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected setLanguage(lang: Language): void {
    this.language.setLang(lang);
  }

  protected logout(): void {
    ConfirmDialog.open(this.dialog, {
      title: this.transloco.translate('userMenu.logoutTitle'),
      message: this.transloco.translate('userMenu.logoutMessage'),
      confirmText: this.transloco.translate('userMenu.logout'),
      variant: 'danger',
    })
      .pipe(
        switchMap(() => this.authService.logout().pipe(catchError(() => of(undefined)))),
      )
      .subscribe(() => void this.router.navigateByUrl(routePaths.login));
  }
}
