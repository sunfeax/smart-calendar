export const MAX_CALENDAR_MEMBERS = 5;
export const MAX_ACTIVE_INVITES = MAX_CALENDAR_MEMBERS - 1;
export const INVITE_TTL_DAYS = 7;
export const INVITE_ROLES = ['EDITOR', 'VIEWER'] as const;

export type InviteRole = (typeof INVITE_ROLES)[number];
