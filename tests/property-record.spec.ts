import { test, expect } from '@playwright/test';
import {
  getPropertyPortal,
  PropertySearchPage,
} from '../pages/PropertySearchPage';

function getConfiguredValues(...environmentVariables: string[]) {
  const configuredValue = environmentVariables
    .map((name) => process.env[name]?.trim())
    .find(Boolean);

  return configuredValue
    ?.split(/[,\r\n]+/)
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
}

const portal = getPropertyPortal(
  process.env.BASE_URL ?? 'https://pademo.publicaccessnow.com',
);
const portalSuffix = portal.toUpperCase();
const parcelNumbers = getConfiguredValues(
  `TEST_PARCEL_NUMBERS_${portalSuffix}`,
  `TEST_PARCEL_NUMBER_${portalSuffix}`,
  'TEST_PARCEL_NUMBERS',
  'TEST_PARCEL_NUMBER',
);
const addressSearches = getConfiguredValues(
  `TEST_PROPERTY_ADDRESS_SEARCHES_${portalSuffix}`,
  'TEST_PROPERTY_ADDRESS_SEARCHES',
);

test.describe('Property records', () => {
  test('home page links to tax and assessor searches @smoke', async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    const portal = getPropertyPortal(baseURL!);
    await page.goto('/Home.aspx');

    if (portal === 'snohomish') {
      await page
        .getByRole('link', { name: /Treasurer\s*-\s*Tax Bill Search/ })
        .click();
      await expect(page).toHaveURL(/\/Treasurer\/TaxSearch\.aspx$/);
      await page.goto('/Home.aspx');
      await page
        .getByRole('link', { name: /Assessor Property Information/ })
        .click();
      await expect(page).toHaveURL(
        /\/PropertyInformation\/PropertySearch\.aspx$/,
      );
    } else {
      await page
        .getByRole('link', { name: /Treasurer\s*-\s*Tax Collector/i })
        .click();
      await expect(page).toHaveURL(/\/TaxCollector\.aspx$/);
      const taxSearchLink =
        portal === 'solano'
          ? /Property Tax Search & Payment/
          : /Tax Search: Assessor Parcel No\./;
      await page.getByRole('link', { name: taxSearchLink }).click();
    }

    await expect(
      page.getByRole('textbox').first(),
    ).toBeVisible({ timeout: 15_000 });

    if (portal !== 'snohomish') {
      await page.goto('/Home.aspx');
      await page.getByRole('link', { name: /Assessor Services/ }).click();
      await expect(page).toHaveURL(/\/Assessor\.aspx$/);
      const propertySearchLink =
        portal === 'solano'
          ? /Real Estate Search with Mapping/
          : /START YOUR SEARCH/;
      await page.getByRole('link', { name: propertySearchLink }).click();
    }
    await expect(page.getByRole('textbox').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test.describe('parcel lookups', () => {
    if (parcelNumbers.length === 0) {
      test.skip(
        `parcel list is not configured for ${portal}`,
        async () => {},
      );
    }

    for (const parcelNumber of parcelNumbers) {
      test(`searches parcel ${parcelNumber} and opens assessment and tax information`, async ({
        page,
      }) => {
        test.setTimeout(60_000);
        const propertySearch = new PropertySearchPage(page, portal);
        await propertySearch.openFromHome();
        await propertySearch.searchByParcel(parcelNumber);

        const detailURL =
          portal === 'snohomish'
            ? /\/PropertyInformation\/PropertySearch\/PropertyAccountSummary\.aspx/
            : /\/Assessor\/PropertySearch\/Detail\.aspx/;
        await expect(page).toHaveURL(detailURL, { timeout: 20_000 });
        await expect(
          page.getByRole('heading', { name: /Property Information/ }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          page.getByRole('heading', { name: /Value History/ }),
        ).toBeVisible({ timeout: 15_000 });
        if (portal === 'snohomish') {
          await expect(page.getByText(/Assessment Yr/).first()).toBeVisible({
            timeout: 15_000,
          });
        } else {
          await expect(page.getByText(/Tax Year/)).toBeVisible({
            timeout: 15_000,
          });
          await expect(page.getByText(/Assessment ID/)).toBeVisible({
            timeout: 15_000,
          });
        }
        await expect(
          page.getByText(parcelNumber, { exact: true }).first(),
        ).toBeVisible();

        if (portal === 'snohomish') {
          await expect(
            page.getByRole('heading', { name: /Tax Balance/ }),
          ).toBeVisible({ timeout: 15_000 });
          await expect(page.getByText(/Total Payable:/)).toBeVisible();
        } else {
          await page.getByRole('button', { name: 'Tax Info' }).click();
          await expect(page).toHaveURL(
            /\/TaxCollector\/TaxSearch\/Account\.aspx/,
            { timeout: 20_000 },
          );
          await expect(
            page.getByRole('heading', { name: /Account Information/ }),
          ).toBeVisible();
          await expect(
            page.getByRole('heading', { name: /Tax Bills/ }),
          ).toBeVisible();
        }
      });
    }
  });

  test.describe('street address searches', () => {
    if (addressSearches.length === 0) {
      test.skip(
        `street address search list is not configured for ${portal}`,
        async () => {},
      );
    }

    for (const address of addressSearches) {
      test(`finds property records matching "${address}"`, async ({
        page,
      }) => {
        const propertySearch = new PropertySearchPage(page, portal);
        await propertySearch.openFromHome();
        await propertySearch.searchByAddress(address);
      });
    }
  });
});
