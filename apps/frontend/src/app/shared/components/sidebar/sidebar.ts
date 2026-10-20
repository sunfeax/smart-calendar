import { Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, of, switchMap } from 'rxjs';
import { routePaths } from '../../../core/constants/routePaths';
import { LANGUAGE_NAMES, LANGUAGES, Language } from '../../../core/constants/languages';
import { AuthService } from '../../../features/auth/service/auth.service';
import { LanguageService } from '../../services/language.service';
import { ThemeService } from '../../services/theme.service';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-sidebar',
  imports: [
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatTooltip,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly themeService = inject(ThemeService);
  protected readonly language = inject(LanguageService);
  protected readonly languages = LANGUAGES;
  protected readonly languageNames = LANGUAGE_NAMES;
  protected readonly user = this.authService.user;
  protected readonly routePaths = routePaths;
  protected readonly themeLabel = computed(() =>
    this.themeService.theme() === 'dark' ? 'sidebar.lightTheme' : 'sidebar.darkTheme',
  );

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected setLanguage(lang: Language): void {
    this.language.setLang(lang);
  }

  protected logout(): void {
    ConfirmDialog.open(this.dialog, {
      title: this.transloco.translate('sidebar.logoutTitle'),
      message: this.transloco.translate('sidebar.logoutMessage'),
      confirmText: this.transloco.translate('sidebar.logout'),
      variant: 'danger',
    })
      .pipe(
        switchMap(() => this.authService.logout().pipe(catchError(() => of(undefined)))),
      )
      .subscribe(() => void this.router.navigateByUrl(routePaths.login));
  }
}
