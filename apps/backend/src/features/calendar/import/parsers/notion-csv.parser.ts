import { ONE_DAY_MS } from '../../../../common/constants.js';
import type { EventCreateDto } from '../../events/event.dto.js';
import { MAX_TAGS_PER_CATEGORY, NAME_MAX } from '../../tags/tag.constants.js';
import { IMPORT_MAX_EVENTS } from '../import.constants.js';
import {
  CalendarParseError,
  type ParsedCalendar,
  type ParsedEventDraft,
} from './parsed-calendar.model.js';
import { assertTimeZone, nextMidnight, parseWallDate } from './parse-date.js';
import { reportError } from './parse-issues.js';

export interface NotionCsvOptions {
  timeZone?: string;
  dateColumn?: string;
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
  if (rows.length - 1 > IMPORT_MAX_EVENTS) {
    throw new CalendarParseError('tooManyEvents', String(IMPORT_MAX_EVENTS));
  }
  const headers = rows.shift()?.map(header => header.trim());
  if (!headers?.length || headers.some(header => !header)) {
    throw new CalendarParseError('invalidFile');
  }
  if (new Set(headers).size !== headers.length) {
    throw new CalendarParseError('invalidFile');
  }
  const titleColumn = headers[0];
  const now = Date.now();
  const dateColumns = headers
    .map((header, column) => ({
      header,
      score: dateColumnScore(rows, column, timeZone, now),
    }))
    .filter(({ header, score }) => header !== titleColumn && score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ header }) => header);
  const dateColumn =
    dateColumns.find(header => header === options.dateColumn) ?? dateColumns[0];
  if (!dateColumn) throw new CalendarParseError('noDateColumn');
  const tagColumns = headers.filter(
    (header, column) =>
      header !== titleColumn &&
      header !== dateColumn &&
      isTagColumn(rows, column) &&
      !rows.some(cells => isDateRange(cells[column], timeZone)),
  );
  const mapped = [titleColumn, dateColumn, ...tagColumns];
  const result: ParsedCalendar = {
    name: options.name ?? null,
    dateColumns,
    dateColumn,
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
      externalId: null,
      title: values.get(titleColumn)!.trim(),
      description:
        headers
          .filter(header => !mapped.includes(header) && values.get(header)?.trim())
          .map(header => `${header}: ${values.get(header)!}`)
          .join('\n') || null,
      dates: null,
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
      const { title, description, tags } = draft;
      result.events.push({
        sourceId,
        externalId: null,
        data: {
          title,
          description,
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

function dateColumnScore(
  rows: string[][],
  column: number,
  timeZone: string | null,
  now: number,
): number {
  const dates = rows.flatMap(cells => {
    const value = cells[column]?.trim();
    if (!value) return [];
    try {
      return [{ range: value.includes('→'), ...parseDateRange(value, timeZone) }];
    } catch {
      return [];
    }
  });
  if (!dates.length) return 0;
  const looksLikeTimestamp = dates.every(
    ({ range, allDay, startAt }) => !range && !allDay && Date.parse(startAt) <= now,
  );
  return dates.length + (looksLikeTimestamp ? 0 : rows.length);
}

function isTagColumn(rows: string[][], column: number): boolean {
  const names = rows.flatMap(cells =>
    (cells[column] ?? '')
      .split(',')
      .map(name => name.trim())
      .filter(Boolean),
  );
  const distinct = new Set(names);
  return (
    distinct.size > 0 &&
    distinct.size < names.length &&
    distinct.size <= MAX_TAGS_PER_CATEGORY &&
    [...distinct].every(
      name =>
        name.length <= NAME_MAX &&
        !/^[\d\s.,:%+-]+$/.test(name) &&
        !/^(yes|no)$/i.test(name),
    )
  );
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
