import { test, expect } from '@playwright/test';

// Pages to smoke-test. Add your site's key routes here.
const pages = ['/'];

test.describe('Smoke tests @smoke', () => {
  for (const path of pages) {
    test(`${path} loads successfully`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      const response = await page.goto(path);

      expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400);
      await expect(page).toHaveTitle(/.+/);
      await expect(page.locator('body')).toBeVisible();
      expect(errors, 'uncaught JavaScript errors').toEqual([]);
    });
  }
});
