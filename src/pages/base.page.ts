import { Locator, Page, expect } from '@playwright/test';

/**
 * Shared behaviour for every page object.
 *
 * Conduit is an Angular SPA that renders placeholder text ("Loading articles…")
 * before data arrives, so page objects expose explicit readiness waits rather
 * than relying on `networkidle`, which is unreliable on a polling SPA.
 */
export abstract class BasePage {
  /** Route this page lives at, relative to `baseURL`. */
  protected abstract readonly path: string;

  constructor(protected readonly page: Page) {}

  /** Validation messages the app renders above its forms. */
  get errorMessages(): Locator {
    return this.page.locator('ul.error-messages li');
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitUntilReady();
  }

  /** Resolves once the page's defining element is on screen. */
  abstract waitUntilReady(): Promise<void>;

  /** All validation messages currently shown, trimmed. */
  async getErrorMessages(): Promise<string[]> {
    const messages = await this.errorMessages.allTextContents();
    return messages.map((message) => message.trim()).filter(Boolean);
  }

  async expectNoErrorMessages(): Promise<void> {
    await expect(this.errorMessages).toHaveCount(0);
  }

  get currentUrl(): string {
    return this.page.url();
  }
}
