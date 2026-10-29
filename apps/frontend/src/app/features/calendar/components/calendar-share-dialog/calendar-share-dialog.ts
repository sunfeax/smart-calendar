import { Clipboard } from '@angular/cdk/clipboard';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, EMPTY, finalize, switchMap, tap } from 'rxjs';
import { CalendarDto, InviteDto, MemberDto } from '../../../../api/generated';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { LanguageService } from '../../../../shared/services/language.service';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AuthService } from '../../../auth/service/auth.service';
import {
  INVITE_ROLES,
  INVITE_TTL_DAYS,
  InviteRole,
  MAX_ACTIVE_INVITES,
  MAX_CALENDAR_MEMBERS,
} from '../../constants/share.constants';
import { InviteService } from '../../services/invite.service';
import { MemberService } from '../../services/member.service';

export interface CalendarShareDialogData {
  calendarId: string;
  role: CalendarDto['role'];
}

export type CalendarShareDialogResult = { left: true } | undefined;

@Component({
  selector: 'app-calendar-share-dialog',
  imports: [
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
    MatIconButton,
    MatTooltip,
    TranslocoPipe,
  ],
  templateUrl: './calendar-share-dialog.html',
  styleUrl: './calendar-share-dialog.scss',
})
export class CalendarShareDialog {
  // DEPENDENCIES
  private readonly dialogRef =
    inject<MatDialogRef<CalendarShareDialog, CalendarShareDialogResult>>(MatDialogRef);
  private readonly dialog = inject(MatDialog);
  private readonly inviteService = inject(InviteService);
  private readonly memberService = inject(MemberService);
  private readonly authService = inject(AuthService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);
  private readonly languageService = inject(LanguageService);
  private readonly clipboard = inject(Clipboard);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = inject<CalendarShareDialogData>(MAT_DIALOG_DATA);

  // STATE
  readonly roles = INVITE_ROLES;
  readonly maxMembers = MAX_CALENDAR_MEMBERS;
  readonly maxInvites = MAX_ACTIVE_INVITES;
  readonly ttlDays = INVITE_TTL_DAYS;
  readonly inviteRole = signal<InviteRole>('EDITOR');
  readonly link = signal<{ id: string; url: string } | null>(null);
  readonly pending = signal(false);

  // DATA
  readonly members = rxResource({
    stream: () => this.memberService.getList(this.data.calendarId),
  });

  readonly invites = rxResource({
    params: () => (this.canInvite() ? this.data.calendarId : undefined),
    stream: ({ params }) => this.inviteService.getList(params),
  });

  // COMPUTED
  readonly canInvite = computed(() => this.data.role !== 'VIEWER');

  readonly isOwner = computed(() => this.data.role === 'OWNER');

  readonly currentUserId = computed(() => this.authService.user()?.id);

  readonly memberCount = computed(() =>
    this.members.hasValue() ? this.members.value().length : 0,
  );

  readonly isFull = computed(() => this.memberCount() >= MAX_CALENDAR_MEMBERS);

  readonly hasMaxInvites = computed(
    () => this.invites.hasValue() && this.invites.value().length >= MAX_ACTIVE_INVITES,
  );

  readonly canCreate = computed(
    () =>
      this.canInvite() &&
      this.members.hasValue() &&
      !this.members.isLoading() &&
      this.invites.hasValue() &&
      !this.invites.isLoading() &&
      !this.isFull() &&
      !this.hasMaxInvites() &&
      !this.pending(),
  );

  // ACTIONS
  createInvite(): void {
    if (!this.canCreate()) return;
    this.pending.set(true);
    this.inviteService
      .create(this.data.calendarId, { role: this.inviteRole() })
      .pipe(
        tap(({ token, ...invite }) => {
          const link = `${location.origin}/invite/${token}`;
          this.link.set({ id: invite.id, url: link });
          this.invites.update(list => [invite, ...(list ?? [])]);
          this.copyLink(link);
        }),
        catchError((error: unknown) =>
          this.notifyError(
            error instanceof HttpErrorResponse && error.status === 409
              ? 'share.linksFull'
              : 'share.createError',
            { max: String(MAX_ACTIVE_INVITES) },
          ),
        ),
        finalize(() => this.pending.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  copyLink(link: string): void {
    if (this.clipboard.copy(link)) {
      this.snackbarService.success(this.transloco.translate('share.copied'));
    }
  }

  revokeInvite(invite: InviteDto): void {
    if (
      this.pending() ||
      !this.canRevoke(invite) ||
      !this.invites.hasValue() ||
      this.invites.isLoading()
    ) {
      return;
    }
    this.pending.set(true);
    this.inviteService
      .revoke(invite.id)
      .pipe(
        tap(() => {
          this.invites.update(list => list?.filter(item => item.id !== invite.id));
          if (this.link()?.id === invite.id) this.link.set(null);
        }),
        catchError(() => this.notifyError('share.revokeError')),
        finalize(() => this.pending.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  removeMember(member: MemberDto): void {
    if (
      this.pending() ||
      !this.canRemove(member) ||
      !this.members.hasValue() ||
      this.members.isLoading()
    ) {
      return;
    }
    this.pending.set(true);
    this.confirm('share.removeTitle', 'share.removeMessage', { name: member.name })
      .pipe(
        switchMap(() => this.memberService.remove(this.data.calendarId, member.userId)),
        tap(() =>
          this.members.update(list =>
            list?.filter(item => item.userId !== member.userId),
          ),
        ),
        catchError(() => this.notifyError('share.removeError')),
        finalize(() => this.pending.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  leave(): void {
    const userId = this.currentUserId();
    if (!userId || this.isOwner() || this.pending()) return;
    this.pending.set(true);

    this.confirm('share.leaveTitle', 'share.leaveMessage')
      .pipe(
        switchMap(() => this.memberService.remove(this.data.calendarId, userId)),
        tap(() => this.dialogRef.close({ left: true })),
        catchError(() => this.notifyError('share.leaveError')),
        finalize(() => this.pending.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  close(): void {
    this.dialogRef.close();
  }

  canRemove(member: MemberDto): boolean {
    return (
      this.canInvite() &&
      member.role !== 'OWNER' &&
      member.userId !== this.currentUserId()
    );
  }

  canRevoke(invite: InviteDto): boolean {
    return this.isOwner() || invite.createdById === this.currentUserId();
  }

  formatDate(iso: string): string {
    return new Intl.DateTimeFormat(this.languageService.lang(), {
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));
  }

  private confirm(titleKey: string, messageKey: string, params?: Record<string, string>) {
    return ConfirmDialog.open(this.dialog, {
      title: this.transloco.translate(titleKey),
      message: this.transloco.translate(messageKey, params),
      confirmText: this.transloco.translate('share.confirm'),
      variant: 'danger',
    });
  }

  private notifyError(key: string, params?: Record<string, string>) {
    this.snackbarService.error(this.transloco.translate(key, params));
    return EMPTY;
  }
}
