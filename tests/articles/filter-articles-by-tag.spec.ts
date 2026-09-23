import type { ConduitApi } from '../../src/api/conduit-api';
import { buildArticle, buildTag } from '../../src/data/article.factory';
import { expect, test } from '../../src/fixtures/test';

/**
 * Tag filtering, verified through the sidebar the user actually clicks.
 *
 * Two characteristics of this deployment shape the tests below, both confirmed
 * by probing the API directly rather than assumed:
 *
 *  - `GET /tags` returns a fixed, curated "popular tags" list. A tag invented by
 *    a new article is filterable but never joins that list, so the sidebar
 *    journey has to use a popular tag. Tag-discrimination logic is covered
 *    separately against a unique tag, where an exact assertion is possible.
 *  - Anonymous callers only ever see the ten seeded demo articles; an
 *    authenticated caller sees every article. All API assertions here therefore
 *    run authenticated, matching what the signed-in browser session sees.
 */
test.describe('Filter Articles by Tag', { tag: '@articles' }, () => {
  /** The number of articles Conduit renders per feed page. */
  const FEED_PAGE_SIZE = 10;

  /** Picks the popular tag with the most articles, so assertions have substance. */
  async function pickBusiestTag(api: ConduitApi): Promise<{ tag: string; titles: string[] }> {
    const tags = await api.getTags();
    expect(tags.length, 'The application should expose popular tags').toBeGreaterThan(0);

    const counted: { tag: string; titles: string[] }[] = [];
    for (const tag of tags) {
      const feed = await api.listArticles({ tag, limit: FEED_PAGE_SIZE });
      counted.push({ tag, titles: feed.articles.map((article) => article.title) });
    }

    const busiest = counted.sort((a, b) => b.titles.length - a.titles.length)[0];
    expect(busiest.titles.length, 'At least one popular tag should have articles').toBeGreaterThan(
      0
    );
    return busiest;
  }

  test(
    'shows only the articles carrying the selected tag',
    { tag: ['@positive', '@smoke'] },
    async ({ api, homePage }) => {
      const { tag, titles: expectedTitles } = await pickBusiestTag(api);

      await test.step('the tag is offered in the popular-tags sidebar', async () => {
        await homePage.goto();
        await homePage.waitForTagsToLoad();
        await expect(homePage.tagLink(tag)).toBeVisible();
      });

      await test.step('selecting the tag switches the feed to a tag view', async () => {
        await homePage.filterByTag(tag);
        await expect(homePage.tagFilterTab).toBeVisible();
        await expect(homePage.tagFilterTab).toContainText(tag);
        // Exactly one tab is active — the tag tab replaces the global feed.
        await expect(homePage.activeTab).toHaveCount(1);
        await expect(homePage.activeTab).toContainText(tag);
      });

      await test.step('the feed holds exactly the articles the API reports', async () => {
        await expect(homePage.articleCards).toHaveCount(expectedTitles.length);

        const visible = await homePage.getVisibleArticles();
        expect(visible.map((article) => article.title).sort()).toEqual([...expectedTitles].sort());
      });

      await test.step('every card on screen displays the tag', async () => {
        const visible = await homePage.getVisibleArticles();
        for (const article of visible) {
          expect(
            article.tags,
            `Article "${article.title}" was returned by the "${tag}" filter and should display that tag`
          ).toContain(tag);
        }
      });

      await test.step('returning to the global feed clears the filter', async () => {
        await homePage.openGlobalFeed();
        await expect(homePage.tagFilterTab).toBeHidden();

        // Asserted as a property of the feed rather than by naming a specific
        // article: the global feed is shared, public data that other activity
        // can reorder at any moment, so pinning an individual title would be
        // intermittently wrong through no fault of the application.
        const visible = await homePage.getVisibleArticles();
        expect(visible.length).toBeGreaterThan(expectedTitles.length);
        expect(
          visible.some((article) => !article.tags.includes(tag)),
          'The unfiltered feed should include articles that do not carry the tag'
        ).toBe(true);
      });
    }
  );

  test(
    'a filter matches an article by its own tag and no other',
    { tag: '@positive' },
    async ({ api, articles }) => {
      const ownTag = buildTag();
      const otherTag = buildTag();

      const mine = await articles.seed(buildArticle({ tagList: [ownTag] }));
      const theirs = await articles.seed(buildArticle({ tagList: [otherTag] }));

      await test.step('filtering by the tag returns exactly that article', async () => {
        const matched = await api.listArticles({ tag: ownTag, limit: 20 });
        expect(matched.articles.map((article) => article.slug)).toEqual([mine.slug]);
      });

      await test.step('the other article is reachable only under its own tag', async () => {
        const matched = await api.listArticles({ tag: otherTag, limit: 20 });
        expect(matched.articles.map((article) => article.slug)).toEqual([theirs.slug]);
      });
    }
  );

  test(
    'a tag nobody has used returns an empty feed rather than every article',
    { tag: '@negative' },
    async ({ api, homePage }) => {
      const unusedTag = buildTag();

      await test.step('the API reports no articles for the unused tag', async () => {
        const result = await api.listArticles({ tag: unusedTag, limit: 20 });
        expect(result.articlesCount).toBe(0);
        expect(result.articles).toHaveLength(0);
      });

      await test.step('the tag is absent from the sidebar', async () => {
        await homePage.goto();
        await homePage.waitForTagsToLoad();
        await expect(homePage.tagLink(unusedTag)).toHaveCount(0);
      });
    }
  );

  test(
    'filtering never returns an article that lacks the tag',
    { tag: '@negative' },
    async ({ api }) => {
      const { tag } = await pickBusiestTag(api);
      const filtered = await api.listArticles({ tag, limit: 50 });

      expect(filtered.articles.length).toBeGreaterThan(0);
      for (const article of filtered.articles) {
        expect(
          article.tagList,
          `Article "${article.slug}" was returned for tag "${tag}" but does not carry it`
        ).toContain(tag);
      }
    }
  );
});
