import { routePaths } from '../../../core/constants/routePaths';

export function toSafeReturnUrl(url: string | null): string {
  return url?.startsWith('/') && !url.startsWith('//') ? url : routePaths.calendars;
}
