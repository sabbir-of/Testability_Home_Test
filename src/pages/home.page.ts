import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * The global feed, the popular-tags sidebar and the feed toggle.
 *
 * Two details of the real markup shape this object:
 *  - While a feed loads, the app renders a `.article-preview` containing only
 *    the text "Loading articles…". Counting bare `.article-preview` elements
 *    would therefore count the spinner as an article, so every article locator
 *    is qualified with `:has(a.preview-link)`.
 *  - Selecting a tag does not change the URL. The only signal is a third pill
 *    appearing in the feed toggle, which is `hidden` until a tag is active.
 */
export class HomePage extends BasePage {
  protected readonly path = '/';

  constructor(page: Page) {
    super(page);
  }

  // ------------------------------------------------------------- feed ----

  get feedToggle(): Locator {
    return this.page.locator('.feed-toggle');
  }

  get yourFeedTab(): Locator {
    return this.feedToggle.getByRole('listitem').filter({ hasText: 'Your Feed' });
  }

  get globalFeedTab(): Locator {
    return this.feedToggle.getByRole('listitem').filter({ hasText: 'Global Feed' });
  }

  /** The pill that appears only while a tag filter is applied. */
  get tagFilterTab(): Locator {
    return this.feedToggle.locator('li.nav-item').filter({ has: this.page.locator('i.ion-pound') });
  }

  /** Real article cards, excluding the loading placeholder. */
  get articleCards(): Locator {
    return this.page.locator('app-article-list .article-preview').filter({
      has: this.page.locator('a.preview-link'),
    });
  }

  get articleTitles(): Locator {
    return this.articleCards.locator('a.preview-link h1');
  }

  get loadingIndicator(): Locator {
    return this.page.locator('app-article-list .article-preview', { hasText: 'Loading articles' });
  }

  get emptyFeedMessage(): Locator {
    return this.page.locator('app-article-list', { hasText: 'No articles are here' });
  }

  // ---------------------------------------------------------- sidebar ----

  get sidebar(): Locator {
    return this.page.locator('.sidebar');
  }

  get popularTags(): Locator {
    return this.sidebar.locator('.tag-list a.tag-pill');
  }

  tagLink(tag: string): Locator {
    return this.popularTags.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(tag)}\\s*$`) });
  }

  // ----------------------------------------------------------- actions ----

  async waitUntilReady(): Promise<void> {
    await expect(this.feedToggle).toBeVisible();
    await this.waitForFeedToLoad();
  }

  /** Waits for the spinner to clear and the feed to settle on articles or an empty state. */
  async waitForFeedToLoad(): Promise<void> {
    await expect(this.loadingIndicator).toHaveCount(0);
    await expect(this.articleCards.or(this.emptyFeedMessage).first()).toBeVisible();
  }

  async waitForTagsToLoad(): Promise<void> {
    await expect(this.popularTags.first()).toBeVisible();
  }

  /** Clicks a tag in the sidebar and waits for the filtered feed to render. */
  async filterByTag(tag: string): Promise<void> {
    await this.waitForTagsToLoad();
    await this.tagLink(tag).click();
    await expect(this.tagFilterTab).toBeVisible();
    await this.waitForFeedToLoad();
  }

  async openGlobalFeed(): Promise<void> {
    await this.globalFeedTab.click();
    await this.waitForFeedToLoad();
  }

  async openArticle(title: string): Promise<void> {
    await this.articleCards.filter({ hasText: title }).locator('a.preview-link').click();
    await this.page.waitForURL(/\/article\//);
  }

  /** Titles currently rendered in the feed, trimmed. */
  async getVisibleArticleTitles(): Promise<string[]> {
    const titles = await this.articleTitles.allTextContents();
    return titles.map((title) => title.trim());
  }

  /**
   * Title and tags of every rendered card, read in a single DOM snapshot.
   *
   * Reading them together matters: the feed is shared, public data that other
   * activity can change between two separate queries, which would make an
   * assertion built from two reads intermittently disagree with itself.
   */
  async getVisibleArticles(): Promise<{ title: string; tags: string[] }[]> {
    return this.articleCards.evaluateAll((cards) =>
      cards.map((card) => ({
        title: card.querySelector('a.preview-link h1')?.textContent?.trim() ?? '',
        tags: Array.from(card.querySelectorAll('ul.tag-list li')).map(
          (tag) => tag.textContent?.trim() ?? ''
        ),
      }))
    );
  }

  /** The tag pills shown on one article card. */
  cardTags(title: string): Locator {
    return this.articleCards.filter({ hasText: title }).locator('ul.tag-list li');
  }

  /** The active feed tab, used to verify which feed the app thinks it is showing. */
  get activeTab(): Locator {
    return this.feedToggle.locator('a.nav-link.active');
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
