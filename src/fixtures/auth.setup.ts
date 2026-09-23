import fs from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { env } from '../config/env';
import { NavBar } from '../pages/components/navbar.component';
import { LoginPage } from '../pages/login.page';

/**
 * Signs in once and persists the session to disk.
 *
 * Every browser project depends on this, so the whole suite pays for exactly one
 * login instead of one per test. The login itself goes through the real form —
 * seeding a token directly would leave the app's own authentication path
 * untested, and this is the one place it is worth exercising.
 */
setup('authenticate and persist session', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const navBar = new NavBar(page);

  await loginPage.goto();
  await loginPage.login(env.user.email, env.user.password);

  // Prove the session is genuinely established before saving it — otherwise a
  // failed login would be cached and every downstream test would fail obscurely.
  await navBar.expectSignedIn(env.user.username);

  const token = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    env.tokenStorageKey
  );
  expect(token, 'Expected a JWT in localStorage after signing in').toBeTruthy();

  fs.mkdirSync(path.dirname(env.storageStatePath), { recursive: true });
  await page.context().storageState({ path: env.storageStatePath });
});
