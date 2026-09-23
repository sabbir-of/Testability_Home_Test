import { faker } from '@faker-js/faker';
import type { ArticlePayload } from '../api/types';

/**
 * Builds randomised article data.
 *
 * Randomising matters here for a concrete reason: Conduit derives an article's
 * slug from its title, and slugs must be unique. Hard-coded titles collide the
 * moment the suite runs twice or runs in parallel. Every title therefore carries
 * a run-unique marker.
 */

/** Marks data as belonging to this framework, so leftovers are identifiable. */
export const TEST_DATA_PREFIX = 'PWQA';

function uniqueMarker(): string {
  return `${Date.now().toString(36)}-${faker.string.alphanumeric({ length: 5, casing: 'lower' })}`;
}

/**
 * Conduit builds the slug by replacing spaces with hyphens, so punctuation in a
 * title survives into the URL. Keeping generated titles to letters, digits and
 * spaces keeps slugs predictable and keeps the tests readable.
 */
function safeWords(count: number): string {
  return faker.lorem.words(count).replace(/[^a-zA-Z0-9 ]/g, '');
}

export function buildArticle(overrides: Partial<ArticlePayload> = {}): ArticlePayload {
  return {
    title: `${TEST_DATA_PREFIX} ${safeWords(4)} ${uniqueMarker()}`,
    description: faker.lorem.sentence(),
    body: faker.lorem.paragraphs(2),
    tagList: [buildTag(), buildTag()],
    ...overrides,
  };
}

/** A tag unique to this run, so tag-filter assertions are not polluted by other data. */
export function buildTag(): string {
  return `${TEST_DATA_PREFIX.toLowerCase()}-${faker.string.alphanumeric({ length: 8, casing: 'lower' })}`;
}

/** Article data whose edited fields are visibly different from the original. */
export function buildArticleUpdate(overrides: Partial<ArticlePayload> = {}): ArticlePayload {
  return buildArticle({
    title: `${TEST_DATA_PREFIX} EDITED ${safeWords(3)} ${uniqueMarker()}`,
    description: `Updated: ${faker.lorem.sentence()}`,
    body: `Updated body.\n\n${faker.lorem.paragraph()}`,
    ...overrides,
  });
}
