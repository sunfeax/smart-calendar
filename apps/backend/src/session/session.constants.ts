import { CookieOptions } from 'express';
import { ONE_DAY_MS } from '../common/constants.js';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_MS = ONE_DAY_MS * 30;
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_MS,
};
