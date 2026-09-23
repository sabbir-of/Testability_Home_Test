import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

/**
 * Playwright configuration for the Conduit E2E suite.
 *
 * Projects are arranged so that `setup` signs in once and writes a storage
 * state, and each browser project then starts every test already authenticated.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  /* Tests are independent and clean up their own data, so they can all run at once. */
  fullyParallel: true,

  /* A stray `test.only` must never silently shrink a CI run. */
  forbidOnly: env.isCI,

  /* Conduit is a shared public demo instance; one retry absorbs genuine flakiness
     without hiding a real regression, which would fail both attempts. */
  retries: env.isCI ? 2 : 1,
  workers: env.isCI ? 4 : undefined,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/html', open: 'never' }],
    ['junit', { outputFile: 'playwright-report/junit/results.xml' }],
    ['json', { outputFile: 'playwright-report/json/results.json' }],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true }],
  ],

  use: {
    baseURL: env.baseURL,

    /* Traces, screenshots and video only for failures — full traceability on the
       runs that need debugging, without bloating a green run's artifacts. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'setup',
      testDir: './src/fixtures',
      testMatch: /auth\.setup\.ts/,
      // Pinned to Chromium on purpose. The saved session is a single
      // localStorage entry and carries no browser-specific state, so signing in
      // once here serves all three browser projects. Every CI job therefore
      // installs Chromium alongside the browser it is actually testing.
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: env.storageStatePath },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: env.storageStatePath },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], storageState: env.storageStatePath },
      dependencies: ['setup'],
    },
  ],
});
