export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 2000;
const FLAG_EMOJI = String.raw`\p{Regional_Indicator}{2}`;
const KEYCAP_EMOJI = String.raw`[#*0-9]\uFE0F?\u20E3`;
const PICTOGRAPHIC_EMOJI = String.raw`\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?`;
const EMOJI_COMPONENT = `(?:${FLAG_EMOJI}|${KEYCAP_EMOJI}|${PICTOGRAPHIC_EMOJI})`;
export const ICON_EMOJI_PATTERN = new RegExp(
  `^(?:${EMOJI_COMPONENT}(?:\\u200D${EMOJI_COMPONENT})*)+$`,
  'u',
);
export const ICON_EMOJI_MAX = 16;
export const ICON_BRAND_PATTERN = /^[a-z0-9-]{1,40}$/;
export const ICON_URL_MAX = 2048;
export const RANGE_MAX_DAYS = 375;
export const RANGE_MAX_ITEMS = 5000;
