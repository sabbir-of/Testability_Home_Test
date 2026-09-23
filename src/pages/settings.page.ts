import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export interface SettingsFormValues {
  image?: string;
  username?: string;
  bio?: string;
  email?: string;
  password?: string;
}

/**
 * The account settings form at `/settings`.
 *
 * Two behaviours of the live app drive this object's design:
 *
 *  1. The form does NOT pre-populate with the signed-in user's current values —
 *     every field renders empty on arrival, however the session was established.
 *     This is a defect (see the `@known-defect` test in the settings spec); the
 *     page object simply does not assume values are present.
 *  2. On success the app navigates to `/profile/:username`; on failure it stays
 *     put and renders nothing. That redirect is the only reliable success signal
 *     the page offers, so the helpers below are built around it.
 *
 * Because the form starts empty, the backend treats omitted (empty) fields as
 * "leave unchanged" — submitting only a bio does not wipe the username or email.
 */
export class SettingsPage extends BasePage {
  protected readonly path = '/settings';

  constructor(page: Page) {
    super(page);
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Your Settings' });
  }

  get imageInput(): Locator {
    return this.page.getByRole('textbox', { name: 'URL of profile picture' });
  }

  get usernameInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Username' });
  }

  get bioInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Short bio about you' });
  }

  get emailInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Email' });
  }

  get passwordInput(): Locator {
    return this.page.getByRole('textbox', { name: 'New Password' });
  }

  get updateButton(): Locator {
    return this.page.getByRole('button', { name: 'Update Settings' });
  }

  get logoutButton(): Locator {
    return this.page.getByRole('button', { name: 'Or click here to logout.' });
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.usernameInput).toBeEditable();
    await expect(this.updateButton).toBeEnabled();
  }

  /** Overwrites only the fields provided. `fill` replaces existing content. */
  async fillForm(values: SettingsFormValues): Promise<void> {
    if (values.image !== undefined) await this.imageInput.fill(values.image);
    if (values.username !== undefined) await this.usernameInput.fill(values.username);
    if (values.bio !== undefined) await this.bioInput.fill(values.bio);
    if (values.email !== undefined) await this.emailInput.fill(values.email);
    if (values.password !== undefined) await this.passwordInput.fill(values.password);
  }

  async submit(): Promise<void> {
    await this.updateButton.click();
  }

  /** Submits and waits for the profile redirect that marks a successful save. */
  async submitAndWaitForProfile(): Promise<void> {
    await this.submit();
    await this.page.waitForURL(/\/profile\/.+/);
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
    await this.page.waitForURL(/\/$/);
  }

  /** The values the form is currently showing. */
  async readForm(): Promise<Required<Omit<SettingsFormValues, 'password'>>> {
    return {
      image: await this.imageInput.inputValue(),
      username: await this.usernameInput.inputValue(),
      bio: await this.bioInput.inputValue(),
      email: await this.emailInput.inputValue(),
    };
  }
}
