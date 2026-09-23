import type { BrowserContextOptions } from '@playwright/test';
import { env } from '../config/env';

/**
 * Conduit keeps its JWT in `localStorage` and sets no cookies, so an
 * authenticated browser session is fully described by that one value.
 *
 * That lets a test skip the login form entirely: obtain a token over the API,
 * hand the resulting storage state to the browser context, and the app boots
 * already signed in. Used by the settings suite, where each test needs its own
 * freshly registered user.
 */
export function storageStateForToken(token: string): BrowserContextOptions['storageState'] {
  return {
    cookies: [],
    origins: [
      {
        origin: env.baseURL.replace(/\/$/, ''),
        localStorage: [{ name: env.tokenStorageKey, value: token }],
      },
    ],
  };
}

/** An explicitly signed-out state, for tests that assert on guest behaviour. */
export const ANONYMOUS_STATE: BrowserContextOptions['storageState'] = {
  cookies: [],
  origins: [],
};
