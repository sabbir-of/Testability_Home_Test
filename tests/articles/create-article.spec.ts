import { buildArticle } from '../../src/data/article.factory';
import { env } from '../../src/config/env';
import { expect, test } from '../../src/fixtures/test';

test.describe('Create Article', { tag: '@articles' }, () => {
  test(
    'publishes a new article and persists it to the backend',
    { tag: ['@positive', '@smoke'] },
    async ({ page, navBar, editorPage, articlePage, api, articles }) => {
      const article = buildArticle();

      await test.step('open the editor from the navigation bar', async () => {
        await page.goto('/');
        await navBar.expectSignedIn(env.user.username);
        await navBar.goToNewArticle();
        await editorPage.waitUntilReady();
        await expect(page).toHaveURL(/\/editor$/);
      });

      await test.step('fill in the article and publish it', async () => {
        await editorPage.fillForm(article);
        await expect(editorPage.titleInput).toHaveValue(article.title);
        expect(await editorPage.getTagNames()).toEqual(article.tagList);

        await editorPage.publishAndWaitForArticle();
      });

      const slug = articlePage.slug;
      articles.track(slug);

      await test.step('the article page shows exactly what was submitted', async () => {
        await articlePage.waitUntilReady();
        await expect(articlePage.title).toHaveText(article.title);
        await expect(articlePage.body).toContainText(article.body.split('\n')[0].slice(0, 60));
        await expect(articlePage.authorName).toHaveText(env.user.username);
        expect(await articlePage.getTagNames()).toEqual(article.tagList);
        await articlePage.expectOwnerControlsVisible();
      });

      await test.step('the data reached the server, not just the screen', async () => {
        const persisted = await api.getArticle(slug);
        expect(persisted).toMatchObject({
          title: article.title,
          description: article.description,
          body: article.body,
        });
        expect(persisted.tagList.sort()).toEqual([...article.tagList].sort());
        expect(persisted.author.username).toBe(env.user.username);
      });

      await test.step('the new article appears in the global feed', async () => {
        const feed = await api.listArticles({ author: env.user.username, limit: 10 });
        expect(feed.articles.map((item) => item.slug)).toContain(slug);
      });
    }
  );

  test(
    'rejects an article with no title and keeps the author on the editor',
    { tag: '@negative' },
    async ({ page, editorPage }) => {
      const article = buildArticle();

      await editorPage.open();

      await test.step('submit with the title left empty', async () => {
        await editorPage.fillDescription(article.description);
        await editorPage.fillBody(article.body);
        await expect(editorPage.titleInput).toHaveValue('');
        await editorPage.publish();
      });

      await test.step('a validation message explains the problem', async () => {
        await expect(editorPage.errorMessages).toHaveCount(1);
        await expect(editorPage.errorMessages.first()).toHaveText(/title can't be blank/i);
      });

      await test.step('nothing was published and the form keeps its input', async () => {
        await expect(page).toHaveURL(/\/editor$/);
        await expect(editorPage.descriptionInput).toHaveValue(article.description);
      });
    }
  );

  test(
    'a signed-out visitor cannot reach the editor',
    { tag: '@negative' },
    async ({ browser }) => {
      // A guest context — the project-level storage state is deliberately bypassed.
      const context = await browser.newContext({
        baseURL: env.baseURL,
        storageState: { cookies: [], origins: [] },
      });
      const guestPage = await context.newPage();

      try {
        await guestPage.goto('/editor');
        await expect(guestPage).toHaveURL(`${env.baseURL}/`);
        await expect(
          guestPage.locator('nav.navbar').getByRole('link', { name: 'Sign in' })
        ).toBeVisible();
      } finally {
        await context.close();
      }
    }
  );
});
