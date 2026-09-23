import { buildProfileUpdate } from '../../src/data/user.factory';
import { NavBar } from '../../src/pages/components/navbar.component';
import { ProfilePage } from '../../src/pages/profile.page';
import { SettingsPage } from '../../src/pages/settings.page';
import { expect, test } from '../../src/fixtures/test';

/**
 * These tests run against a throwaway account created per test, not the shared
 * one. They rename the user and rewrite the bio — mutating shared state that
 * other specs assert on (the navbar username, the article author) would make the
 * suite fail depending on execution order.
 *
 * Note on the form: Conduit renders `/settings` with every field empty rather
 * than pre-filled with the current values. The backend reads an omitted field as
 * "leave unchanged", so partial updates are safe. The empty form is a genuine
 * usability defect and is pinned by the `@known-defect` test at the bottom.
 */
test.describe('Update User Settings', { tag: '@user' }, () => {
  test(
    'saves profile changes, redirects to the profile and persists them',
    { tag: ['@positive', '@smoke'] },
    async ({ isolatedUser }) => {
      const { page, user, api } = isolatedUser;
      const settingsPage = new SettingsPage(page);
      const profilePage = new ProfilePage(page);
      const navBar = new NavBar(page);
      const update = buildProfileUpdate();

      await test.step('open settings as the newly created user', async () => {
        await page.goto('/settings');
        await settingsPage.waitUntilReady();
        await navBar.expectSignedIn(user.username);
      });

      await test.step('change the username, bio and avatar, then save', async () => {
        await settingsPage.fillForm({
          username: update.username,
          bio: update.bio,
          image: update.image,
        });

        await expect(settingsPage.usernameInput).toHaveValue(update.username);
        await expect(settingsPage.bioInput).toHaveValue(update.bio);

        await settingsPage.submitAndWaitForProfile();
      });

      await test.step('the app lands on the updated profile', async () => {
        await expect(page).toHaveURL(new RegExp(`/profile/${escapeRegExp(update.username)}$`));
        await profilePage.waitUntilReady();
        expect(await profilePage.getUsername()).toBe(update.username);
        expect(await profilePage.getBio()).toBe(update.bio);
        await expect(profilePage.avatar).toHaveAttribute('src', update.image);
      });

      await test.step('the change reached the backend', async () => {
        const stored = await api.getCurrentUser();
        expect(stored.username).toBe(update.username);
        expect(stored.bio).toBe(update.bio);
        expect(stored.image).toBe(update.image);
        // Email was never edited, so a partial update must have left it alone.
        expect(stored.email).toBe(user.email);
      });

      await test.step('the update survives a full page reload', async () => {
        // Reload first: the header is left in a broken state by a save (pinned by
        // the `@known-defect` test below) and only recovers on a fresh load.
        await page.reload();
        await profilePage.waitUntilReady();
        expect(await profilePage.getUsername()).toBe(update.username);
        expect(await profilePage.getBio()).toBe(update.bio);
        await navBar.expectSignedIn(update.username);
      });
    }
  );

  test(
    'updating one field leaves the others untouched',
    { tag: '@positive' },
    async ({ isolatedUser }) => {
      const { page, user, api } = isolatedUser;
      const settingsPage = new SettingsPage(page);
      const bio = `Only the bio changed — ${Date.now()}`;

      await page.goto('/settings');
      await settingsPage.waitUntilReady();

      await settingsPage.fillForm({ bio });
      await settingsPage.submitAndWaitForProfile();

      const stored = await api.getCurrentUser();
      expect(stored.bio).toBe(bio);
      expect(stored.username, 'A bio-only update must not rename the user').toBe(user.username);
      expect(stored.email, 'A bio-only update must not change the email').toBe(user.email);
    }
  );

  test(
    'does not apply a username that is already taken',
    { tag: '@negative' },
    async ({ isolatedUser, api: sharedApi }) => {
      const { page, user, api } = isolatedUser;
      const settingsPage = new SettingsPage(page);

      // Pick a username that demonstrably belongs to somebody else.
      const feed = await sharedApi.listArticles({ limit: 20 });
      const takenUsername = feed.articles
        .map((article) => article.author.username)
        .find((name) => name !== user.username);
      test.skip(!takenUsername, 'No other username was available from the global feed.');

      await test.step('try to claim the taken username', async () => {
        await page.goto('/settings');
        await settingsPage.waitUntilReady();
        await settingsPage.fillForm({ username: takenUsername! });
        await settingsPage.submit();
      });

      await test.step('the save is rejected and the user stays on settings', async () => {
        // A successful save navigates to /profile/:username. Staying put is the
        // app's only signal that the update failed, so hold the assertion long
        // enough for a late redirect to be caught if one were to happen.
        await expect(page).toHaveURL(/\/settings$/);
        await page.waitForTimeout(2_000);
        await expect(page).toHaveURL(/\/settings$/);
      });

      await test.step('the stored username is untouched', async () => {
        const stored = await api.getCurrentUser();
        expect(stored.username).toBe(user.username);
        expect(stored.username).not.toBe(takenUsername);
      });

      await test.step('the API rejects the same change directly', async () => {
        const response = await api.rawUpdateUser({ username: takenUsername! });
        expect(response.ok(), 'A duplicate username must not be accepted').toBe(false);
      });
    }
  );

  test(
    'logging out from settings ends the session and locks the page',
    { tag: '@negative' },
    async ({ isolatedUser }) => {
      const { page, user } = isolatedUser;
      const settingsPage = new SettingsPage(page);
      const navBar = new NavBar(page);

      await page.goto('/settings');
      await settingsPage.waitUntilReady();
      await navBar.expectSignedIn(user.username);

      await settingsPage.logout();

      await test.step('the header returns to its signed-out state', async () => {
        await navBar.expectSignedOut();
      });

      await test.step('settings is no longer reachable', async () => {
        await page.goto('/settings');
        await expect(page).toHaveURL(/\/$/);
        await expect(settingsPage.heading).toHaveCount(0);
      });
    }
  );

  /**
   * Pinned defect.
   *
   * Expected behaviour: opening `/settings` shows the signed-in user's current
   * username, email, bio and avatar so they can be reviewed and adjusted.
   * Actual behaviour: every field is blank, whether the session came from the
   * login form or a restored token, and no amount of waiting fills them in.
   * Impact: a user cannot see what their current settings are, and editing one
   * field looks as though it will erase the rest.
   *
   * `test.fail()` asserts that this is still broken. The moment the application
   * is fixed this test starts passing, Playwright reports it as an unexpected
   * pass, and the defect note above can be removed.
   */
  test(
    'known defect: the settings form does not pre-populate current values',
    { tag: ['@negative', '@known-defect'] },
    async ({ isolatedUser }) => {
      test.fail();

      const { page, user } = isolatedUser;
      const settingsPage = new SettingsPage(page);

      await page.goto('/settings');
      await settingsPage.waitUntilReady();

      const form = await settingsPage.readForm();
      expect(form.username, 'Settings should show the current username').toBe(user.username);
      expect(form.email, 'Settings should show the current email').toBe(user.email);
    }
  );

  /**
   * Pinned defect.
   *
   * Expected behaviour: after saving settings the app redirects to the profile
   * with its header intact — Home, New Article, Settings and the username.
   * Actual behaviour: the header collapses to the "conduit" brand alone. No
   * navigation links are rendered for either a signed-in or a signed-out user,
   * and it stays that way; only a full page reload restores it. The session
   * itself is fine — the JWT is still in storage.
   * Impact: immediately after changing their settings the user is stranded on
   * the profile page with no way to navigate.
   *
   * Reproduced with a bio-only save as well as a rename, so it is triggered by
   * any successful update rather than by the username change.
   */
  test(
    'known defect: the header loses its navigation after a settings save',
    { tag: ['@negative', '@known-defect'] },
    async ({ isolatedUser }) => {
      test.fail();

      const { page, user } = isolatedUser;
      const settingsPage = new SettingsPage(page);
      const navBar = new NavBar(page);

      await page.goto('/settings');
      await settingsPage.waitUntilReady();
      await navBar.expectSignedIn(user.username);

      await settingsPage.fillForm({ bio: `header check ${Date.now()}` });
      await settingsPage.submitAndWaitForProfile();

      // Without reloading, the header should still offer navigation.
      await navBar.expectSignedIn(user.username);
    }
  );
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
