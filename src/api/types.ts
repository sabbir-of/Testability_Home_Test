/** Shapes returned by the Conduit REST API (https://conduit-api.bondaracademy.com/api). */

export interface ConduitUser {
  id: number;
  email: string;
  username: string;
  bio: string | null;
  image: string | null;
  token: string;
}

export interface ConduitProfile {
  username: string;
  bio: string | null;
  image: string | null;
  following: boolean;
}

export interface ConduitArticle {
  slug: string;
  title: string;
  description: string;
  body: string;
  tagList: string[];
  createdAt: string;
  updatedAt: string;
  favorited: boolean;
  favoritesCount: number;
  author: ConduitProfile;
}

export interface ArticleListResponse {
  articles: ConduitArticle[];
  articlesCount: number;
}

/** Payload accepted by POST/PUT /articles. */
export interface ArticlePayload {
  title: string;
  description: string;
  body: string;
  tagList: string[];
}

/** Payload accepted by PUT /user. Every field is optional — only what is sent changes. */
export interface UserUpdatePayload {
  email?: string;
  username?: string;
  bio?: string;
  image?: string;
  password?: string;
}

export interface RegistrationPayload {
  username: string;
  email: string;
  password: string;
}

/** Conduit reports validation problems as `{ errors: { field: [messages] } }`. */
export interface ConduitErrorResponse {
  errors: Record<string, string[]>;
}
