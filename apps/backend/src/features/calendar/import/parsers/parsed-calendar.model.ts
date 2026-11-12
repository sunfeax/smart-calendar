import type { EventCreateDto } from '../../events/event.dto.js';
import type { IMPORT_PROBLEM_CODES } from '../import.constants.js';

export type ImportProblemCode = (typeof IMPORT_PROBLEM_CODES)[number];

export interface ImportProblem {
  code: ImportProblemCode;
  value: string | null;
}

export interface ParsedEventException {
  originalStart: string;
  cancelled: boolean;
  overrides: EventCreateDto | null;
}

export interface ParsedEventTag {
  category: string;
  name: string;
}

export interface ParsedCalendarEvent {
  sourceId: string;
  data: EventCreateDto;
  tags: ParsedEventTag[];
  exceptions: ParsedEventException[];
}

export interface ParsedEventDraft {
  title: string;
  description: string | null;
  tags: ParsedEventTag[];
}

export interface CalendarParseIssue {
  sourceId: string;
  problem: ImportProblem;
  draft: ParsedEventDraft | null;
}

export interface ParsedCalendarColumns {
  names: string[];
  title: string;
  date: string;
  tags: string[];
}

export interface ParsedCalendar {
  name: string | null;
  columns: ParsedCalendarColumns | null;
  events: ParsedCalendarEvent[];
  issues: CalendarParseIssue[];
}

export class CalendarParseError extends Error {
  constructor(
    readonly code: ImportProblemCode,
    readonly value: string | null = null,
  ) {
    super(value ? `${code}: ${value}` : code);
  }

  get problem(): ImportProblem {
    return { code: this.code, value: this.value };
  }
}
