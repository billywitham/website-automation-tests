import { type Page, expect } from '@playwright/test';

export class PropertySearchPage {
  constructor(private readonly page: Page) {}

  async openFromHome() {
    await this.page.goto('/Home.aspx');
    await this.page.getByRole('link', { name: /Assessor Services/ }).click();
    await expect(this.page).toHaveURL(/\/Assessor\.aspx$/);

    await this.page.getByRole('link', { name: 'START YOUR SEARCH' }).click();
    await expect(this.page).toHaveURL(/\/Assessor\/PropertySearch\.aspx$/);
  }

  async searchByParcel(parcelNumber: string) {
    await this.page
      .getByRole('textbox', { name: 'PIN/Assessor Parcel Number' })
      .fill(parcelNumber);
    await this.page.getByRole('button', { name: /^Search/ }).click();

    const result = this.page.getByRole('link', {
      name: `PIN/APN:${parcelNumber}`,
    });
    await expect(result).toBeVisible();
    await result.click();
  }
}
