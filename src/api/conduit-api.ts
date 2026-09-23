import { APIRequestContext, APIResponse, request } from '@playwright/test';
import { env } from '../config/env';
import { retryOnServerError } from '../utils/retry';
import type {
  ArticleListResponse,
  ArticlePayload,
  ConduitArticle,
  ConduitUser,
  RegistrationPayload,
  UserUpdatePayload,
} from './types';

/**
 * Thin, typed client over the Conduit REST API.
 *
 * The suite uses it for three jobs:
 *  - creating pre-conditions quickly (an article to edit or delete)
 *  - verifying that what the UI displayed actually persisted server-side
 *  - tearing test data down, so the account does not accumulate junk
 *
 * Methods come in two flavours. The plain ones (`createArticle`) assert a
 * successful status and return parsed data — use them for setup. The `raw*`
 * ones return the untouched `APIResponse` so negative tests can assert on
 * status codes and error bodies.
 */
export class ConduitApi {
  private constructor(
    private readonly context: APIRequestContext,
    private token: string | null
  ) {}

  /** Creates a client bound to an existing request context (e.g. a fixture's). */
  static using(context: APIRequestContext, token: string | null = null): ConduitApi {
    return new ConduitApi(context, token);
  }

  /** Creates a standalone client with its own request context. Caller must `dispose()`. */
  static async create(token: string | null = null): Promise<ConduitApi> {
    const context = await request.newContext({ baseURL: env.apiURL });
    return new ConduitApi(context, token);
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  get authToken(): string | null {
    return this.token;
  }

  private get headers(): Record<string, string> {
    return this.token ? { Authorization: `Token ${this.token}` } : {};
  }

  /** Builds an absolute URL so the client works with any request context. */
  private url(pathname: string): string {
    return `${env.apiURL.replace(/\/$/, '')}${pathname}`;
  }

  /** Fails loudly with the response body included — a bare status code is hard to debug. */
  private static async expectOk(response: APIResponse, action: string): Promise<void> {
    if (response.ok()) return;
    throw new Error(
      `${action} failed: ${response.status()} ${response.statusText()}\n${await response.text()}`
    );
  }

  // ---------------------------------------------------------------- auth ----

  async rawLogin(email: string, password: string): Promise<APIResponse> {
    return this.context.post(this.url('/users/login'), { data: { user: { email, password } } });
  }

  /** Logs in and remembers the token for subsequent calls. */
  async login(email: string, password: string): Promise<ConduitUser> {
    const response = await this.rawLogin(email, password);
    await ConduitApi.expectOk(response, `Login as "${email}"`);
    const user = (await response.json()).user as ConduitUser;
    this.token = user.token;
    return user;
  }

  async rawRegister(payload: RegistrationPayload): Promise<APIResponse> {
    return this.context.post(this.url('/users'), { data: { user: payload } });
  }

  /** Registers a throwaway account and remembers its token. */
  async register(payload: RegistrationPayload): Promise<ConduitUser> {
    const response = await this.rawRegister(payload);
    await ConduitApi.expectOk(response, `Register "${payload.username}"`);
    const user = (await response.json()).user as ConduitUser;
    this.token = user.token;
    return user;
  }

  async getCurrentUser(): Promise<ConduitUser> {
    const response = await this.context.get(this.url('/user'), { headers: this.headers });
    await ConduitApi.expectOk(response, 'Fetch current user');
    return (await response.json()).user as ConduitUser;
  }

  async rawUpdateUser(payload: UserUpdatePayload): Promise<APIResponse> {
    return this.context.put(this.url('/user'), {
      headers: this.headers,
      data: { user: payload },
    });
  }

  async updateUser(payload: UserUpdatePayload): Promise<ConduitUser> {
    const response = await this.rawUpdateUser(payload);
    await ConduitApi.expectOk(response, 'Update user');
    return (await response.json()).user as ConduitUser;
  }

  // ------------------------------------------------------------ articles ----

  async rawCreateArticle(payload: Partial<ArticlePayload>): Promise<APIResponse> {
    return this.context.post(this.url('/articles'), {
      headers: this.headers,
      data: { article: payload },
    });
  }

  /**
   * Creates an article, retrying transient 5xx responses.
   *
   * This is a test *pre-condition* helper, so a flaky demo backend must not be
   * reported as a product failure. Validation errors (4xx) still surface at once.
   */
  async createArticle(payload: ArticlePayload): Promise<ConduitArticle> {
    const response = await retryOnServerError(() => this.rawCreateArticle(payload), {
      label: `POST /articles "${payload.title}"`,
    });
    await ConduitApi.expectOk(response, `Create article "${payload.title}"`);
    return (await response.json()).article as ConduitArticle;
  }

  async rawGetArticle(slug: string): Promise<APIResponse> {
    return this.context.get(this.url(`/articles/${encodeURIComponent(slug)}`), {
      headers: this.headers,
    });
  }

  async getArticle(slug: string): Promise<ConduitArticle> {
    const response = await this.rawGetArticle(slug);
    await ConduitApi.expectOk(response, `Fetch article "${slug}"`);
    return (await response.json()).article as ConduitArticle;
  }

  /** Returns the article, or null when the server reports it does not exist. */
  async findArticle(slug: string): Promise<ConduitArticle | null> {
    const response = await this.rawGetArticle(slug);
    if (response.status() === 404) return null;
    await ConduitApi.expectOk(response, `Fetch article "${slug}"`);
    return (await response.json()).article as ConduitArticle;
  }

  async rawUpdateArticle(slug: string, payload: Partial<ArticlePayload>): Promise<APIResponse> {
    return this.context.put(this.url(`/articles/${encodeURIComponent(slug)}`), {
      headers: this.headers,
      data: { article: payload },
    });
  }

  async rawDeleteArticle(slug: string): Promise<APIResponse> {
    return this.context.delete(this.url(`/articles/${encodeURIComponent(slug)}`), {
      headers: this.headers,
    });
  }

  /** Deletes an article, tolerating a slug that is already gone — safe in cleanup. */
  async deleteArticleIfExists(slug: string): Promise<void> {
    const response = await this.rawDeleteArticle(slug);
    if (response.ok() || response.status() === 404) return;
    await ConduitApi.expectOk(response, `Delete article "${slug}"`);
  }

  async listArticles(
    params: { tag?: string; author?: string; limit?: number; offset?: number } = {}
  ): Promise<ArticleListResponse> {
    const query = new URLSearchParams();
    if (params.tag) query.set('tag', params.tag);
    if (params.author) query.set('author', params.author);
    query.set('limit', String(params.limit ?? 10));
    query.set('offset', String(params.offset ?? 0));

    const response = await this.context.get(this.url(`/articles?${query.toString()}`), {
      headers: this.headers,
    });
    await ConduitApi.expectOk(response, 'List articles');
    return (await response.json()) as ArticleListResponse;
  }

  /**
   * The curated "popular tags" list backing the home-page sidebar.
   *
   * Sent authenticated like every other read: an anonymous caller on this
   * deployment only ever sees the ten seeded demo articles, so anonymous reads
   * would not reflect what the signed-in browser session is looking at.
   */
  async getTags(): Promise<string[]> {
    const response = await this.context.get(this.url('/tags'), { headers: this.headers });
    await ConduitApi.expectOk(response, 'Fetch tags');
    return (await response.json()).tags as string[];
  }
}
