import { type Page, expect } from '@playwright/test';

export type PropertyPortal = 'solano' | 'snohomish' | 'sutter';

export function getPropertyPortal(baseURL: string): PropertyPortal {
  const hostname = new URL(baseURL).hostname.toLowerCase();
  if (hostname.includes('solano')) return 'solano';
  if (hostname.includes('snohomish')) return 'snohomish';
  return 'sutter';
}

export class PropertySearchPage {
  constructor(
    private readonly page: Page,
    private readonly portal: PropertyPortal,
  ) {}

  async openFromHome() {
    await this.page.goto('/Home.aspx');
    if (this.portal === 'snohomish') {
      await this.page
        .getByRole('link', { name: /Assessor Property Information/ })
        .click();
      await expect(this.page).toHaveURL(
        /\/PropertyInformation\/PropertySearch\.aspx$/,
      );
      return;
    }

    await this.page.getByRole('link', { name: /Assessor Services/ }).click();
    await expect(this.page).toHaveURL(/\/Assessor\.aspx$/);

    const searchLink =
      this.portal === 'solano'
        ? /Real Estate Search with Mapping/
        : /START YOUR SEARCH/;
    await this.page.getByRole('link', { name: searchLink }).click();
    await expect(this.page).toHaveURL(/\/Assessor\/PropertySearch\.aspx$/);
  }

  async searchByParcel(parcelNumber: string) {
    if (this.portal !== 'sutter') {
      const searchBox = this.page.getByRole('textbox', { name: 'Search...' });
      await expect(searchBox).toBeVisible({ timeout: 15_000 });
      await searchBox.fill(parcelNumber);

      if (this.portal === 'solano') {
        await searchBox.press('Enter');
        const viewAccount = this.page
          .getByRole('button', { name: `Search ${parcelNumber}` })
          .filter({ hasText: 'View Account' });
        await expect(viewAccount).toBeVisible({ timeout: 15_000 });
        await viewAccount.click();
      } else {
        await this.submitSnohomishSearch();
        await expect(this.page).toHaveURL(
          (url) => url.searchParams.get('s') === parcelNumber,
          { timeout: 15_000 },
        );
        const propertyResult = this.page.locator(
          `a[aria-label="View Property ID ${parcelNumber}"]`,
        );
        await expect(propertyResult).toBeVisible({ timeout: 20_000 });
        await propertyResult.click();
      }
      return;
    }

    const parcelInput = this.page.getByRole('textbox', {
      name: 'PIN/Assessor Parcel Number',
    });
    await parcelInput.fill(parcelNumber);
    await this.page.getByRole('button', { name: /^Search/ }).click();

    const result = this.page.getByRole('link', {
      name: `PIN/APN:${parcelNumber}`,
    });
    await expect(result).toBeVisible();
    await result.click();
  }

  async searchByAddress(address: string) {
    if (this.portal !== 'sutter') {
      const searchBox = this.page.getByRole('textbox', { name: 'Search...' });
      await expect(searchBox).toBeVisible({ timeout: 15_000 });
      if (this.portal === 'snohomish') {
        await searchBox.pressSequentially(address);
      } else {
        await searchBox.fill(address);
      }
      if (this.portal === 'snohomish') {
        await this.submitSnohomishSearch();
        await expect(this.page).toHaveURL(
          (url) => url.searchParams.get('s') === address,
          { timeout: 15_000 },
        );
      } else {
        await searchBox.press('Enter');
      }
    } else {
      await this.page
        .getByRole('treeitem', { name: /Search by Property Address/ })
        .click();
      await this.page
        .getByRole('textbox', { name: 'Property Address' })
        .fill(address);
      await this.page.getByRole('button', { name: /^Search/ }).click();
    }

    const propertyResults =
      this.portal === 'snohomish'
        ? this.page.locator(
            'a[href*="/PropertyInformation/PropertySearch/"]',
          )
        : this.page.locator(
            'a[href*="/Assessor/PropertySearch/Detail.aspx"]',
          );
    await expect(propertyResults.first()).toBeVisible({ timeout: 20_000 });
  }

  private async submitSnohomishSearch() {
    await this.page
      .getByRole('tabpanel', { name: 'Search' })
      .locator('button[title="Search"]')
      .click();
  }
}
