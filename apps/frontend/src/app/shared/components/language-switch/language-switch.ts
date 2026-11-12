import { Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { TranslocoPipe } from '@jsverse/transloco';
import { LANGUAGE_NAMES, LANGUAGES } from '../../../core/constants/languages';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-language-switch',
  imports: [MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, TranslocoPipe],
  templateUrl: './language-switch.html',
  styleUrl: './language-switch.scss',
})
export class LanguageSwitch {
  // DEPENDENCIES
  protected readonly language = inject(LanguageService);

  // STATE
  protected readonly languages = LANGUAGES;
  protected readonly languageNames = LANGUAGE_NAMES;
}
