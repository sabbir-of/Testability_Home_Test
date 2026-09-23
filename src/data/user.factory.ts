import { faker } from '@faker-js/faker';
import type { RegistrationPayload } from '../api/types';
import { TEST_DATA_PREFIX } from './article.factory';

/**
 * Builds registration data for a throwaway account.
 *
 * The settings suite deliberately does NOT reuse the shared account: those tests
 * rename the user and rewrite the bio, which would race against any other test
 * that asserts on the navbar username. Each settings test gets its own user.
 */
export function buildUser(overrides: Partial<RegistrationPayload> = {}): RegistrationPayload {
  const handle = `${TEST_DATA_PREFIX.toLowerCase()}_${Date.now().toString(36)}_${faker.string.alphanumeric(
    { length: 6, casing: 'lower' }
  )}`;

  return {
    username: handle,
    // mailinator.com is a throwaway inbox domain — no real mailbox is involved.
    email: `${handle}@mailinator.com`,
    password: `Pw!${faker.string.alphanumeric({ length: 10 })}`,
    ...overrides,
  };
}

/** Profile values used to verify that a settings update persisted. */
export function buildProfileUpdate(): { username: string; bio: string; image: string } {
  return {
    username: buildUser().username,
    bio: `${faker.person.jobTitle()} — ${faker.lorem.sentence()}`,
    image: faker.image.avatarGitHub(),
  };
}
