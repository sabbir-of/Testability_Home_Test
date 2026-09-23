import { Locator, Page, expect } from '@playwright/test';
import type { ArticlePayload } from '../api/types';
import { BasePage } from './base.page';

/**
 * The article editor, used for both creating (`/editor`) and editing
 * (`/editor/:slug`) — Conduit serves the same component for each, and the
 * submit button reads "Publish Article" in both modes.
 */
export class EditorPage extends BasePage {
  protected readonly path = '/editor';

  constructor(page: Page) {
    super(page);
  }

  private get root(): Locator {
    return this.page.locator('app-editor-page');
  }

  get titleInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Article Title' });
  }

  get descriptionInput(): Locator {
    return this.page.getByRole('textbox', { name: "What's this article about?" });
  }

  get bodyInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Write your article (in markdown)' });
  }

  get tagsInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Enter tags' });
  }

  get publishButton(): Locator {
    return this.page.getByRole('button', { name: 'Publish Article' });
  }

  /** Tag chips already attached to the article being edited. */
  get tagPills(): Locator {
    return this.root.locator('.tag-list .tag-pill');
  }

  /** Opens the editor in create mode. */
  async open(): Promise<void> {
    await this.goto();
  }

  /** Opens the editor in edit mode for an existing article. */
  async openForSlug(slug: string): Promise<void> {
    await this.page.goto(`/editor/${encodeURIComponent(slug)}`);
    await this.waitUntilReady();
    // Edit mode hydrates asynchronously; wait for the form to hold real values
    // before any test starts clearing and retyping fields.
    await expect(this.titleInput).not.toHaveValue('');
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.titleInput).toBeVisible();
    await expect(this.publishButton).toBeEnabled();
  }

  async fillTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
  }

  async fillDescription(description: string): Promise<void> {
    await this.descriptionInput.fill(description);
  }

  async fillBody(body: string): Promise<void> {
    await this.bodyInput.fill(body);
  }

  /** Adds tags one at a time — the app commits a tag on Enter. */
  async addTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.tagsInput.fill(tag);
      await this.tagsInput.press('Enter');
      await expect(this.tagPills.filter({ hasText: tag })).toBeVisible();
    }
  }

  async removeTag(tag: string): Promise<void> {
    await this.tagPills.filter({ hasText: tag }).locator('i.ion-close-round').click();
    await expect(this.tagPills.filter({ hasText: tag })).toHaveCount(0);
  }

  /** Replaces every field. Passing no tags leaves existing tags untouched. */
  async fillForm(article: Partial<ArticlePayload>): Promise<void> {
    if (article.title !== undefined) await this.fillTitle(article.title);
    if (article.description !== undefined) await this.fillDescription(article.description);
    if (article.body !== undefined) await this.fillBody(article.body);
    if (article.tagList?.length) await this.addTags(article.tagList);
  }

  async publish(): Promise<void> {
    await this.publishButton.click();
  }

  /** Submits and waits for the redirect to the published article. */
  async publishAndWaitForArticle(): Promise<void> {
    await this.publish();
    await this.page.waitForURL(/\/article\/.+/);
  }

  /** The tag names currently attached, trimmed. */
  async getTagNames(): Promise<string[]> {
    const tags = await this.tagPills.allTextContents();
    return tags.map((tag) => tag.trim()).filter(Boolean);
  }
}
