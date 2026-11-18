import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appOpened, scanA11y } from './helpers.ts';

// Testnet wallets (T-043): FR-070, FR-071, EC-021, EC-025. Entries live in the app's IndexedDB,
// so persistence is checked with a real reload.

const EVM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const BTC_TESTNET = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const BTC_MAINNET = '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs';
const TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

async function open(page: Page): Promise<void> {
	await page.goto('/wallets');
	await appOpened(page);
	await expect(page.getByTestId('wallets-loading')).toHaveCount(0);
}

const dialog = (page: Page) => page.getByRole('dialog');

/** Waits for enter and exit animations; a cancelled one (a dialog closing) counts as done. */
const settled = (page: Page) =>
	page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)));

interface Entry {
	label: string;
	chain?: string;
	network?: string;
	address: string;
	notes?: string;
}

async function fill(page: Page, entry: Entry): Promise<void> {
	const form = dialog(page);
	await form.getByLabel('Label').fill(entry.label);
	if (entry.chain) await form.getByLabel('Chain').selectOption({ label: entry.chain });
	if (entry.network) await form.getByLabel('Network').selectOption({ label: entry.network });
	await form.getByLabel('Address').fill(entry.address);
	if (entry.notes !== undefined) await form.getByLabel('Notes (optional)').fill(entry.notes);
}

async function add(page: Page, entry: Entry): Promise<void> {
	await page.getByRole('button', { name: 'Add wallet' }).click();
	await fill(page, entry);
	await dialog(page).getByRole('button', { name: 'Save' }).click();
}

/** Table rows as [label, chain, network, address]. */
async function rows(page: Page): Promise<string[][]> {
	return page
		.getByTestId('wallets-row')
		.evaluateAll((trs) =>
			trs.map((tr) =>
				[...tr.querySelectorAll('td')]
					.slice(0, 4)
					.map((td, i) =>
						i === 0
							? (td.querySelector('.label')?.textContent ?? '')
							: (td.textContent?.trim() ?? '')
					)
			)
		);
}

test('AC-1: the route is in the sidebar and starts empty with an Add control', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Testnet wallets' })
		.click();
	await expect(page).toHaveURL(/\/wallets$/);
	await expect(page).toHaveTitle('Testnet wallets · QAnchor');
	await expect(page.getByTestId('wallets-empty')).toHaveText(
		'No wallets yet. Add a testnet address to keep it at hand.'
	);
	await expect(page.getByRole('button', { name: 'Add wallet' })).toBeEnabled();
});

test('AC-2: an added entry is listed and survives a reload', async ({ page }) => {
	await open(page);
	await add(page, { label: 'QA main', network: 'Base Sepolia', address: EVM, notes: 'Funded' });
	await expect(dialog(page)).toHaveCount(0);
	await expect(page.locator('.toast')).toHaveText('Added "QA main"');
	await add(page, { label: 'BTC', chain: 'Bitcoin', address: ` ${BTC_TESTNET} ` });
	const expected = [
		['QA main', 'EVM', 'Base Sepolia', EVM],
		['BTC', 'Bitcoin', 'Bitcoin Testnet4', BTC_TESTNET]
	];
	// The save is asynchronous: wait for the second row before reading the table.
	await expect(page.getByTestId('wallets-row')).toHaveCount(2);
	expect(await rows(page)).toEqual(expected);
	await expect(page.getByTestId('wallets-count')).toHaveText('2 wallets');

	await page.reload();
	await appOpened(page);
	await expect(page.getByTestId('wallets-row')).toHaveCount(2);
	expect(await rows(page)).toEqual(expected);
	await expect(page.getByTestId('wallets-row').first()).toContainText('Funded');
});

