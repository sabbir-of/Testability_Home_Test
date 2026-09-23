import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * A single published article at `/article/:slug`.
 *
 * Conduit renders the author toolbar twice — once in the banner and once below
 * the body — so every action locator is narrowed with `.first()`; clicking a
 * bare locator that matches two elements is a strict-mode violation.
 */
export class ArticlePage extends BasePage {
  protected readonly path = '/article';

  constructor(page: Page) {
    super(page);
  }

  private get root(): Locator {
    return this.page.locator('app-article-page');
  }

  get title(): Locator {
    return this.root.locator('.banner h1');
  }

  get body(): Locator {
    return this.root.locator('.article-content');
  }

  get tags(): Locator {
    return this.root.locator('.article-content ul.tag-list li');
  }

  get authorName(): Locator {
    return this.root.locator('.article-meta a.author').first();
  }

  get editArticleLink(): Locator {
    return this.root.getByRole('link', { name: 'Edit Article' }).first();
  }

  get deleteArticleButton(): Locator {
    return this.root.getByRole('button', { name: 'Delete Article' }).first();
  }

  get commentInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Write a comment...' });
  }

  async open(slug: string): Promise<void> {
    await this.page.goto(`/article/${encodeURIComponent(slug)}`);
    await this.waitUntilReady();
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.title).toBeVisible();
  }

  /** The slug taken from the current URL — it changes when a title is edited. */
  get slug(): string {
    return decodeURIComponent(new URL(this.page.url()).pathname.replace('/article/', ''));
  }

  async getTitle(): Promise<string> {
    return (await this.title.innerText()).trim();
  }

  async getTagNames(): Promise<string[]> {
    const tags = await this.tags.allTextContents();
    return tags.map((tag) => tag.trim()).filter(Boolean);
  }

  async clickEdit(): Promise<void> {
    await this.editArticleLink.click();
    await this.page.waitForURL(/\/editor\/.+/);
  }

  /** Deletes the article and waits for the redirect to the home feed. */
  async deleteArticle(): Promise<void> {
    await this.deleteArticleButton.click();
    await this.page.waitForURL(/\/$/);
  }

  /** Author-only controls, absent when viewing somebody else's article. */
  async expectOwnerControlsVisible(): Promise<void> {
    await expect(this.editArticleLink).toBeVisible();
    await expect(this.deleteArticleButton).toBeVisible();
  }

  async expectOwnerControlsHidden(): Promise<void> {
    await expect(this.root.getByRole('link', { name: 'Edit Article' })).toHaveCount(0);
    await expect(this.root.getByRole('button', { name: 'Delete Article' })).toHaveCount(0);
  }
}
