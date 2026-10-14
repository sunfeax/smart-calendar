import { CalendarColor, CalendarRole } from '../generated/prisma/enums.js';

export const ROLE_RANK: Record<CalendarRole, number> = {
  OWNER: 3,
  EDITOR: 2,
  VIEWER: 1,
} as const;

// Source of truth is the Prisma enum: the DB, DTOs and @IsIn all use the same values
export const CALENDAR_COLORS = Object.values(CalendarColor);
