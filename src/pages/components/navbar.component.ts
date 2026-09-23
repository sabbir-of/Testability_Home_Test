import { Locator, Page, expect } from '@playwright/test';

/**
 * The header shared by every route. Its contents differ for guests and signed-in
 * users, which makes it the cheapest signal that a session is (or is not) active.
 */
export class NavBar {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.locator('nav.navbar');
  }

  get brand(): Locator {
    return this.root.getByRole('link', { name: 'conduit', exact: true });
  }

  get homeLink(): Locator {
    return this.root.getByRole('link', { name: 'Home' });
  }

  get newArticleLink(): Locator {
    return this.root.getByRole('link', { name: 'New Article' });
  }

  get settingsLink(): Locator {
    return this.root.getByRole('link', { name: 'Settings' });
  }

  get signInLink(): Locator {
    return this.root.getByRole('link', { name: 'Sign in' });
  }

  get signUpLink(): Locator {
    return this.root.getByRole('link', { name: 'Sign up' });
  }

  /** The profile link, which the app labels with the current username. */
  get profileLink(): Locator {
    return this.root.locator('a.nav-link[href^="/profile/"]');
  }

  async goToNewArticle(): Promise<void> {
    await this.newArticleLink.click();
  }

  async goToSettings(): Promise<void> {
    await this.settingsLink.click();
  }

  async getUsername(): Promise<string> {
    return (await this.profileLink.innerText()).trim();
  }

  /** Asserts the signed-in header: authoring links present, guest links absent. */
  async expectSignedIn(username?: string): Promise<void> {
    await expect(this.newArticleLink).toBeVisible();
    await expect(this.settingsLink).toBeVisible();
    await expect(this.signInLink).toHaveCount(0);
    if (username) {
      await expect(this.profileLink).toHaveText(new RegExp(escapeRegExp(username)));
    }
  }

  async expectSignedOut(): Promise<void> {
    await expect(this.signInLink).toBeVisible();
    await expect(this.signUpLink).toBeVisible();
    await expect(this.newArticleLink).toHaveCount(0);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
