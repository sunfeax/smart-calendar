import writeXlsxFile, { Cell, Row, SheetData } from 'write-excel-file/browser';
import { EventDto, TagCategoryDto } from '../../../api/generated';
import {
  EXPORT_COLORS,
  EXPORT_DATE_FORMAT,
  EXPORT_DATE_TIME_FORMAT,
} from '../constants/export.constants';

export interface EventsXlsxLabels {
  title: string;
  untitled: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: string;
  completed: string;
  tags: string;
  yes: string;
  no: string;
}

const BASE_COLUMNS = 6;

const BORDER = {
  borderColor: EXPORT_COLORS.border,
  borderStyle: 'thin',
} as const;

const HEADER = {
  ...BORDER,
  fontWeight: 'bold',
  backgroundColor: EXPORT_COLORS.header,
  textColor: EXPORT_COLORS.headerText,
  align: 'center',
  alignVertical: 'center',
  wrap: true,
} as const;

const BODY = {
  ...BORDER,
  alignVertical: 'top',
  textColor: EXPORT_COLORS.text,
} as const;

export async function downloadEventsXlsx(
  events: EventDto[],
  categories: TagCategoryDto[],
  labels: EventsXlsxLabels,
  fileName: string,
): Promise<void> {
  const sheet: SheetData = [
    ...toHeaderRows(categories, labels),
    ...events.map(event => toEventRow(event, categories, labels)),
  ];

  await writeXlsxFile(sheet, {
    columns: [
      { width: 32 },
      { width: 48 },
      { width: 18 },
      { width: 18 },
      { width: 11 },
      { width: 12 },
      ...categories.map(() => ({ width: 20 })),
    ],
    stickyRowsCount: categories.length ? 2 : 1,
    stickyColumnsCount: 1,
  }).toFile(fileName);
}

function toHeaderRows(categories: TagCategoryDto[], labels: EventsXlsxLabels): Row[] {
  const rowSpan = categories.length ? 2 : 1;
  const base: Cell[] = [
    labels.title,
    labels.description,
    labels.startAt,
    labels.endAt,
    labels.allDay,
    labels.completed,
  ].map(value => ({ ...HEADER, value, rowSpan, height: 22 }));

  if (!categories.length) return [base];

  const tagsGroup: Cell[] = [
    {
      ...HEADER,
      value: labels.tags,
      columnSpan: categories.length,
      backgroundColor: EXPORT_COLORS.tagsHeader,
    },
    ...categories.slice(1).map(() => null),
  ];
  const categoryNames: Cell[] = categories.map(category => ({
    ...HEADER,
    value: category.name,
    backgroundColor: EXPORT_COLORS.tagsHeader,
  }));

  return [
    [...base, ...tagsGroup],
    [...Array<Cell>(BASE_COLUMNS).fill(null), ...categoryNames],
  ];
}

function toEventRow(
  event: EventDto,
  categories: TagCategoryDto[],
  labels: EventsXlsxLabels,
): Row {
  const done = event.completedAt !== null;

  return [
    { ...BODY, value: event.title || labels.untitled, fontWeight: 'bold', wrap: true },
    { ...BODY, value: event.description ?? undefined, wrap: true },
    { ...BODY, ...toDateCell(event.startAt, event.allDay), align: 'center' },
    { ...BODY, ...toDateCell(event.endAt, event.allDay, true), align: 'center' },
    { ...BODY, value: event.allDay ? labels.yes : labels.no, align: 'center' },
    {
      ...BODY,
      value: done ? labels.yes : labels.no,
      align: 'center',
      ...(done && { textColor: EXPORT_COLORS.done, fontWeight: 'bold' as const }),
    },
    ...categories.map(category => ({
      ...BODY,
      value:
        category.tags
          .filter(tag => event.tagIds.includes(tag.id))
          .map(tag => tag.name)
          .join(', ') || undefined,
      wrap: true,
    })),
  ];
}

function toDateCell(value: string, allDay: boolean, isEnd = false) {
  const date = new Date(value);

  if (allDay) {
    if (isEnd) date.setUTCDate(date.getUTCDate() - 1);
    return { value: date, type: Date, format: EXPORT_DATE_FORMAT };
  }

  return {
    value: new Date(
      Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
      ),
    ),
    type: Date,
    format: EXPORT_DATE_TIME_FORMAT,
  };
}
