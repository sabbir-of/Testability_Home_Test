import { Browser, Page, test as base } from '@playwright/test';
import { ConduitApi } from '../api/conduit-api';
import type { ArticlePayload, ConduitArticle, ConduitUser } from '../api/types';
import { env } from '../config/env';
import { buildArticle } from '../data/article.factory';
import { buildUser } from '../data/user.factory';
import { ArticlePage } from '../pages/article.page';
import { NavBar } from '../pages/components/navbar.component';
import { EditorPage } from '../pages/editor.page';
import { HomePage } from '../pages/home.page';
import { LoginPage } from '../pages/login.page';
import { ProfilePage } from '../pages/profile.page';
import { SettingsPage } from '../pages/settings.page';
import { storageStateForToken } from '../utils/session';

/**
 * Creates articles through the API and removes them when the test ends.
 *
 * Tests that need an existing article as a pre-condition (edit, delete, tag
 * filtering) go through here rather than clicking through the editor: the
 * pre-condition is not what is under test, and driving it over HTTP is both
 * faster and immune to unrelated UI breakage.
 */
export class ArticleSeeder {
  private readonly created = new Set<string>();

  constructor(private readonly api: ConduitApi) {}

  /** Creates an article and schedules it for cleanup. */
  async seed(overrides: Partial<ArticlePayload> = {}): Promise<ConduitArticle> {
    const article = await this.api.createArticle(buildArticle(overrides));
    this.created.add(article.slug);
    return article;
  }

  /** Tracks an article the test created through the UI, so cleanup covers it too. */
  track(slug: string): void {
    this.created.add(slug);
  }

  /** A test that intentionally deletes an article calls this to skip cleanup. */
  forget(slug: string): void {
    this.created.delete(slug);
  }

  /** Best-effort teardown: one article failing to delete must not fail the test. */
  async cleanup(): Promise<void> {
    await Promise.all(
      [...this.created].map(async (slug) => {
        try {
          await this.api.deleteArticleIfExists(slug);
        } catch (error) {
          console.warn(`[cleanup] could not delete article "${slug}": ${String(error)}`);
        }
      })
    );
    this.created.clear();
  }
}

/** A freshly registered account plus a browser page already signed in as them. */
export interface IsolatedUser {
  user: ConduitUser;
  page: Page;
  api: ConduitApi;
}

interface WorkerFixtures {
  /** API token for the shared account, fetched once per worker rather than per test. */
  sharedAuthToken: string;
}

interface TestFixtures {
  api: ConduitApi;
  articles: ArticleSeeder;
  navBar: NavBar;
  loginPage: LoginPage;
  homePage: HomePage;
  editorPage: EditorPage;
  articlePage: ArticlePage;
  settingsPage: SettingsPage;
  profilePage: ProfilePage;
  /** Registers a throwaway user and yields a page already authenticated as them. */
  isolatedUser: IsolatedUser;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  sharedAuthToken: [
    async ({}, use) => {
      const api = await ConduitApi.create();
      try {
        const user = await api.login(env.user.email, env.user.password);
        await use(user.token);
      } finally {
        await api.dispose();
      }
    },
    { scope: 'worker' },
  ],

  api: async ({ request, sharedAuthToken }, use) => {
    await use(ConduitApi.using(request, sharedAuthToken));
  },

  articles: async ({ api }, use) => {
    const seeder = new ArticleSeeder(api);
    await use(seeder);
    await seeder.cleanup();
  },

  navBar: async ({ page }, use) => use(new NavBar(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  homePage: async ({ page }, use) => use(new HomePage(page)),
  editorPage: async ({ page }, use) => use(new EditorPage(page)),
  articlePage: async ({ page }, use) => use(new ArticlePage(page)),
  settingsPage: async ({ page }, use) => use(new SettingsPage(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),

  isolatedUser: async ({ browser }, use) => {
    const api = await ConduitApi.create();
    const user = await api.register(buildUser());
    const context = await newAuthenticatedContext(browser, user.token);
    const page = await context.newPage();

    try {
      await use({ user, page, api });
    } finally {
      await context.close();
      await api.dispose();
    }
  },
});

/** A context that boots already signed in, with no login round trip. */
async function newAuthenticatedContext(browser: Browser, token: string) {
  return browser.newContext({
    baseURL: env.baseURL,
    storageState: storageStateForToken(token),
  });
}

export { expect } from '@playwright/test';
