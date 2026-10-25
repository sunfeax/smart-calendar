export const NAME_MAX = 100;
export const MAX_TAG_CATEGORIES_PER_CALENDAR = 10;
export const MAX_TAGS_PER_CATEGORY = 20;

export const TAG_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_COLOR_DEFAULT: TagColor = 'gray';
