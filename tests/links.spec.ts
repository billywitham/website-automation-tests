import { test, expect } from '@playwright/test';

test('homepage has no broken internal links', async ({ page, request, baseURL }) => {
  await page.goto('/');

  const origin = new URL(baseURL!).origin;
  const hrefs = await page
    .locator('a[href]')
    .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));

  const internal = [
    ...new Set(
      hrefs
        .filter((href) => href.startsWith(origin))
        .map((href) => href.split('#')[0]),
    ),
  ];

  const broken: string[] = [];
  for (const url of internal) {
    const res = await request.get(url);
    if (res.status() >= 400) broken.push(`${res.status()} ${url}`);
  }

  expect(broken, 'broken internal links').toEqual([]);
});
