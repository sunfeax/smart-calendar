import { MAX_CALENDAR_MEMBERS } from '../calendars/calendar.constants.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_INVITES_LIST = 50;
export const MAX_ACTIVE_INVITES = MAX_CALENDAR_MEMBERS - 1;
export const INVITE_TOKEN_MAX = 100;
