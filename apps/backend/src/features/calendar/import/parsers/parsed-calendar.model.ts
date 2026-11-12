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

export type ParsedEventDates = Pick<EventCreateDto, 'startAt' | 'endAt' | 'allDay'>;

export interface ParsedCalendarEvent {
  sourceId: string;
  externalId: string | null;
  data: EventCreateDto;
  tags: ParsedEventTag[];
  exceptions: ParsedEventException[];
}

export interface ParsedEventDraft {
  externalId: string | null;
  title: string;
  description: string | null;
  dates: ParsedEventDates | null;
  tags: ParsedEventTag[];
}

export interface CalendarParseIssue {
  sourceId: string;
  problem: ImportProblem;
  draft: ParsedEventDraft | null;
}

export interface ParsedCalendar {
  name: string | null;
  dateColumns: string[];
  dateColumn: string | null;
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
