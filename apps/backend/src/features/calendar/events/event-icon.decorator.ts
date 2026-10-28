import { ValidateBy, ValidationOptions } from 'class-validator';
import { ICON_BRAND_PATTERN, ICON_EMOJI_MAX, ICON_URL_MAX } from './event.constants.js';

const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

export function isEventIcon(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  if (value.startsWith('emoji:')) {
    const emoji = value.slice('emoji:'.length);
    return (
      [...emoji].length <= ICON_EMOJI_MAX &&
      !/\s/.test(emoji) &&
      EMOJI_PATTERN.test(emoji)
    );
  }

  if (value.startsWith('brand:')) {
    return ICON_BRAND_PATTERN.test(value.slice('brand:'.length));
  }

  if (value.startsWith('url:')) {
    const url = value.slice('url:'.length);
    if (url.length > ICON_URL_MAX || !URL.canParse(url)) return false;
    return new URL(url).protocol === 'https:';
  }

  return false;
}

export const IsEventIcon = (options?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'isEventIcon',
      validator: {
        validate: isEventIcon,
        defaultMessage: () =>
          '$property must be emoji:<emoji>, brand:<key> or url:<https link>',
      },
    },
    options,
  );
