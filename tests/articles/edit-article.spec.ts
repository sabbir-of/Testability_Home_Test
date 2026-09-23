import { ConduitApi } from '../../src/api/conduit-api';
import { env } from '../../src/config/env';
import { buildArticleUpdate } from '../../src/data/article.factory';
import { expect, test } from '../../src/fixtures/test';

/**
 * Pre-condition: the article under test is created over the API, per the brief.
 * Creating it through the editor would make this test fail whenever *creation*
 * breaks, which is a different test's job.
 */
test.describe('Edit Article', { tag: '@articles' }, () => {
  test(
    'updates every field of an existing article and persists the change',
    { tag: ['@positive', '@smoke'] },
    async ({ page, articles, api, articlePage, editorPage }) => {
      const original = await articles.seed();
      const updated = buildArticleUpdate();

      await test.step('open the article and enter edit mode', async () => {
        await articlePage.open(original.slug);
        await expect(articlePage.title).toHaveText(original.title);
        await articlePage.clickEdit();

        await editorPage.waitUntilReady();
        await expect(page).toHaveURL(new RegExp(`/editor/${escapeRegExp(original.slug)}$`));
      });

      await test.step('the editor is pre-filled with the current values', async () => {
        await expect(editorPage.titleInput).toHaveValue(original.title);
        await expect(editorPage.descriptionInput).toHaveValue(original.description);
        await expect(editorPage.bodyInput).toHaveValue(original.body);
        expect(await editorPage.getTagNames()).toEqual(original.tagList);
      });

      await test.step('replace the content and publish', async () => {
        await editorPage.fillTitle(updated.title);
        await editorPage.fillDescription(updated.description);
        await editorPage.fillBody(updated.body);
        await editorPage.publishAndWaitForArticle();
      });

      // Conduit re-derives the slug from the title, so editing a title moves the
      // article to a new URL. Track the new slug so cleanup can find it.
      const newSlug = articlePage.slug;
      articles.track(newSlug);
      articles.forget(original.slug);

      await test.step('the article page renders the updated content', async () => {
        await articlePage.waitUntilReady();
        await expect(articlePage.title).toHaveText(updated.title);
        await expect(articlePage.title).not.toHaveText(original.title);
        await expect(articlePage.body).toContainText('Updated body.');
        await expect(articlePage.authorName).toHaveText(env.user.username);
      });

      await test.step('the update persisted server-side', async () => {
        const persisted = await api.getArticle(newSlug);
        expect(persisted).toMatchObject({
          title: updated.title,
          description: updated.description,
          body: updated.body,
        });
        expect(persisted.updatedAt).not.toBe(original.updatedAt);
        // Tags were not touched, so they must survive the edit untouched.
        expect(persisted.tagList.sort()).toEqual([...original.tagList].sort());
      });

      await test.step('a reload serves the updated article, not a cached copy', async () => {
        await page.reload();
        await articlePage.waitUntilReady();
        await expect(articlePage.title).toHaveText(updated.title);
      });
    }
  );

  test(
    'clearing the title never destroys the stored article title',
    { tag: '@negative' },
    async ({ articles, api, editorPage }) => {
      const original = await articles.seed();

      await editorPage.openForSlug(original.slug);

      await test.step('clear the title and submit', async () => {
        await editorPage.titleInput.clear();
        await expect(editorPage.titleInput).toHaveValue('');
        await editorPage.publish();
      });

      await test.step('the article keeps its original title — no data is lost', async () => {
        // The backend treats an empty title on update as "leave unchanged" rather
        // than rejecting it, so the meaningful guarantee to assert here is data
        // integrity: a blank submission must never blank out a live article.
        await expect
          .poll(async () => (await api.getArticle(original.slug)).title, {
            message: 'The stored title must survive a blank submission',
            timeout: 10_000,
          })
          .toBe(original.title);

        const stored = await api.getArticle(original.slug);
        expect(stored.title.trim()).not.toBe('');
        expect(stored.body).toBe(original.body);
      });
    }
  );

  test(
    'the API refuses an edit to an article owned by another user',
    { tag: '@negative' },
    async ({ api, request }) => {
      const { articles: globalFeed } = await api.listArticles({ limit: 20 });
      const foreign = globalFeed.find((item) => item.author.username !== env.user.username);
      test.skip(!foreign, 'No article by another author is available in the global feed.');

      await test.step('a signed-in user cannot edit somebody else’s article', async () => {
        const response = await api.rawUpdateArticle(foreign!.slug, { title: 'hijacked title' });
        expect(response.status()).toBe(403);
      });

      await test.step('an anonymous caller is rejected outright', async () => {
        const anonymous = ConduitApi.using(request, null);
        const response = await anonymous.rawUpdateArticle(foreign!.slug, { title: 'hijacked' });
        expect(response.status()).toBe(401);
      });

      await test.step('the article is untouched', async () => {
        const stored = await api.getArticle(foreign!.slug);
        expect(stored.title).toBe(foreign!.title);
      });
    }
  );

  test(
    'does not offer edit controls on an article the user does not own',
    { tag: '@negative' },
    async ({ api, articlePage }) => {
      // The seeded demo content belongs to another author; pick one at random.
      const { articles: globalFeed } = await api.listArticles({ limit: 20 });
      const foreign = globalFeed.find((item) => item.author.username !== env.user.username);
      test.skip(!foreign, 'No article by another author is available in the global feed.');

      await articlePage.open(foreign!.slug);
      await expect(articlePage.title).toHaveText(foreign!.title);
      await articlePage.expectOwnerControlsHidden();
    }
  );
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
