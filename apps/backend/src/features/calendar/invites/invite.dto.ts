import { IsIn, IsString, MaxLength } from 'class-validator';
import { CalendarRole } from '../../../generated/prisma/enums.js';
import { INVITE_TOKEN_MAX } from './invite.constants.js';

export const INVITE_ROLES = [CalendarRole.EDITOR, CalendarRole.VIEWER] as const;

export type InviteRole = (typeof INVITE_ROLES)[number];

export class InviteCreateDto {
  @IsIn(INVITE_ROLES)
  role!: InviteRole;
}

export class InviteAcceptDto {
  @IsString()
  @MaxLength(INVITE_TOKEN_MAX)
  token!: string;
}

export class InviteDto {
  id!: string;
  role!: CalendarRole;
  expiresAt!: string;
  createdAt!: string;
}

export class InviteCreatedDto extends InviteDto {
  token!: string;
}
