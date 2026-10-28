import { CalendarRole } from '../../../generated/prisma/enums.js';

export const ROLE_RANK: Record<CalendarRole, number> = {
  OWNER: 3,
  EDITOR: 2,
  VIEWER: 1,
} as const;

export const MAX_CALENDARS_PER_USER = 3;
export const MAX_CALENDARS = 100;
export const MAX_CALENDAR_MEMBERS = 5;
