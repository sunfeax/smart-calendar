import { ONE_DAY_MS } from '../../../../common/constants.js';
import type { EventCreateDto } from '../../events/event.dto.js';
import {
  CalendarParseError,
  type ParsedCalendar,
  type ParsedEventDraft,
} from './parsed-calendar.model.js';
import { assertTimeZone, nextMidnight, parseWallDate } from './parse-date.js';
import { reportError } from './parse-issues.js';

export interface NotionCsvOptions {
  titleColumn?: string;
  dateColumn?: string;
  tagColumns?: string[];
  timeZone?: string;
  name?: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function parseNotionCsv(
  content: string,
  options: NotionCsvOptions,
): ParsedCalendar {
  const timeZone = options.timeZone ?? null;
  assertTimeZone(timeZone);
  const rows = readCsv(content);
  const headers = rows.shift()?.map(header => header.trim());
  if (!headers?.length || headers.some(header => !header)) {
    throw new CalendarParseError('invalidFile');
  }
  if (new Set(headers).size !== headers.length) {
    throw new CalendarParseError('invalidFile');
  }
  const titleColumn = options.titleColumn ?? headers[0];
  const dateColumn =
    options.dateColumn ??
    headers.find(
      (header, column) =>
        header !== titleColumn &&
        rows.some(cells => isDateRange(cells[column], timeZone)),
    ) ??
    headers.find(header => header !== titleColumn) ??
    titleColumn;
  const tagColumns = options.tagColumns ?? [];
  const mapped = [titleColumn, dateColumn, ...tagColumns];
  if (new Set(mapped).size !== mapped.length) {
    throw new CalendarParseError('columnRoles');
  }
  for (const column of mapped) {
    if (!headers.includes(column)) {
      throw new CalendarParseError('missingColumn', column);
    }
  }
  const result: ParsedCalendar = {
    name: options.name ?? null,
    columns: { names: headers, title: titleColumn, date: dateColumn, tags: tagColumns },
    events: [],
    issues: [],
  };
  for (const [index, cells] of rows.entries()) {
    const sourceId = `row:${index + 2}`;
    if (cells.length !== headers.length) {
      reportError(result, sourceId, new CalendarParseError('invalidEvent'));
      continue;
    }
    const values = new Map(headers.map((header, column) => [header, cells[column]]));
    const draft: ParsedEventDraft = {
      title: values.get(titleColumn)!.trim(),
      description:
        headers
          .filter(header => !mapped.includes(header) && values.get(header)?.trim())
          .map(header => `${header}: ${values.get(header)!}`)
          .join('\n') || null,
      tags: tagColumns.flatMap(category =>
        [
          ...new Set(
            values
              .get(category)!
              .split(',')
              .map(name => name.trim()),
          ),
        ]
          .filter(Boolean)
          .map(name => ({ category, name })),
      ),
    };
    try {
      const dateValue = values.get(dateColumn)!.trim();
      if (!dateValue) throw new CalendarParseError('missingDate');
      const { tags, ...text } = draft;
      result.events.push({
        sourceId,
        data: {
          ...text,
          icon: null,
          ...parseDateRange(dateValue, timeZone),
          recurrenceRule: null,
          timeZone: null,
        },
        tags,
        exceptions: [],
      });
    } catch (error) {
      reportError(result, sourceId, error, draft);
    }
  }
  return result;
}

function isDateRange(value: string | undefined, timeZone: string | null): boolean {
  try {
    return Boolean(value?.trim() && parseDateRange(value.trim(), timeZone));
  } catch {
    return false;
  }
}

function parseDateRange(
  value: string,
  timeZone: string | null,
): Pick<EventCreateDto, 'startAt' | 'endAt' | 'allDay'> {
  const [startValue, endValue, ...rest] = value.split(/\s*→\s*/);
  if (rest.length) throw new CalendarParseError('invalidDate', value);
  const start = parseDate(startValue, timeZone);
  const startDay = /^[A-Za-z]+ \d{1,2}, \d{4}/.exec(startValue.trim())?.[0];
  const end =
    endValue === undefined
      ? start
      : parseDate(
          startDay && /^\d{1,2}:\d{2}/.test(endValue.trim())
            ? `${startDay} ${endValue.trim()}`
            : endValue,
          timeZone,
        );
  if (start.allDay !== end.allDay) {
    throw new CalendarParseError('invalidDate', value);
  }
  if (end.date < start.date) throw new CalendarParseError('endBeforeStart');
  const endAt =
    start.allDay || endValue !== undefined
      ? new Date(+end.date + (start.allDay ? ONE_DAY_MS : 0))
      : nextMidnight(start.date, timeZone);
  return {
    startAt: start.date.toISOString(),
    endAt: endAt.toISOString(),
    allDay: start.allDay,
  };
}

function parseDate(
  value: string,
  timeZone: string | null,
): { date: Date; allDay: boolean } {
  const match =
    /^([A-Za-z]+) (\d{1,2}), (\d{4})(?: (\d{1,2}):(\d{2})(?: (AM|PM))?)?$/.exec(
      value.trim(),
    );
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) {
    return {
      date: parseWallDate(Number(iso[1]), Number(iso[2]), Number(iso[3])),
      allDay: true,
    };
  }
  if (!match) throw new CalendarParseError('invalidDate', value);
  const month =
    MONTHS.findIndex(name => name.toLowerCase() === match[1].toLowerCase()) + 1;
  let hour = Number(match[4] ?? 0);
  if (match[6]) {
    if (hour < 1 || hour > 12) throw new CalendarParseError('invalidDate', value);
    hour = (hour % 12) + (match[6] === 'PM' ? 12 : 0);
  }
  const allDay = match[4] === undefined;
  if (!allDay && !timeZone) {
    throw new CalendarParseError('floatingTime');
  }
  return {
    date: parseWallDate(
      Number(match[3]),
      month,
      Number(match[2]),
      hour,
      Number(match[5] ?? 0),
      0,
      allDay ? null : timeZone,
    ),
    allDay,
  };
}

function readCsv(content: string): string[][] {
  const rows: string[][] = [];
  const value = content.replace(/^\uFEFF/, '');
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quoted) {
      if (char === '"' && value[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else field += char;
      continue;
    }
    if (char === '"' && !field && !closed) quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
      closed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && value[index + 1] === '\n') index++;
      row.push(field);
      if (row.length > 1 || row.some(cell => cell !== '')) rows.push(row);
      row = [];
      field = '';
      closed = false;
    } else {
      if (closed || char === '"') throw new CalendarParseError('invalidFile');
      field += char;
    }
  }
  if (quoted) throw new CalendarParseError('invalidFile');
  row.push(field);
  if (row.length > 1 || row.some(cell => cell !== '')) rows.push(row);
  return rows;
}
