import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

/** The public profile at `/profile/:username` — where a settings save lands. */
export class ProfilePage extends BasePage {
  protected readonly path = '/profile';

  constructor(page: Page) {
    super(page);
  }

  private get root(): Locator {
    return this.page.locator('.profile-page');
  }

  get username(): Locator {
    return this.root.locator('.user-info h4');
  }

  get bio(): Locator {
    return this.root.locator('.user-info p');
  }

  get avatar(): Locator {
    return this.root.locator('img.user-img');
  }

  async open(username: string): Promise<void> {
    await this.page.goto(`/profile/${encodeURIComponent(username)}`);
    await this.waitUntilReady();
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.username).toBeVisible();
  }

  async getUsername(): Promise<string> {
    return (await this.username.innerText()).trim();
  }

  async getBio(): Promise<string> {
    return (await this.bio.innerText()).trim();
  }
}
