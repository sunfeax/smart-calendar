import { DESCRIPTION_MAX, TITLE_MAX } from '../../events/event.constants.js';
import type { EventCreateDto } from '../../events/event.dto.js';
import {
  CalendarParseError,
  type ImportProblem,
  type ParsedCalendar,
  type ParsedEventDraft,
} from './parsed-calendar.model.js';

export function fieldProblems(data: EventCreateDto): ImportProblem[] {
  const problems: ImportProblem[] = [];
  if ((data.title?.length ?? 0) > TITLE_MAX) {
    problems.push({ code: 'titleTooLong', value: String(TITLE_MAX) });
  }
  if ((data.description?.length ?? 0) > DESCRIPTION_MAX) {
    problems.push({ code: 'descriptionTooLong', value: String(DESCRIPTION_MAX) });
  }
  if (data.startAt === data.endAt) {
    problems.push({ code: 'zeroDuration', value: null });
  }
  return problems;
}

export function reportError(
  result: ParsedCalendar,
  sourceId: string,
  error: unknown,
  draft: ParsedEventDraft | null = null,
): void {
  if (!(error instanceof CalendarParseError)) throw error;
  result.issues.push({ sourceId, problem: error.problem, draft });
}
