# Website Automation Tests

End-to-end browser tests for the website, built with [Playwright](https://playwright.dev) and TypeScript.

## Setup

```bash
npm install
npx playwright install chromium   # downloads the browser
cp .env.example .env              # then set BASE_URL to your site
```

## Running tests

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
- `tests/login.spec.ts` and `pages/LoginPage.ts` show the Page Object pattern. The login tests are skipped until `TEST_USER_EMAIL` is set. Adjust the locators to match your login form.
- `.github/workflows/playwright.yml` runs the suite on every push and pull request, plus once a day. In the repo settings, set a `BASE_URL` Actions variable, and add `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` secrets if you use the login tests.

## Writing new tests

1. Put new specs in `tests/` as `*.spec.ts`.
2. Prefer user-facing locators such as `getByRole`, `getByLabel` and `getByText` over CSS selectors.
3. For pages you test often, add a Page Object in `pages/`.
4. Use `npm run codegen` to record the first draft of a test quickly.
