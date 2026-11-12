import { ONE_DAY_MS } from '../../../../common/constants.js';
import { toWallClock } from '../../../../common/wall-clock.js';
import type { EventCreateDto } from '../../events/event.dto.js';
import { isRecurrenceRule } from '../../events/decorators/recurrence-rule.decorator.js';
import {
  CalendarParseError,
  type ParsedCalendar,
  type ParsedCalendarEvent,
  type ParsedEventException,
} from './parsed-calendar.model.js';
import { nextMidnight, parseWallDate } from './parse-date.js';
import { fieldProblems, reportError } from './parse-issues.js';

interface Property {
  name: string;
  params: Map<string, string>;
  value: string;
}

interface CalendarDate {
  date: Date;
  allDay: boolean;
  timeZone: string | null;
}

export function parseGoogleCalendar(content: string): ParsedCalendar {
  const { properties, records } = readCalendar(content);
  const result: ParsedCalendar = {
    name: textValue(properties, 'X-WR-CALNAME'),
    columns: null,
    events: [],
    issues: [],
  };
  const defaultZone = textValue(properties, 'X-WR-TIMEZONE');
  const series = new Map<string, ParsedCalendarEvent>();
  const detached: Property[][] = [];

  for (const [index, record] of records.entries()) {
    const sourceId = textValue(record, 'UID') ?? `event:${index + 1}`;
    if (find(record, 'RECURRENCE-ID')) {
      detached.push(record);
      continue;
    }
    if (textValue(record, 'STATUS') === 'CANCELLED') continue;
    try {
      if (!find(record, 'UID')) throw new CalendarParseError('invalidEvent');
      if (series.has(sourceId)) throw new CalendarParseError('invalidEvent');
      const data = parseEvent(record, defaultZone);
      const exceptions = parseExclusions(record, defaultZone, data.allDay);
      if (exceptions.length && !data.recurrenceRule) {
        throw new CalendarParseError('unsupportedRecurrence');
      }
      const event = { sourceId, data, tags: [], exceptions };
      series.set(sourceId, event);
      result.events.push(event);
    } catch (error) {
      const draft = series.has(sourceId) ? null : { ...parseText(record), tags: [] };
      reportError(result, sourceId, error, draft);
    }
  }

  for (const record of detached) {
    const sourceId = textValue(record, 'UID') ?? 'unknown';
    try {
      const parent = series.get(sourceId);
      if (!parent?.data.recurrenceRule) {
        throw new CalendarParseError('unsupportedRecurrence');
      }
      const recurrenceId = find(record, 'RECURRENCE-ID')!;
      if (recurrenceId.params.has('RANGE')) {
        throw new CalendarParseError('unsupportedRecurrence');
      }
      const original = parseDate(recurrenceId, defaultZone);
      if (original.allDay !== parent.data.allDay) {
        throw new CalendarParseError('unsupportedRecurrence');
      }
      const cancelled = textValue(record, 'STATUS') === 'CANCELLED';
      const overrides = cancelled ? null : parseEvent(record, defaultZone);
      if (overrides?.recurrenceRule) {
        throw new CalendarParseError('unsupportedRecurrence');
      }
      const problem = overrides && fieldProblems(overrides)[0];
      if (problem) throw new CalendarParseError(problem.code, problem.value);
      const exception = {
        originalStart: original.date.toISOString(),
        cancelled,
        overrides,
      };
      const existing = parent.exceptions.findIndex(
        item => item.originalStart === exception.originalStart,
      );
      if (existing < 0) parent.exceptions.push(exception);
      else parent.exceptions[existing] = exception;
    } catch (error) {
      reportError(result, sourceId, error);
    }
  }

  return result;
}

function parseEvent(record: Property[], defaultZone: string | null): EventCreateDto {
  if (find(record, 'RDATE') || find(record, 'EXRULE')) {
    throw new CalendarParseError('unsupportedRecurrence');
  }
  const startProperty = find(record, 'DTSTART');
  if (!startProperty) throw new CalendarParseError('missingDate');
  const start = parseDate(startProperty, defaultZone);
  const endProperty = find(record, 'DTEND');
  const duration = find(record, 'DURATION');
  if (endProperty && duration) {
    throw new CalendarParseError('invalidDate');
  }
  let endAt: Date;
  if (endProperty) {
    const end = parseDate(endProperty, defaultZone);
    if (end.allDay !== start.allDay) {
      throw new CalendarParseError('invalidDate');
    }
    endAt = end.date;
  } else if (duration) {
    endAt = durationEnd(start, duration.value);
  } else {
    endAt = new Date(+start.date + (start.allDay ? ONE_DAY_MS : 0));
  }
  if (endAt < start.date) throw new CalendarParseError('endBeforeStart');
  if (+endAt === +start.date) {
    endAt = start.allDay
      ? new Date(+start.date + ONE_DAY_MS)
      : nextMidnight(start.date, start.timeZone ?? defaultZone);
  }
  const rules = record.filter(property => property.name === 'RRULE');
  if (rules.length > 1) throw new CalendarParseError('unsupportedRecurrence');
  let recurrenceRule = rules[0]?.value ?? null;
  const timeZone = recurrenceRule && !start.allDay ? (start.timeZone ?? 'UTC') : null;
  if (recurrenceRule) {
    if (!isRecurrenceRule(recurrenceRule)) {
      throw new CalendarParseError('unsupportedRecurrence');
    }
    recurrenceRule = normalizeUntil(recurrenceRule, timeZone);
  }
  return {
    ...parseText(record),
    icon: null,
    startAt: start.date.toISOString(),
    endAt: endAt.toISOString(),
    allDay: start.allDay,
    recurrenceRule,
    timeZone,
  };
}

