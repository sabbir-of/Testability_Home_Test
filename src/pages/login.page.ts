import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  protected readonly path = '/login';

  constructor(page: Page) {
    super(page);
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Sign in' });
  }

  get emailInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Email' });
  }

  get passwordInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Password' });
  }

  get signInButton(): Locator {
    return this.page.getByRole('button', { name: 'Sign in' });
  }

  get needAnAccountLink(): Locator {
    return this.page.getByRole('link', { name: 'Need an account?' });
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.emailInput).toBeVisible();
  }

  /** Fills the form and submits, without asserting the outcome. */
  async submitCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  /** Signs in and waits for the redirect to the home feed. */
  async login(email: string, password: string): Promise<void> {
    await this.submitCredentials(email, password);
    await this.page.waitForURL(/\/$/);
  }
}
