import { test, expect } from '@playwright/test';
import { PropertySearchPage } from '../pages/PropertySearchPage';

const parcelNumber = process.env.TEST_PARCEL_NUMBER?.trim();

test.describe('Property records', () => {
  test('home page links to tax and assessor searches @smoke', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/Home.aspx');

    await page.getByRole('link', { name: /Treasurer-Tax Collector/ }).click();
    await expect(page).toHaveURL(/\/TaxCollector\.aspx$/);
    await page
      .getByRole('link', { name: /Tax Search: Assessor Parcel No\./ })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'PIN/Assessor Parcel Number' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto('/Home.aspx');
    await page.getByRole('link', { name: /Assessor Services/ }).click();
    await expect(page).toHaveURL(/\/Assessor\.aspx$/);
    await page.getByRole('link', { name: 'START YOUR SEARCH' }).click();
    await expect(
      page.getByRole('textbox', { name: 'PIN/Assessor Parcel Number' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('searches a parcel and opens assessment and tax information', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    test.skip(
      !parcelNumber,
      'Set TEST_PARCEL_NUMBER to enable the account lookup test',
    );

    const propertySearch = new PropertySearchPage(page);
    await propertySearch.openFromHome();
    await propertySearch.searchByParcel(parcelNumber!);

    await expect(page).toHaveURL(/\/Assessor\/PropertySearch\/Detail\.aspx/);
    await expect(
      page.getByRole('heading', { name: 'Property Information' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Value History' })).toBeVisible();
    await expect(page.getByText('Tax Year', { exact: true })).toBeVisible();
    await expect(page.getByText('Assessment ID', { exact: true })).toBeVisible();
    await expect(page.getByText(parcelNumber!, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Tax Info' }).click();
    await expect(page).toHaveURL(
      /\/TaxCollector\/TaxSearch\/Account\.aspx/,
      { timeout: 20_000 },
    );
    await expect(
      page.getByRole('heading', { name: 'Account Information' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tax Bills' })).toBeVisible();
  });
});
