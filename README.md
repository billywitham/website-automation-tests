# Website Automation Tests

End-to-end browser tests for the website, built with [Playwright](https://playwright.dev) and TypeScript.

## Setup

```bash
npm install
npx playwright install chromium   # downloads the browser
cp .env.example .env              # then set BASE_URL to your site
```

## Running tests

### Home test dashboard

Run `npm run dashboard`, then open **http://127.0.0.1:3100**.

Define a run with a name, target URL, test files, browser projects, worker count,
retries, and an optional test-name regular expression (such as `@smoke`). Save
definitions to reuse them, or execute directly. One run executes at a time.

The dashboard updates automatically with execution logs, pass/fail/skip counts,
total elapsed run time, individual attempt durations, and error details. Each run
keeps its own Playwright HTML report, screenshots, videos, and traces according
to the existing Playwright configuration. Retried tests appear as separate
attempts; history counts use the last attempt and respect expected failures.

History and definitions persist in `.dashboard/` (ignored by Git). Runs stopped
by a server restart are marked interrupted; their total duration is unavailable.
Keep the server running until tests finish. Existing `.env` test credentials are
inherited by the runner. Use `DASHBOARD_PORT` to change the port.

This dashboard listens on the local computer only and is intended for trusted
local use. Run `npm run dashboard:verify` to check execution, retry handling,
result persistence, and report generation using temporary browser-free tests.

| Command | What it does |
| --- | --- |
| `npm test` | Run every test headlessly on desktop and mobile Chrome |
| `npm run test:smoke` | Run only the tests tagged `@smoke` |
| `npm run test:headed` | Run with a visible browser window |
| `npm run test:ui` | Open Playwright's interactive UI mode |
| `npm run report` | Open the HTML report from the last run |
| `npm run codegen -- https://your-website.com` | Record clicks in a browser and generate test code |

You can also set the target inline: `BASE_URL=https://staging.your-website.com npm test`.

## What's included

- `tests/smoke.spec.ts` checks that each page in the list loads with a status below 400, has a title and throws no uncaught JavaScript errors. Add your key routes to the `pages` array.
- `tests/links.spec.ts` flags any internal link on the homepage that returns 4xx or 5xx.
- `tests/property-record.spec.ts` checks navigation to the tax and assessor search pages, then searches an assessor parcel and opens its assessment and tax information. Set `TEST_PARCEL_NUMBER` in `.env` to enable the account lookup; the value should be the complete parcel/APN without dashes. The lookup test is skipped when it is unset.
- `tests/login.spec.ts` and `pages/LoginPage.ts` show the Page Object pattern. The login tests are skipped until `TEST_USER_EMAIL` is set. Adjust the locators to match your login form.
- `.github/workflows/playwright.yml` runs the suite on every push and pull request, plus once a day. In the repo settings, set a `BASE_URL` Actions variable, and add `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` secrets if you use the login tests.

## Writing new tests

1. Put new specs in `tests/` as `*.spec.ts`.
2. Prefer user-facing locators such as `getByRole`, `getByLabel` and `getByText` over CSS selectors.
3. For pages you test often, add a Page Object in `pages/`.
4. Use `npm run codegen` to record the first draft of a test quickly.
