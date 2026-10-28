import {
  ICON_BRAND_PATTERN,
  ICON_EMOJI_MAX,
  ICON_EMOJI_PATTERN,
  ICON_URL_MAX,
} from '../constants/icon.constants';

export type IconInputKind = 'site' | 'image';

export type EventIconView =
  | { kind: 'emoji'; value: string }
  | { kind: 'image'; src: string };

export function toEventIconView(icon: string): EventIconView | null {
  if (icon.startsWith('emoji:')) {
    const value = icon.slice('emoji:'.length);
    return isEmoji(value) ? { kind: 'emoji', value } : null;
  }
  if (icon.startsWith('brand:')) {
    const brand = icon.slice('brand:'.length);
    return ICON_BRAND_PATTERN.test(brand)
      ? { kind: 'image', src: brandIconSrc(brand) }
      : null;
  }
  if (icon.startsWith('url:')) {
    const url = httpsImageUrl(icon.slice('url:'.length));
    return url ? { kind: 'image', src: url } : null;
  }
  return null;
}

export function brandIconSrc(brand: string): string {
  return `/icons/brands/${brand}.svg`;
}

export function resolveIconInput(
  raw: string,
  kind: IconInputKind = 'site',
): string | null {
  const value = raw.trim();
  if (!value || value.length > ICON_URL_MAX) return null;
  if (isEmoji(value)) return `emoji:${value}`;

  const url = kind === 'image' ? httpsImageUrl(value) : siteIconUrl(value);
  return url ? `url:${url}` : null;
}

function isEmoji(value: string): boolean {
  return (
    [...value].length <= ICON_EMOJI_MAX &&
    !/\s/.test(value) &&
    ICON_EMOJI_PATTERN.test(value)
  );
}

function httpsImageUrl(value: string): string | null {
  if (value.length > ICON_URL_MAX || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === 'https:' ? value : null;
}

function siteIconUrl(value: string): string | null {
  const address = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  if (!URL.canParse(address)) return null;
  const url = new URL(address);
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.')) {
    return null;
  }
  const iconUrl = `https://icons.duckduckgo.com/ip3/${url.hostname}.ico`;
  return iconUrl.length <= ICON_URL_MAX ? iconUrl : null;
}