function parseText(record: Property[]): { title: string; description: string | null } {
  const location = textValue(record, 'LOCATION');
  const description = [
    textValue(record, 'DESCRIPTION'),
    location ? `Location: ${location}` : null,
    textValue(record, 'URL'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return {
    title: textValue(record, 'SUMMARY')?.trim() ?? '',
    description: description || null,
  };
}

function parseExclusions(
  record: Property[],
  defaultZone: string | null,
  allDay: boolean,
): ParsedEventException[] {
  const exceptions = new Map<string, ParsedEventException>();
  for (const property of record.filter(property => property.name === 'EXDATE')) {
    for (const value of property.value.split(',')) {
      const original = parseDate({ ...property, value }, defaultZone);
      if (original.allDay !== allDay) {
        throw new CalendarParseError('unsupportedRecurrence');
      }
      const originalStart = original.date.toISOString();
      exceptions.set(originalStart, { originalStart, cancelled: true, overrides: null });
    }
  }
  return [...exceptions.values()];
}

function parseDate(property: Property, defaultZone: string | null): CalendarDate {
  const allDay = property.params.get('VALUE') === 'DATE';
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(
    property.value,
  );
  if (!match || allDay === Boolean(match[4])) {
    throw new CalendarParseError('invalidDate', property.value);
  }
  const timeZone =
    allDay || match[7] ? null : (property.params.get('TZID') ?? defaultZone);
  if (!allDay && !match[7] && !timeZone) {
    throw new CalendarParseError('floatingTime');
  }
  return {
    date: parseWallDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4] ?? 0),
      Number(match[5] ?? 0),
      Number(match[6] ?? 0),
      timeZone,
    ),
    allDay,
    timeZone,
  };
}

function durationEnd(start: CalendarDate, value: string): Date {
  const match = /^P(?:(\d+)W|(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?)$/.exec(
    value,
  );
  if (!match || !match.slice(1).some(Boolean)) {
    throw new CalendarParseError('invalidDate', value);
  }
  if (start.allDay && match.slice(3).some(Boolean)) {
    throw new CalendarParseError('invalidDate', value);
  }
  const days = Number(match[1] ?? 0) * 7 + Number(match[2] ?? 0);
  const seconds =
    Number(match[3] ?? 0) * 3600 + Number(match[4] ?? 0) * 60 + Number(match[5] ?? 0);
  const wall = toWallClock(start.date, start.timeZone);
  wall.setUTCDate(wall.getUTCDate() + days);
  const end = parseWallDate(
    wall.getUTCFullYear(),
    wall.getUTCMonth() + 1,
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds(),
    start.timeZone,
  );
  const result = new Date(+end + seconds * 1000);
  if (!Number.isFinite(+result)) throw new CalendarParseError('invalidDate', value);
  return result;
}

function normalizeUntil(rule: string, timeZone: string | null): string {
  return rule.replace(/UNTIL=(\d{8}T\d{6}Z)/, (_, value: string) => {
    const until = parseDate({ name: 'UNTIL', params: new Map(), value }, null).date;
    const wall = toWallClock(until, timeZone);
    return `UNTIL=${wall
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')}`;
  });
}

function readCalendar(content: string): {
  properties: Property[];
  records: Property[][];
} {
  const lines = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .trim()
    .split('\n');
  if (lines[0] !== 'BEGIN:VCALENDAR' || lines.at(-1) !== 'END:VCALENDAR') {
    throw new CalendarParseError('invalidFile');
  }
  const stack: string[] = [];
  const properties: Property[] = [];
  const records: Property[][] = [];
  let record: Property[] | null = null;
  for (const line of lines) {
    if (!line) continue;
    const property = parseProperty(line);
    if (property.name === 'BEGIN') {
      if (property.value === 'VEVENT') {
        if (stack.length !== 1 || stack[0] !== 'VCALENDAR') {
          throw new CalendarParseError('invalidFile');
        }
        record = [];
        records.push(record);
      }
      stack.push(property.value);
    } else if (property.name === 'END') {
      if (stack.pop() !== property.value) {
        throw new CalendarParseError('invalidFile');
      }
      if (property.value === 'VEVENT') record = null;
    } else if (stack.length === 1) {
      properties.push(property);
    } else if (stack.length === 2 && stack[1] === 'VEVENT') {
      record!.push(property);
    }
  }
  if (stack.length) throw new CalendarParseError('invalidFile');
  return { properties, records };
}

function parseProperty(line: string): Property {
  const parts: string[] = [];
  let quoted = false;
  let start = 0;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    if (quoted || (char !== ';' && char !== ':')) continue;
    parts.push(line.slice(start, index));
    start = index + 1;
    if (char !== ':') continue;
    const name = parts.shift()!.toUpperCase();
    const params = new Map<string, string>();
    for (const part of parts) {
      const separator = part.indexOf('=');
      if (separator < 1) throw new CalendarParseError('invalidFile');
      params.set(
        part.slice(0, separator).toUpperCase(),
        part.slice(separator + 1).replace(/^"(.*)"$/, '$1'),
      );
    }
    return { name, params, value: line.slice(start) };
  }
  throw new CalendarParseError('invalidFile');
}

function find(properties: Property[], name: string): Property | undefined {
  return properties.find(property => property.name === name);
}

function textValue(properties: Property[], name: string): string | null {
  const value = find(properties, name)?.value;
  return value === undefined
    ? null
    : value.replace(/\\([nN,;\\])/g, (_, char: string) =>
        char.toLowerCase() === 'n' ? '\n' : char,
      );
}
