import { ICON_EMOJI_MAX, ICON_URL_MAX } from '../constants/icon.constants';

export type EventIconView =
  { kind: 'emoji'; value: string } | { kind: 'image'; src: string };

export function toEventIconView(icon: string): EventIconView | null {
  if (icon.startsWith('emoji:'))
    return { kind: 'emoji', value: icon.slice('emoji:'.length) };
  if (icon.startsWith('brand:')) {
    return { kind: 'image', src: brandIconSrc(icon.slice('brand:'.length)) };
  }
  if (icon.startsWith('url:')) return { kind: 'image', src: icon.slice('url:'.length) };
  return null;
}

export function brandIconSrc(brand: string): string {
  return `/icons/brands/${brand}.svg`;
}

function siteIconUrl(value: string): string | null {
  const address = /^https?:\/\//.test(value) ? value : `https://${value}`;
  if (!URL.canParse(address)) return null;
  const { hostname } = new URL(address);
  if (!hostname.includes('.')) return null;
  return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
}

function isEmoji(value: string): boolean {
  return (
    value.length > 0 &&
    [...value].length <= ICON_EMOJI_MAX &&
    !/\s/.test(value) &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value)
  );
}

const IMAGE_PATH = /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i;

export function resolveIconInput(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > ICON_URL_MAX) return null;
  if (isEmoji(value)) return `emoji:${value}`;

  if (/^https?:\/\//.test(value) && URL.canParse(value)) {
    const url = new URL(value);
    if (IMAGE_PATH.test(url.pathname))
      return url.protocol === 'https:' ? `url:${value}` : null;
  }

  const site = siteIconUrl(value);
  return site ? `url:${site}` : null;
}