test.describe('AC-3, AC-4: saving is blocked with a field error', () => {
	for (const [name, entry, field, message] of [
		[
			'an invalid EVM address',
			{ label: 'Bad', address: `${EVM.slice(0, -1)}D` },
			'Address',
			'Not a valid EVM address. Checksum does not match.'
		],
		[
			'an address of another chain',
			{ label: 'Wrong chain', chain: 'Solana', address: EVM },
			'Address',
			'This is a valid EVM address, not Solana. Pick the matching chain.'
		],
		[
			'a Bitcoin mainnet address (AC-4)',
			{ label: 'Mainnet', chain: 'Bitcoin', address: BTC_MAINNET },
			'Address',
			'This is a mainnet address. Only testnet Bitcoin addresses can be saved.'
		],
		['an empty address', { label: 'Empty', address: '' }, 'Address', 'Paste the wallet address.'],
		['a missing label', { label: '  ', address: EVM }, 'Label', 'Give the wallet a label.']
	] as const) {
		test(name, async ({ page }) => {
			await open(page);
			await add(page, entry);
			const control = dialog(page).getByLabel(field);
			await expect(control).toHaveAttribute('aria-invalid', 'true');
			await expect(control).toBeFocused();
			await expect(dialog(page)).toContainText(message);
			await dialog(page).getByRole('button', { name: 'Cancel' }).click();
			await expect(page.getByTestId('wallets-empty')).toBeVisible();
		});
	}

	test('EC-025: a mainnet EVM address on a testnet network is accepted', async ({ page }) => {
		// The format is the same on every EVM network, so the app cannot tell.
		await open(page);
		await add(page, { label: 'Any EVM', address: EVM });
		await expect(page.getByTestId('wallets-row')).toHaveCount(1);
	});
});

test.describe('AC-5: edit and delete persist; delete asks first', () => {
	test('an edit is saved, survives a reload, and keeps the entry in its place', async ({
		page
	}) => {
		await open(page);
		await add(page, { label: 'QA main', address: EVM });
		await add(page, { label: 'BTC', chain: 'Bitcoin', address: BTC_TESTNET });
		await page.getByRole('button', { name: 'Edit QA main' }).click();
		await expect(dialog(page).getByRole('heading')).toHaveText('Edit wallet');
		await expect(dialog(page).getByLabel('Address')).toHaveValue(EVM);
		await fill(page, { label: 'Tron QA', chain: 'Tron', address: TRON, notes: 'Energy test' });
		await dialog(page).getByRole('button', { name: 'Save' }).click();
		await expect(page.locator('.toast')).toHaveText('Saved "Tron QA"');
		await page.reload();
		await appOpened(page);
		await expect(page.getByTestId('wallets-row')).toHaveCount(2);
		// Listed by creation time: the edited entry stays first.
		expect(await rows(page)).toEqual([
			['Tron QA', 'Tron', 'Tron Nile', TRON],
			['BTC', 'Bitcoin', 'Bitcoin Testnet4', BTC_TESTNET]
		]);
	});

	test('delete needs confirmation; Cancel keeps the entry and has focus first', async ({
		page
	}) => {
		await open(page);
		await add(page, { label: 'QA main', address: EVM });
		await page.getByRole('button', { name: 'Delete QA main' }).click();
		await expect(dialog(page).getByRole('heading')).toHaveText('Delete "QA main"?');
		await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
		await dialog(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('wallets-row')).toHaveCount(1);

		await page.getByRole('button', { name: 'Delete QA main' }).click();
		await dialog(page).getByRole('button', { name: 'Delete' }).click();
		await expect(page.locator('.toast')).toHaveText('Deleted "QA main"');
		await expect(page.getByTestId('wallets-empty')).toBeVisible();
		await page.reload();
		await appOpened(page);
		await expect(page.getByTestId('wallets-empty')).toBeVisible();
	});
});

test.describe('AC-6: a duplicate is warned about, and can be cancelled or kept', () => {
	test('Cancel keeps one entry', async ({ page }) => {
		await open(page);
		await add(page, { label: 'QA main', address: EVM });
		await add(page, { label: 'Again', address: EVM.toLowerCase() });
		await expect(page.getByTestId('wallets-duplicate')).toContainText(
			'"QA main" has the same address on Ethereum Sepolia.'
		);
		await dialog(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('wallets-row')).toHaveCount(1);
	});

	test('Save anyway keeps both; another network is no duplicate', async ({ page }) => {
		await open(page);
		await add(page, { label: 'QA main', address: EVM });
		await add(page, { label: 'Again', address: EVM });
		await dialog(page).getByRole('button', { name: 'Save anyway' }).click();
		await expect(page.getByTestId('wallets-row')).toHaveCount(2);
		await add(page, { label: 'On Base', network: 'Base Sepolia', address: EVM });
		await expect(dialog(page)).toHaveCount(0);
		await expect(page.getByTestId('wallets-row')).toHaveCount(3);
	});

	test('editing a field withdraws the warning', async ({ page }) => {
		await open(page);
		await add(page, { label: 'QA main', address: EVM });
		await add(page, { label: 'Again', address: EVM });
		await expect(page.getByTestId('wallets-duplicate')).toBeVisible();
		await dialog(page).getByLabel('Network').selectOption({ label: 'BSC Testnet' });
		await expect(page.getByTestId('wallets-duplicate')).toHaveCount(0);
		await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toBeVisible();
	});
});

