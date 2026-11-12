import { THROTTLE_TTL_MS } from '../../../common/constants.js';

export const IMPORT_SOURCES = ['google', 'notion'] as const;
export const IMPORT_PROBLEM_CODES = [
  'invalidFile',
  'missingColumn',
  'columnRoles',
  'tooManyEvents',
  'invalidEvent',
  'missingDate',
  'invalidDate',
  'floatingTime',
  'nonexistentTime',
  'unsupportedTimeZone',
  'endBeforeStart',
  'zeroDuration',
  'unsupportedRecurrence',
  'titleTooLong',
  'descriptionTooLong',
] as const;
export const IMPORT_CONTENT_MAX = 4_000_000;
export const IMPORT_BODY_LIMIT = '6mb';
export const IMPORT_ROUTE = /^\/api\/calendars\/[^/]+\/import(?:\/preview)?\/?(?:\?|$)/;
export const IMPORT_MAX_EVENTS = 5000;
export const IMPORT_COLUMN_MAX = 200;
export const IMPORT_TAG_COLUMNS_MAX = 10;
export const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;
export const IMPORT_PREVIEW_THROTTLE = {
  default: { limit: 60, ttl: THROTTLE_TTL_MS },
};
