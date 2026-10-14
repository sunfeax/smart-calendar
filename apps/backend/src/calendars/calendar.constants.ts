import { CalendarColor, CalendarRole } from '../generated/prisma/enums.js';

export const ROLE_RANK: Record<CalendarRole, number> = {
  OWNER: 3,
  EDITOR: 2,
  VIEWER: 1,
} as const;

export const CALENDAR_COLORS = Object.values(CalendarColor);

export const MAX_CALENDARS_PER_USER = 3;
export const MAX_CALENDARS = 100;
