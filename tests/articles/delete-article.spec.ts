import { ConduitApi } from '../../src/api/conduit-api';
import { env } from '../../src/config/env';
import { expect, test } from '../../src/fixtures/test';

/** Pre-condition: the article to delete is created over the API, per the brief. */
test.describe('Delete Article', { tag: '@articles' }, () => {
  test(
    'deletes an article, redirects home and removes it from the feed',
    { tag: ['@positive', '@smoke'] },
    async ({ page, articles, api, articlePage, homePage }) => {
      const article = await articles.seed();

      await test.step('the article exists before deleting it', async () => {
        expect(await api.findArticle(article.slug)).not.toBeNull();
        await articlePage.open(article.slug);
        await expect(articlePage.title).toHaveText(article.title);
        await articlePage.expectOwnerControlsVisible();
      });

      await test.step('delete it from the article page', async () => {
        await articlePage.deleteArticle();
        await expect(page).toHaveURL(`${env.baseURL}/`);
      });

      // The article is gone, so the seeder must not try to delete it again.
      articles.forget(article.slug);

      await test.step('the backend no longer has the article', async () => {
        expect(await api.findArticle(article.slug)).toBeNull();
      });

      await test.step('it is absent from the home feed', async () => {
        await homePage.waitForFeedToLoad();
        await expect(homePage.articleCards.filter({ hasText: article.title })).toHaveCount(0);

        const authored = await api.listArticles({ author: env.user.username, limit: 20 });
        expect(authored.articles.map((item) => item.slug)).not.toContain(article.slug);
      });

      await test.step('navigating straight to the deleted URL shows no article', async () => {
        await page.goto(`/article/${article.slug}`);
        await expect(articlePage.title).toHaveCount(0);
      });
    }
  );

  test(
    'deleting an already-deleted article is rejected by the API',
    { tag: '@negative' },
    async ({ articles, api }) => {
      const article = await articles.seed();

      await test.step('first delete succeeds', async () => {
        const first = await api.rawDeleteArticle(article.slug);
        expect(first.ok()).toBe(true);
        articles.forget(article.slug);
      });

      await test.step('deleting the same slug again returns 404', async () => {
        const second = await api.rawDeleteArticle(article.slug);
        expect(second.status()).toBe(404);
      });

      await test.step('an entirely unknown slug also returns 404', async () => {
        const unknown = await api.rawDeleteArticle('slug-that-was-never-created-000');
        expect(unknown.status()).toBe(404);
      });
    }
  );

  test(
    'an unauthenticated caller cannot delete an article',
    { tag: '@negative' },
    async ({ articles, api, request }) => {
      const article = await articles.seed();

      const anonymous = ConduitApi.using(request, null);

      const response = await anonymous.rawDeleteArticle(article.slug);
      expect(response.ok(), 'A signed-out request must not be able to delete').toBe(false);
      expect([401, 403]).toContain(response.status());

      // The article must still be there — proving the rejection was real.
      expect(await api.findArticle(article.slug)).not.toBeNull();
    }
  );
});
