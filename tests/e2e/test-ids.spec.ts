import { expect, test, type Page } from '@playwright/test';
import { appOpened } from './helpers.ts';

// The `data-testid`s are a public contract for owner-written automation (decisions 2026-11-16).
// This spec only checks that they exist; the other specs stay role-first and do not use them.
// Renaming or removing an id must update this list and be noted in the PR.

/** Each id appears exactly once. */
async function once(page: Page, ids: readonly string[]): Promise<void> {
	for (const id of ids) await expect(page.getByTestId(id), id).toHaveCount(1);
}

/** Repeated items: one per row. */
async function each(page: Page, id: string, count: number): Promise<void> {
	await expect(page.getByTestId(id), id).toHaveCount(count);
}

const toolbar = (prefix: string) =>
	['result-count', 'copy-all', 'export-format', 'download'].map((part) => `${prefix}-${part}`);

test('address generator and validator', async ({ page }) => {
	await page.goto('/address');
	await appOpened(page);
	await once(page, ['address-count', 'address-generate', ...toolbar('address')]);

	await page.getByTestId('address-count').fill('3');
	await page.getByTestId('address-generate').click();
	await each(page, 'address-result-row', 3);
	await each(page, 'address-copy', 3);
	await once(page, ['address-tally']);

	await page.getByRole('tab', { name: 'Validate' }).click();
	await page.getByTestId('address-validate-input').fill('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
	await expect(page.getByTestId('address-verdict')).toContainText('Tron');
});

test('amount edge cases', async ({ page }) => {
	await page.goto('/amounts');
	await appOpened(page);
	await once(page, [
		'amounts-preset',
		'amounts-decimals',
		'amounts-balance',
		'amounts-fee',
		'amounts-min',
		'amounts-max',
		'amounts-generate',
		...toolbar('amounts')
	]);

	await page.getByTestId('amounts-decimals').fill('6');
	await page.getByTestId('amounts-generate').click();
	const rows = await page.getByTestId('amounts-result-row').count();
	expect(rows).toBeGreaterThan(0);
	await each(page, 'amounts-copy', rows);
	await once(page, ['amounts-omitted']);
});

test('unit converter', async ({ page }) => {
	await page.goto('/units');
	await appOpened(page);
	await once(page, [
		'units-family',
		'units-input-wei',
		'units-input-gwei',
		'units-input-ether',
		'units-copy-wei'
	]);

	await page.getByTestId('units-input-ether').fill('1,5');
	await once(page, ['units-error']);
	// The family select is the phone layout; on a wide screen the segmented control shows.
	await page.getByRole('radio', { name: 'Custom token' }).check();
	await once(page, ['units-decimals']);
});

test('checklists', async ({ page }) => {
	await page.goto('/checklists');
	await appOpened(page);
	await once(page, ['checklists-filter']);
	await each(page, 'checklists-row', 7);

	await page.getByTestId('checklists-filter').fill('zzz');
	await once(page, ['checklists-empty']);

	await page.goto('/checklists/deposit');
	await appOpened(page);
	await once(page, ['checklists-copy-markdown']);
	await each(page, 'checklists-section', 5);
	await each(page, 'checklists-item', 27);
});

test('settings', async ({ page }) => {
	await page.goto('/settings');
	await appOpened(page);
	await once(page, [
		'settings-export',
		'settings-import',
		'settings-import-file',
		'settings-outcome'
	]);
	await each(page, 'settings-endpoint-row', 16);
	await each(page, 'settings-endpoint-edit', 16);

	await page.locator('[data-network="eth"]').getByTestId('settings-endpoint-edit').click();
	await once(page, [
		'settings-endpoint-input',
		'settings-endpoint-save',
		'settings-endpoint-cancel'
	]);
	await page.getByTestId('settings-endpoint-input').fill('https://rpc.example.dev');
	await page.getByTestId('settings-endpoint-save').click();
	await once(page, ['settings-endpoint-reset']);
});

test('app shell', async ({ page }) => {
	await page.goto('/');
	await once(page, ['app-toast']);
});
