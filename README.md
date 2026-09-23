# Conduit E2E Automation Framework

End-to-end test automation for [conduit.bondaracademy.com](https://conduit.bondaracademy.com),
built with **Playwright** and **TypeScript**.

Every scenario is covered by a positive test and at least one negative test, and every
assertion in this suite was written against behaviour observed on the live application —
not against assumptions about how a RealWorld clone ought to behave. Where the two
disagreed, the finding is written down in [Findings](#findings-from-building-this-suite).

---

## Contents

- [Quick start](#quick-start)
- [What is covered](#what-is-covered)
- [How it is put together](#how-it-is-put-together)
- [Design decisions](#design-decisions)
- [Running tests](#running-tests)
- [Reports and traceability](#reports-and-traceability)
- [CI/CD](#cicd)
- [Findings from building this suite](#findings-from-building-this-suite)
- [Use of AI tooling](#use-of-ai-tooling)

---

## Quick start

```bash
npm ci                          # install dependencies
npx playwright install          # download browsers
cp .env.example .env            # add your Conduit credentials
npm test                        # run everything, on all three browsers
npm run report                  # open the HTML report
```

`.env` holds the account the suite signs in as. Create one at
[/register](https://conduit.bondaracademy.com/register) if you need to:

```dotenv
BASE_URL=https://conduit.bondaracademy.com
API_URL=https://conduit-api.bondaracademy.com/api
CONDUIT_EMAIL=your.account@example.com
CONDUIT_PASSWORD=your-password
CONDUIT_USERNAME=your_username
```

`.env` is git-ignored. In CI the same values come from repository secrets.

---

## What is covered

All five required scenarios, each with a positive test and one or more negative tests.

| # | Scenario | Positive | Negative |
|---|----------|----------|----------|
| 1 | **Create Article** | Publishes through the editor; verifies the article page, the author, the tags, server-side persistence and feed membership | Empty title is rejected with a validation message and nothing is published · a signed-out visitor cannot reach the editor |
| 2 | **Edit Article** *(article seeded via API)* | Updates title, description and body; verifies the pre-filled form, the new slug, the rendered page, persistence and survival of a reload | A cleared title never destroys the stored title · the API refuses edits to another user's article (403) and anonymous edits (401) · owner-only controls are hidden on someone else's article |
| 3 | **Delete Article** *(article seeded via API)* | Deletes from the article page; verifies the redirect home, removal from the backend and the feed, and that the URL no longer resolves | Deleting an already-deleted or unknown slug returns 404 · an unauthenticated caller cannot delete |
| 4 | **Filter Articles by Tag** | Selects a tag in the sidebar; verifies the feed switches, holds exactly the articles the API reports, that every card displays the tag, and that clearing the filter restores the full feed | An unused tag returns an empty feed rather than everything · filtering never returns an article lacking the tag |
| 5 | **Update User Settings** | Changes username, bio and avatar; verifies the profile redirect, the rendered profile, persistence, untouched fields and survival of a reload · a single-field update leaves the others alone | A taken username is not applied and the stored value is untouched · logging out ends the session and locks the page · two pinned defects (below) |

**20 tests per browser** — 3 create, 4 edit, 3 delete, 4 filter, 6 settings — run across
Chromium, Firefox and WebKit, plus the shared authentication setup. The full suite is
**61 tests** and passes green on all three browsers in roughly two minutes.

Tests carry tags so slices can be run on their own: `@smoke`, `@positive`, `@negative`,
`@articles`, `@user`, `@known-defect`.

---

## How it is put together

```
├── src/
│   ├── api/
│   │   ├── conduit-api.ts       # typed REST client — pre-conditions, verification, cleanup
│   │   └── types.ts             # API response and payload shapes
│   ├── config/
│   │   └── env.ts               # environment loading, fails fast when misconfigured
│   ├── data/
│   │   ├── article.factory.ts   # randomised article data (faker)
│   │   └── user.factory.ts      # throwaway accounts and profile updates
│   ├── fixtures/
│   │   ├── auth.setup.ts        # signs in once, persists the session
│   │   └── test.ts              # page objects, API client, article seeder, isolated users
│   ├── pages/
│   │   ├── base.page.ts         # shared readiness and error-message handling
│   │   ├── components/
│   │   │   └── navbar.component.ts
│   │   ├── article.page.ts   editor.page.ts   home.page.ts
│   │   ├── login.page.ts     profile.page.ts  settings.page.ts
│   └── utils/
│       ├── retry.ts             # retries transient 5xx from the shared demo backend
│       └── session.ts           # builds a browser session from an API token
├── tests/
│   ├── articles/                # create · edit · delete · filter-by-tag
│   └── user/                    # update-settings
├── .github/workflows/playwright.yml
└── playwright.config.ts
```

Four layers, each with one job: **tests** describe behaviour, **page objects** know the
DOM, the **API client** knows the backend, and **factories** produce data. A selector
change touches exactly one file.

---

## Design decisions

### Session reuse

`auth.setup.ts` runs once as a project dependency: it signs in through the real login
form, asserts the session is genuinely established, and writes `storageState` to disk.
Every browser project then starts each test already authenticated.

The whole suite pays for **one** login instead of one per test. The login form itself is
still exercised — in the setup step, which is the one place it is worth testing.

Conduit keeps its JWT in `localStorage` and sets no cookies, so a session is fully
described by that single value. `utils/session.ts` uses this to build a signed-in browser
context straight from an API token, with no login round trip at all.

### Test isolation

Tests run **fully in parallel** and must not interfere with each other:

- **Articles** get randomised titles. Conduit derives the slug from the title, and slugs
  must be unique, so hard-coded titles would collide the moment the suite ran twice or ran
  in parallel. The `articles` fixture tracks everything it creates and deletes it
  afterwards, whatever the outcome.
- **Settings tests never touch the shared account.** They rename the user and rewrite the
  bio; doing that to the shared account would break any test asserting on the navbar
  username or an article author, depending on execution order. The `isolatedUser` fixture
  registers a throwaway account per test and hands back a browser page already signed in
  as them.

### API for pre-conditions, UI for the behaviour under test

The brief asks for the Edit and Delete articles to be created via API, and the same
reasoning is applied throughout. Setup runs over HTTP because it is faster and because a
break in *creation* should fail the creation test — not the deletion test. Every UI
assertion is then backed by an API check, so a test cannot pass on a screen that merely
*looks* right while nothing was saved.

### Resilient locators

Locators are role- and text-based (`getByRole`, accessible names) rather than tied to CSS
structure, so they survive re-styling. Where the real markup demands care, the page object
handles it and says why:

- The feed renders a `.article-preview` containing only "Loading articles…" while it
  loads, so article locators are qualified with `:has(a.preview-link)` — otherwise the
  spinner would be counted as an article.
- Conduit renders the author toolbar twice (banner and footer), so action locators are
  narrowed to avoid strict-mode violations.
- Waits are on meaningful conditions — a heading visible, a form populated, a spinner
  gone — never on fixed sleeps.

Feed assertions read every card's title and tags in a **single DOM snapshot**. The global
feed is shared public data that other traffic can reorder between two separate queries,
which would make a two-read assertion intermittently disagree with itself.

### Handling a flaky shared backend

Conduit is a public demo instance that intermittently returns 500 under concurrent writes.
`utils/retry.ts` retries **5xx only** when setting up pre-conditions. A 4xx — which is what
a real validation or permissions bug looks like — is never retried away. One retry is
configured locally and two in CI; a genuine regression fails every attempt.

---

## Running tests

```bash
npm test                  # all tests, all browsers
npm run test:chromium     # one browser
npm run test:firefox
npm run test:webkit

npm run test:smoke        # @smoke — the core happy paths
npm run test:positive     # @positive
npm run test:negative     # @negative

npm run test:headed       # watch it run
npm run test:debug        # step through with the inspector
npm run test:ui           # Playwright UI mode
npm run typecheck         # TypeScript, no emit
```

Run a single file or a single test:

```bash
npx playwright test tests/articles/create-article.spec.ts
npx playwright test -g "publishes a new article"
```

---

## Reports and traceability

Five reporters are configured:

| Reporter | Output | Purpose |
|----------|--------|---------|
| `list` | console | live progress |
| `html` | `playwright-report/html` | browsable report with traces attached |
| `junit` | `playwright-report/junit` | CI test summaries |
| `json` | `playwright-report/json` | programmatic access |
| `allure-playwright` | `allure-results` | Allure reporting |

```bash
npm run report            # open the HTML report
npm run report:allure     # generate and open Allure (needs the Allure CLI)
```

On failure — and only on failure — Playwright keeps a **trace**, a **screenshot** and a
**video**. The trace is the useful one: it replays the run step by step with DOM
snapshots, network activity and console output.

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

Tests are written as named `test.step()` blocks, so the report reads as a sequence of
intentions rather than a wall of actions, and a failure points at the step that broke.

---

## CI/CD

`.github/workflows/playwright.yml` runs on every push and pull request to `main`, nightly
at 02:00 UTC, and on demand.

- A **matrix** runs Chromium, Firefox and WebKit as separate jobs, with `fail-fast: false`
  so one browser failing does not hide the others' results.
- Type-checking runs before the tests.
- Credentials come from repository secrets; the nightly run catches breakage in the hosted
  app even when nobody has pushed.
- HTML reports, Allure results, traces, screenshots and video are uploaded as artifacts
  and retained for 14 days.

Configure these under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `CONDUIT_EMAIL` | test account email |
| `CONDUIT_PASSWORD` | test account password |
| `CONDUIT_USERNAME` | test account username |

---

## Findings from building this suite

Building the suite surfaced genuine defects in the application. Rather than writing tests
that quietly work around them, each is **pinned by a test marked `test.fail()`** — the
suite asserts the bug is still there, and the moment it is fixed that test passes
unexpectedly and the run goes red, prompting the note to be removed. A pinned defect is a
tracked defect.

**1. The settings form never pre-populates.**
Opening `/settings` shows every field blank — username, email, bio and avatar — however the
session was established (login form or restored token) and no matter how long you wait.
The user cannot see their current settings, and editing one field looks as though it will
erase the rest. Pinned by *"known defect: the settings form does not pre-populate current
values"*.

**2. The header loses its navigation after a settings save.**
After a successful save the app redirects to the profile with its header collapsed to the
"conduit" brand alone — no Home, New Article, Settings or username, for signed-in and
signed-out states alike. It does not recover on its own; only a full page reload restores
it. The session is fine, the JWT is still in storage. Reproduced with a bio-only save as
well as a rename, so any successful update triggers it. The user is left stranded on the
profile page with no way to navigate. Pinned by *"known defect: the header loses its
navigation after a settings save"*.

Two further observations, documented in the tests rather than pinned, because they are
backend contract quirks rather than user-visible breakage:

**3. An empty title is rejected on create but silently ignored on update.**
`POST /articles` with a blank title returns `422 {"title":["can't be blank"]}`, and the
editor shows the message. `PUT /articles/:slug` with a blank title returns `200` and keeps
the previous title. The inconsistency means the UI reports a validation error in one flow
and none in the other. No data is lost, so the edit test asserts the guarantee that
actually holds: a blank submission must never blank out a live article.

**4. A duplicate username fails with a 500, not a 4xx.**
`PUT /user` with a taken username returns `500` carrying a raw Prisma unique-constraint
error, and the UI surfaces nothing at all — it simply stays on the settings page. A
conflict is a client error and should be a `409`/`422` with a message the app can display.
The test asserts the observable guarantee — the update is not applied and the stored
username is untouched — rather than the particular status code.

One characteristic worth knowing, which is deployment behaviour rather than a bug:
**anonymous callers see only the ten seeded demo articles**, while authenticated callers
see everything. API assertions therefore run authenticated, matching what the signed-in
browser session sees. `GET /tags` returns a fixed, curated "popular tags" list — a tag
invented by a new article is filterable but never joins the sidebar — so the tag-filter
UI journey uses a popular tag, and tag-discrimination logic is covered separately against
unique tags where an exact assertion is possible.

---

## Use of AI tooling

AI assistance was used for scaffolding and for drafting page objects and specs. It was not
trusted blind, and the difference mattered.

Every locator, flow and status code in this suite was **verified against the live
application** before being committed — DOM structure dumped per route, API responses
captured, redirect targets confirmed. That verification is what turned up all four
findings above, and it corrected several plausible-but-wrong assumptions that a RealWorld
clone invites, among them:

- that clearing a title in the editor would surface a validation error on update, as it
  does on create — it does not;
- that the settings form would arrive pre-filled, as every screenshot of Conduit shows —
  on this deployment it does not;
- that a brand-new tag would appear in the popular-tags sidebar — it does not;
- that `?tag=` returns the same results with and without authentication — it does not.

Each of those would have produced a confidently written test that failed for the wrong
reason, or worse, passed vacuously. The framework is the product of the checking, not of
the generation.
