import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

// Example of a Page Object test. Skipped until TEST_USER_EMAIL is set and
// the locators in pages/LoginPage.ts match your site.
test.describe('Login', () => {
  test.skip(!process.env.TEST_USER_EMAIL, 'TEST_USER_EMAIL not set');

  test('user can log in with valid credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
    await expect(page).not.toHaveURL(/login/);
  });

  test('shows an error for invalid credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login('nobody@example.com', 'wrong-password');
    await login.expectError();
  });
});