test.describe('FR-071: no secrets', () => {
	test('AC-1: the form has no key or mnemonic field, and notes warn against pasting one', async ({
		page
	}) => {
		await open(page);
		await page.getByRole('button', { name: 'Add wallet' }).click();
		const labels = await dialog(page)
			.locator('label')
			.evaluateAll((els) => els.map((el) => el.textContent?.trim()));
		expect(labels).toEqual(['Label', 'Chain', 'Network', 'Address', 'Notes (optional)']);
		await expect(dialog(page)).toContainText(
			'Never paste a private key or seed phrase here. Notes are stored as typed and included in exports.'
		);
	});

	test('AC-2: a stored and exported entry has only the public fields', async ({ page }) => {
		await open(page);
		await add(page, { label: 'QA main', address: EVM, notes: 'Funded' });
		await expect(page.getByTestId('wallets-row')).toHaveCount(1);
		await page.goto('/settings');
		await appOpened(page);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Export backup' }).click()
		]);
		const file = JSON.parse(await readFile((await download.path())!, 'utf8'));
		expect(file.data.wallets).toHaveLength(1);
		expect(Object.keys(file.data.wallets[0]).sort()).toEqual([
			'address',
			'chain',
			'createdAt',
			'id',
			'label',
			'networkId',
			'notes',
			'updatedAt'
		]);
		expect(file.data.wallets[0]).toMatchObject({
			label: 'QA main',
			chain: 'evm',
			networkId: 'eth-sepolia',
			address: EVM,
			notes: 'Funded'
		});
	});
});

test('EC-001: without storage, Add is disabled and the page says why', async ({ page }) => {
	await page.addInitScript(() => {
		IDBFactory.prototype.open = () => {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		};
	});
	await page.goto('/wallets');
	await expect(page.getByRole('main')).toContainText(
		'Saving wallets needs browser storage, which is unavailable in this tab'
	);
	await expect(page.getByRole('button', { name: 'Add wallet' })).toBeDisabled();
});

test.describe('keyboard and accessibility (NFR-009)', () => {
	test('an entry can be added from the keyboard alone', async ({ page }) => {
		await open(page);
		await page.getByRole('button', { name: 'Add wallet' }).focus();
		await page.keyboard.press('Enter');
		await expect(dialog(page).getByLabel('Label')).toBeFocused();
		await page.keyboard.type('Keyboard');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await expect(dialog(page).getByLabel('Address')).toBeFocused();
		await page.keyboard.type(EVM);
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('wallets-row')).toHaveCount(1);
	});

	test('Escape closes the form without saving', async ({ page }) => {
		await open(page);
		await page.getByRole('button', { name: 'Add wallet' }).click();
		await dialog(page).getByLabel('Label').fill('Not saved');
		await page.keyboard.press('Escape');
		await expect(dialog(page)).toHaveCount(0);
		await expect(page.getByTestId('wallets-empty')).toBeVisible();
	});

	test('the list and the open form have no WCAG 2.1 AA violations', async ({ page }) => {
		await open(page);
		expect(await scanA11y(page)).toEqual([]);
		await add(page, { label: 'QA main', address: EVM, notes: 'Funded' });
		await expect(page.getByTestId('wallets-row')).toHaveCount(1);
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
		await add(page, { label: 'Bad', address: 'nope' });
		await expect(dialog(page)).toContainText('Not a valid EVM address.');
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
	});
});
