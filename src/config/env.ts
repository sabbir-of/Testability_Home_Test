import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Reads an environment variable, falling back to a default.
 * Throws when a variable has no value and no default, so a misconfigured
 * run fails immediately with a clear message instead of midway through a test.
 */
function required(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy .env.example to .env and fill it in, or set it as a CI secret.`
    );
  }
  return value;
}

const ROOT_DIR = path.resolve(__dirname, '..', '..');

export const env = {
  /** Root of the repository — used to resolve output paths consistently. */
  rootDir: ROOT_DIR,

  /** Angular front end under test. */
  baseURL: required('BASE_URL', 'https://conduit.bondaracademy.com'),

  /** REST backend, used for API pre-conditions, cleanup and state verification. */
  apiURL: required('API_URL', 'https://conduit-api.bondaracademy.com/api'),

  /** The shared account the UI suite authenticates as. */
  user: {
    get email(): string {
      return required('CONDUIT_EMAIL');
    },
    get password(): string {
      return required('CONDUIT_PASSWORD');
    },
    get username(): string {
      return required('CONDUIT_USERNAME');
    },
  },

  /** Where the reusable authenticated session is persisted. */
  storageStatePath: path.join(ROOT_DIR, '.auth', 'user.json'),

  /** Key the Conduit front end reads its JWT from. */
  tokenStorageKey: 'jwtToken',

  isCI: !!process.env.CI,
} as const;
