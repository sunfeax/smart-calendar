export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const THROTTLE_TTL_MS = 60 * 1000;
export const THROTTLE_LIMIT = 300;
export const THROTTLE_STRICT_LIMIT = 10;
export const STRICT_THROTTLE = {
  default: { limit: THROTTLE_STRICT_LIMIT, ttl: THROTTLE_TTL_MS },
};
