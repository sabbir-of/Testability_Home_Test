# Conduit E2E Automation Framework

End-to-end test automation for [conduit.bondaracademy.com](https://conduit.bondaracademy.com),
built with **Playwright** and **TypeScript**.

> Submitted for the Testability Technology Inc. QA automation assignment.
> **Author:** Azman Sabbir

Every required scenario is covered by a positive test and at least one negative test.
Every assertion was written against behaviour I observed on the live application — not
against assumptions about how a RealWorld clone ought to behave.

**Status:** 60 tests across Chromium, Firefox and WebKit — green, no flakes, ~2 minutes.

📊 **[Live test report](https://sabbir-of.github.io/conduit-playwright-framework/)** — published
to GitHub Pages by CI on every run, covering all three browsers in one view.

---

## Contents

- [The assignment](#the-assignment)
- [My approach](#my-approach)
- [What is covered](#what-is-covered)
- [Framework architecture](#framework-architecture)
- [Design decisions](#design-decisions)
- [Running the tests](#running-the-tests)
- [Reports and traceability](#reports-and-traceability)
- [CI/CD](#cicd)
- [Tech stack](#tech-stack)

---

## The assignment

Build a robust Playwright framework in TypeScript covering five scenarios on Conduit —
Create Article, Edit Article, Delete Article, Filter Articles by Tag and Update User
Settings — with the articles for Edit and Delete created via API as a pre-condition.

The brief also asked for QA-driven assertions, session reuse, resilient tests, and a set
of bonus items: dynamic test data, readable reports, negative cases, considered use of AI
tooling, cross-browser support, parallel execution, trace capture and CI/CD.

All of it is implemented. The bonus items are not bolted on — session reuse, parallelism
and data isolation are load-bearing parts of the design, and each is explained below.

---

## My approach

The decision that shaped everything else: **I verified the application before writing a
single assertion.**

Conduit is a RealWorld clone, and RealWorld clones are well documented, so it is tempting
to write tests from memory of how the reference implementation behaves. I did not. Before
building the page objects I wrote throwaway probe scripts that:

- dumped the live DOM of every route the suite touches, so locators describe real markup
  (that is how I found that the feed's loading spinner is itself an `.article-preview`,
  and that the author toolbar is rendered twice on an article page);
- walked each user journey end to end and recorded where it actually lands, so redirect
  assertions are facts rather than guesses (a settings save goes to `/profile/:username`,
  a delete goes to `/`, an edit that changes the title moves the article to a new slug);
- exercised the REST API directly for every happy and unhappy path, capturing real status
  codes and error bodies.

That verification pass caught several plausible-but-wrong assumptions before they became
tests that passed vacuously or failed for the wrong reason. It cost perhaps an hour, and it
is the difference between a suite that looks thorough and one that is.

The second decision: **assert on the server, not only the screen.** Every UI test that
changes data follows up with an API check. A test must not be able to pass because a page
looked right while nothing was actually saved.

The third: **leave the application as I found it.** Every test cleans up the data it
creates, whatever the outcome. After a full run the test account owns zero articles.

---

## What is covered

All five required scenarios, each with a positive test and one or more negative tests.

| # | Scenario | Positive | Negative |
|---|----------|----------|----------|
| 1 | **Create Article** | Publishes through the editor; verifies the article page, the author, the tags, server-side persistence and feed membership | Empty title is rejected with a validation message and nothing is published · a signed-out visitor cannot reach the editor |
| 2 | **Edit Article** *(article seeded via API)* | Updates title, description and body; verifies the pre-filled form, the new slug, the rendered page, persistence, untouched tags and survival of a reload | A cleared title never destroys the stored title · the API refuses edits to another user's article (403) and anonymous edits (401) · owner-only controls are hidden on someone else's article |
| 3 | **Delete Article** *(article seeded via API)* | Deletes from the article page; verifies the redirect home, removal from the backend and the feed, and that the URL no longer resolves | Deleting an already-deleted or unknown slug returns 404 · an unauthenticated caller cannot delete, and the article survives the attempt |
| 4 | **Filter Articles by Tag** | Selects a tag in the sidebar; verifies the feed switches to a tag view, holds exactly the articles the API reports, that every card displays the tag, and that clearing the filter restores the full feed · a filter matches an article by its own tag and no other | An unused tag returns an empty feed rather than everything · filtering never returns an article lacking the tag |
| 5 | **Update User Settings** | Changes username, bio and avatar; verifies the profile redirect, the rendered profile, persistence, untouched fields and survival of a reload · a single-field update leaves the others alone | A taken username is not applied and the stored value is untouched · logging out ends the session and locks the page · two `@known-defect` sentinels, marked `test.fail()`, covering the settings form not pre-populating and the header losing its navigation after a save |

**20 tests per browser** — 3 create, 4 edit, 3 delete, 4 filter, 6 settings — plus the
authentication setup. A local run of all three browsers is **61 tests** (60 plus one
shared setup); in CI it is **63**, because each browser runs in its own isolated job and
so performs its own login. Both are green in roughly two minutes.

Tests are tagged so slices can be run on their own: `@smoke`, `@positive`, `@negative`,
`@articles`, `@user`, `@known-defect`.

---

## Framework architecture

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
│   │   ├── article.page.ts      # a published article
│   │   ├── editor.page.ts       # create and edit modes
│   │   ├── home.page.ts         # feed, feed toggle, popular-tags sidebar
│   │   ├── login.page.ts
│   │   ├── profile.page.ts
│   │   └── settings.page.ts
│   └── utils/
│       ├── retry.ts             # retries transient 5xx from the shared demo backend
│       └── session.ts           # builds a browser session from an API token
├── tests/
│   ├── articles/                # create · edit · delete · filter-by-tag
│   └── user/                    # update-settings
├── .github/workflows/playwright.yml
└── playwright.config.ts
```

Four layers, each with exactly one job:

**Tests** describe behaviour and nothing else. They contain no selectors and no URLs. Each
is written as a sequence of named `test.step()` blocks, so the report reads as a set of
intentions rather than a wall of actions, and a failure points straight at the step that
broke.

**Page objects** own the DOM. Each exposes locators as getters and journeys as methods,
and each has a `waitUntilReady()` that resolves only when the page is genuinely usable.
They extend a `BasePage` that carries the shared readiness and validation-message
handling. A selector change touches exactly one file.

**The API client** (`ConduitApi`) owns the backend. It is a typed wrapper over Playwright's
`APIRequestContext` with a deliberate split: plain methods (`createArticle`) assert success
and return parsed data for use in setup, while `raw*` methods (`rawDeleteArticle`) return
the untouched response so negative tests can assert on status codes and error bodies.
Failures throw with the response body included, because a bare status code is painful to
debug from a CI log.

**Factories** produce data. No test contains a hard-coded title, tag or username.

Supporting these are the **fixtures**, which wire everything together and give each test
exactly what it asks for — page objects, an authenticated API client, an article seeder
that cleans up after itself, or an isolated throwaway user with its own browser session.

---

## Design decisions

### Session reuse

`auth.setup.ts` runs once as a project dependency. It signs in through the real login
form, asserts the session is genuinely established, and writes `storageState` to disk.
Every browser project then starts each test already authenticated.

The whole suite pays for **one** login instead of one per test. The login form itself is
still exercised — in the setup step, which is the one place it is worth testing. And
because the setup asserts before saving, a broken login fails loudly there instead of
producing 20 confusing downstream failures.

Conduit keeps its JWT in `localStorage` and sets no cookies, so a session is fully
described by that single value. `utils/session.ts` uses this to build a signed-in browser
context straight from an API token, with no login round trip at all — which is what makes
per-test isolated users cheap.

### Test isolation under full parallelism

Tests run fully in parallel, so they must not be able to interfere with each other.

- **Articles get randomised titles.** Conduit derives an article's slug from its title and
  slugs must be unique, so hard-coded titles would collide the moment the suite ran twice
  or ran in parallel. The `articles` fixture tracks everything it creates and removes it
  afterwards regardless of outcome; a test that deliberately deletes its article tells the
  seeder to forget it.
- **Settings tests never touch the shared account.** They rename the user and rewrite the
  bio — doing that to the shared account would break any test asserting on the navbar
  username or an article author, and it would break differently depending on execution
  order, which is the worst kind of flakiness. The `isolatedUser` fixture registers a
  throwaway account per test and hands back a browser page already signed in as them.

### API for pre-conditions, UI for the behaviour under test

The brief asks for the Edit and Delete articles to be created via API, and I applied the
same reasoning throughout. Setup runs over HTTP because it is faster and because a break
in *creation* should fail the creation test, not the deletion test. Every UI assertion is
then backed by an API check.

### Resilient locators

Locators are role- and text-based (`getByRole`, accessible names) rather than tied to CSS
structure, so they survive re-styling. Where the real markup demands care, the page object
handles it and documents why:

- The feed renders a `.article-preview` containing only "Loading articles…" while it
  loads, so article locators are qualified with `:has(a.preview-link)`. Without that, the
  spinner is counted as an article.
- Conduit renders the author toolbar twice — in the banner and below the body — so action
  locators are narrowed to avoid strict-mode violations.
- Waits are on meaningful conditions: a heading visible, a form populated, a spinner gone.
  There are no fixed sleeps anywhere in the page objects.

Feed assertions read every card's title and tags in a **single DOM snapshot**. The global
feed is shared public data that other traffic can reorder between two separate queries,
which would make a two-read assertion intermittently disagree with itself. I hit exactly
this while building the suite: an early version of the tag-filter test named a specific
article and expected it to reappear after clearing the filter, and it went flaky on
Firefox and WebKit. The fix was to assert the *property* that matters — the unfiltered
feed contains articles that do not carry the tag — rather than pinning a volatile title.

### Handling a flaky shared backend

Conduit is a public demo instance and intermittently returns 500 under concurrent writes.
`utils/retry.ts` retries **5xx only**, and only when setting up pre-conditions. A 4xx —
which is what a real validation or permissions bug looks like — is never retried away.
One retry is configured locally and two in CI, so a genuine regression fails every attempt
rather than being masked.

---

## Running the tests

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

`.env` is git-ignored and is never committed. In CI the same values come from repository
secrets. `src/config/env.ts` throws immediately if a required variable is missing, so a
misconfigured run fails with a clear message instead of a confusing timeout.

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
**video**. Keeping them only for failures means a green run stays small while a red one
carries everything needed to diagnose it. The trace is the valuable artefact: it replays
the run step by step with DOM snapshots, network activity and console output.

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

---

## CI/CD

`.github/workflows/playwright.yml` runs on every push and pull request to `main`, nightly
at 02:00 UTC, and on demand via `workflow_dispatch` with a browser picker. It has three
jobs: `test` (matrix), `report` (merge), `deploy-report` (publish).

- A **matrix** runs Chromium, Firefox and WebKit as separate jobs with `fail-fast: false`,
  so one browser failing does not hide the others' results.
- Type-checking runs before the tests, so a compile error fails in seconds rather than
  after a full browser run.
- Each job installs only the browser under test, plus Chromium for the shared
  authentication setup.
- Credentials come from repository secrets. The nightly run catches breakage in the hosted
  application even when nobody has pushed.
- `concurrency` cancels superseded runs on the same branch.

### Published report

The browser jobs emit **blob reports**, which the `report` job merges into a single HTML
report covering all three browsers — filterable by project in the UI — rather than three
disconnected ones. `deploy-report` then publishes it to **GitHub Pages**:

**https://sabbir-of.github.io/conduit-playwright-framework/**

The report is published even when tests fail, because the report of a red run is the one
worth reading. Publishing is restricted to `main` so a pull request can never overwrite it,
and the Pages write permission is scoped to that one job rather than the whole workflow.

Traces, screenshots and video are uploaded as artifacts on failure, and Allure results on
every run, all retained for 14 days.

Configure these under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `CONDUIT_EMAIL` | test account email |
| `CONDUIT_PASSWORD` | test account password |
| `CONDUIT_USERNAME` | test account username |

---

## Tech stack

| | |
|---|---|
| Test runner | Playwright Test |
| Language | TypeScript (strict, `noUnusedLocals`, `noImplicitReturns`) |
| Test data | `@faker-js/faker` |
| Config | `dotenv` |
| Reporting | HTML · JUnit · JSON · Allure |
| CI | GitHub Actions |
| Browsers | Chromium · Firefox · WebKit |
