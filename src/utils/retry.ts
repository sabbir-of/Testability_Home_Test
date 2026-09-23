import type { APIResponse } from '@playwright/test';

export interface RetryOptions {
  attempts?: number;
  /** Base delay in ms; each further attempt waits a multiple of it. */
  delayMs?: number;
  label?: string;
}

/**
 * Retries a request that came back with a server-side (5xx) error.
 *
 * Conduit is a shared public demo instance and its backend intermittently
 * returns 500 under concurrent writes. Retrying 5xx keeps the suite honest —
 * a 4xx, which is what a real validation or permissions bug looks like, is
 * returned immediately and never retried away.
 */
export async function retryOnServerError(
  send: () => Promise<APIResponse>,
  { attempts = 3, delayMs = 500, label = 'request' }: RetryOptions = {}
): Promise<APIResponse> {
  let response = await send();

  for (let attempt = 1; attempt < attempts && response.status() >= 500; attempt++) {
    console.warn(
      `[retry] ${label} returned ${response.status()}; attempt ${attempt + 1} of ${attempts}`
    );
    await sleep(delayMs * attempt);
    response = await send();
  }

  return response;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
