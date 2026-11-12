import { expect, test } from '@playwright/test';

test('index page shows its heading', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('QAnchor');
	await expect(page.getByRole('heading', { level: 1, name: 'QAnchor' })).toBeVisible();
});
