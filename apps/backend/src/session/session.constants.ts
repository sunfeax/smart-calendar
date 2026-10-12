import { CookieOptions } from 'express';

export const SESSION_COOKIE = 'session';
export const SESSION_ONE_DAY_MS = 24 * 60 * 60 * 1000; // 1 day
export const SESSION_TTL_MS = SESSION_ONE_DAY_MS * 30; // 30 days
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_MS,
};
