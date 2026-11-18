import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appOpened, putRecords, scanA11y } from './helpers.ts';

// Testnet wallets (T-043): FR-070, FR-071, EC-021, EC-025. Entries live in the app's IndexedDB,
// so persistence is checked with a real reload.

const EVM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const BTC_TESTNET = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const SOLANA = 'So11111111111111111111111111111111111111112';
const BTC_MAINNET = '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs';
const TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const EVM_2 = '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB';

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

test.describe('FR-072: faucet links', () => {
	const faucetsOf = (page: Page, label: string) =>
		page.getByTestId('wallets-row').filter({ hasText: label }).getByTestId('wallets-faucets');

	async function expand(page: Page, label: string) {
		const details = faucetsOf(page, label);
		await details.locator('summary').click();
		return details;
	}

	/** An entry as an imported backup can hold it, on any network id. */
	const stored = (id: string, label: string, networkId: string, createdAt: number) => ({
		id,
		label,
		chain: 'evm',
		networkId,
		address: EVM,
		notes: '',
		createdAt,
		updatedAt: createdAt
	});

	test("AC-1: the network's faucets are listed and open in a new tab without an opener", async ({
		page
	}) => {
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		const details = faucetsOf(page, 'Base');
		await expect(details.locator('summary')).toHaveText(/^\s*Faucets \(2\)/);
		await expect(details.getByTestId('wallets-faucet-link').first()).toBeHidden();

		await expand(page, 'Base');
		const links = details.getByTestId('wallets-faucet-link');
		await expect(links).toHaveCount(2);
		expect(
			await links.evaluateAll((as) =>
				as.map((a) => [
					a.textContent?.trim(),
					a.getAttribute('href'),
					a.getAttribute('target'),
					a.getAttribute('rel')
				])
			)
		).toEqual([
			[
				'Alchemy (opens in a new tab)',
				'https://www.alchemy.com/faucets/base-sepolia',
				'_blank',
				'noopener noreferrer'
			],
			[
				'Coinbase CDP (opens in a new tab)',
				'https://portal.cdp.coinbase.com/onchain-tools/faucet',
				'_blank',
				'noopener noreferrer'
			]
		]);
		await expect(details).toContainText('www.alchemy.com');
	});

	test('AC-2: a faucet link only navigates: no opener, no referrer, nothing sent', async ({
		page,
		context
	}) => {
		const faucetRequests: { method: string; url: string; referer?: string; body: string | null }[] =
			[];
		// Stub the faucet so the test never reaches the real site.
		await context.route('https://www.alchemy.com/**', (route) => {
			const request = route.request();
			faucetRequests.push({
				method: request.method(),
				url: request.url(),
				referer: request.headers()['referer'],
				body: request.postData()
			});
			return route.fulfill({ contentType: 'text/html', body: '<title>Faucet</title>' });
		});
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		const details = await expand(page, 'Base');

		const [popup] = await Promise.all([
			context.waitForEvent('page'),
			details.getByRole('link', { name: /^Alchemy/ }).click()
		]);
		await popup.waitForLoadState();
		expect(popup.url()).toBe('https://www.alchemy.com/faucets/base-sepolia');
		expect(await popup.evaluate(() => window.opener)).toBeNull();
		expect(faucetRequests).toEqual([
			{
				method: 'GET',
				url: 'https://www.alchemy.com/faucets/base-sepolia',
				referer: undefined,
				body: null
			}
		]);
		// The app stays where it was.
		await expect(page).toHaveURL(/\/wallets$/);
	});

	test('AC-3: an entry on a network with no faucet says so', async ({ page }) => {
		await open(page);
		await putRecords(page, 'wallets', [stored('m', 'Mainnet entry', 'eth', 1)]);
		await page.reload();
		await appOpened(page);
		const details = faucetsOf(page, 'Mainnet entry');
		await expect(details.locator('summary')).toHaveText(/^\s*No faucet listed/);
		await expand(page, 'Mainnet entry');
		await expect(details.getByTestId('wallets-no-faucet')).toHaveText(
			'No faucet is listed for this network. Add one you use below.'
		);
		await expect(details.getByTestId('wallets-faucet-link')).toHaveCount(0);
	});

	test('a user-added link is listed on every entry of its network and survives a reload', async ({
		page
	}) => {
		await open(page);
		await add(page, { label: 'First', network: 'Base Sepolia', address: EVM });
		await add(page, { label: 'Second', network: 'Base Sepolia', address: EVM_2 });
		await add(page, { label: 'Other', network: 'Ethereum Sepolia', address: EVM });
		await expect(page.getByTestId('wallets-row')).toHaveCount(3);
		await expect(dialog(page)).toHaveCount(0);

		await (await expand(page, 'First')).getByTestId('wallets-faucet-add').click();
		await expect(dialog(page)).toContainText('Add faucet link: Base Sepolia');
		await dialog(page).getByLabel('Faucet address').fill(' https://faucet.example.dev/base ');
		await dialog(page).getByLabel('Label (optional)').fill('Team faucet');
		await dialog(page).getByRole('button', { name: 'Add link' }).click();
		await expect(dialog(page)).toHaveCount(0);
		await expect(page.locator('.toast')).toHaveText('Added a faucet link for Base Sepolia');

		await expect(faucetsOf(page, 'First').locator('summary')).toHaveText(/Faucets \(3\)/);
		await expect(faucetsOf(page, 'Second').locator('summary')).toHaveText(/Faucets \(3\)/);
		await expect(faucetsOf(page, 'Other').locator('summary')).toHaveText(/Faucets \(3\)/);
		const own = faucetsOf(page, 'First').getByTestId('wallets-own-faucet');
		await expect(own.getByRole('link')).toHaveAttribute('href', 'https://faucet.example.dev/base');
		await expect(own.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
		await expect(own.getByRole('link')).toHaveAttribute('target', '_blank');
		await expect(faucetsOf(page, 'Other').getByTestId('wallets-own-faucet')).toHaveCount(0);

		await page.reload();
		await appOpened(page);
		await expand(page, 'Second');
		await expect(
			faucetsOf(page, 'Second').getByTestId('wallets-own-faucet').getByRole('link')
		).toHaveText(/^Team faucet/);
	});

	for (const [name, url, message] of [
		['an empty address', '', "Paste the faucet's web address."],
		[
			'text that is not a web address',
			'faucet.example.dev',
			'Not a web address. Paste the full address, starting with https://.'
		],
		['a javascript: link', 'javascript:alert(1)', 'Only http and https links can be added.'],
		[
			'a built-in faucet',
			'https://www.alchemy.com/faucets/base-sepolia',
			'This faucet is already listed for Base Sepolia.'
		]
	] as const) {
		test(`${name} is refused with a field error`, async ({ page }) => {
			await open(page);
			await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
			await (await expand(page, 'Base')).getByTestId('wallets-faucet-add').click();
			const field = dialog(page).getByLabel('Faucet address');
			await field.fill(url);
			await dialog(page).getByRole('button', { name: 'Add link' }).click();
			await expect(dialog(page)).toContainText(message);
			await expect(field).toBeFocused();
			await expect(field).toHaveAttribute('aria-invalid', 'true');
			await page.keyboard.press('Escape');
			await expect(faucetsOf(page, 'Base').getByTestId('wallets-own-faucet')).toHaveCount(0);
		});
	}

	test('a user-added link can be removed, and stays removed', async ({ page }) => {
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await putRecords(page, 'faucets', [
			{ id: 'f1', networkId: 'base-sepolia', label: '', url: 'https://faucet.example.dev/' }
		]);
		await page.reload();
		await appOpened(page);
		const details = await expand(page, 'Base');
		// An unlabelled link is named by its host.
		await expect(details.getByTestId('wallets-own-faucet').getByRole('link')).toHaveText(
			/^faucet\.example\.dev/
		);
		await details.getByRole('button', { name: 'Remove https://faucet.example.dev/' }).click();
		await expect(page.locator('.toast')).toHaveText('Removed "faucet.example.dev"');
		await expect(details.getByTestId('wallets-own-faucet')).toHaveCount(0);

		await page.reload();
		await appOpened(page);
		await expand(page, 'Base');
		await expect(faucetsOf(page, 'Base').getByTestId('wallets-own-faucet')).toHaveCount(0);
	});

	test('an imported link that is not a web address is shown but never linked', async ({ page }) => {
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await putRecords(page, 'faucets', [
			{ id: 'bad', networkId: 'base-sepolia', label: 'Sneaky', url: 'javascript:alert(1)' }
		]);
		await page.reload();
		await appOpened(page);
		const details = await expand(page, 'Base');
		const own = details.getByTestId('wallets-own-faucet');
		await expect(own).toContainText('Sneaky');
		await expect(own).toContainText('not a web link');
		await expect(own.getByRole('link')).toHaveCount(0);
		await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
	});

	test('the open faucet list and its form have no WCAG 2.1 AA violations', async ({ page }) => {
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await expand(page, 'Base');
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
		await faucetsOf(page, 'Base').getByTestId('wallets-faucet-add').click();
		await dialog(page).getByRole('button', { name: 'Add link' }).click();
		await expect(dialog(page)).toContainText("Paste the faucet's web address.");
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
	});

	test('a faucet link can be added from the keyboard alone', async ({ page }) => {
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await expect(dialog(page)).toHaveCount(0);
		const summary = faucetsOf(page, 'Base').locator('summary');
		await summary.focus();
		await page.keyboard.press('Enter');
		await expect(faucetsOf(page, 'Base').getByTestId('wallets-faucet-link')).toHaveCount(2);
		await faucetsOf(page, 'Base').getByTestId('wallets-faucet-add').focus();
		await page.keyboard.press('Enter');
		await expect(dialog(page).getByLabel('Faucet address')).toBeFocused();
		await page.keyboard.type('https://faucet.example.dev');
		await page.keyboard.press('Enter');
		await expect(faucetsOf(page, 'Base').getByTestId('wallets-own-faucet')).toHaveCount(1);
	});
});

test.describe('FR-073: on-demand balance', () => {
	// Fetch times are shown in local time; pin it so "fetched 14:02" is the same everywhere.
	test.use({ timezoneId: 'UTC' });

	const BASE_RPC = 'https://base-sepolia.gateway.tenderly.co';
	const balanceOf = (page: Page, label: string) =>
		page.getByTestId('wallets-row').filter({ hasText: label }).getByTestId('wallets-balance');
	const refreshOf = (page: Page, label: string) =>
		page.getByRole('button', { name: `Refresh balance of ${label}` });

	type Reply = { status?: number; body: unknown } | 'abort';

	/**
	 * Stubs the Base Sepolia endpoint: the chain ID is right, and each eth_getBalance gets the
	 * next reply. Returns every JSON-RPC method sent to any host but the app's own.
	 */
	async function stubBase(page: Page, replies: Reply[]): Promise<string[]> {
		const sent: string[] = [];
		await page.route(
			(url) => url.hostname !== 'localhost',
			async (route) => {
				const request = route.request();
				const body = request.postDataJSON() as { method?: string } | null;
				sent.push(`${new URL(request.url()).host} ${body?.method ?? request.method()}`);
				if (!request.url().startsWith(BASE_RPC)) return route.abort();
				if (body?.method === 'eth_chainId') {
					return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: '0x14a34' } });
				}
				const reply = replies.shift();
				if (!reply || reply === 'abort') return route.abort();
				return route.fulfill({ status: reply.status ?? 200, json: reply.body });
			}
		);
		return sent;
	}

	const wei = (hex: string) => ({ body: { jsonrpc: '2.0', id: 1, result: hex } });

	test('AC-1: Refresh fetches the balance once and shows it with the fetch time', async ({
		page
	}) => {
		await page.clock.setFixedTime(new Date('2026-11-18T14:02:00Z'));
		const sent = await stubBase(page, [wei('0xde0b6b3a7640000')]);
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await expect(balanceOf(page, 'Base')).toHaveText('Not fetched');

		await refreshOf(page, 'Base').click();
		await expect(balanceOf(page, 'Base')).toHaveText(/^\s*1 ETH\s*fetched 14:02\s*$/);
		await expect(balanceOf(page, 'Base').locator('time')).toHaveAttribute(
			'datetime',
			'2026-11-18T14:02:00.000Z'
		);
		expect(sent).toEqual([
			'base-sepolia.gateway.tenderly.co eth_chainId',
			'base-sepolia.gateway.tenderly.co eth_getBalance'
		]);
	});

	test('AC-2: nothing is requested without a click, however long the page is open', async ({
		page
	}) => {
		await page.clock.install();
		const sent = await stubBase(page, [wei('0x1')]);
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await expect(page.getByTestId('wallets-row')).toHaveCount(1);
		await page.clock.runFor(10 * 60_000);
		expect(sent).toEqual([]);

		await refreshOf(page, 'Base').click();
		await expect(balanceOf(page, 'Base')).toContainText('0.000000000000000001 ETH');
		await page.clock.runFor(10 * 60_000);
		expect(sent).toHaveLength(2);
	});

	test('AC-3: a failed refresh keeps the old value, marks it stale, and moves focus to the error', async ({
		page
	}) => {
		await stubBase(page, [
			wei('0xde0b6b3a7640000'),
			{ status: 429, body: 'Too Many Requests' },
			wei('0x1bc16d674ec80000')
		]);
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await refreshOf(page, 'Base').click();
		await expect(balanceOf(page, 'Base')).toContainText('1 ETH');
		await expect(balanceOf(page, 'Base')).not.toContainText('stale');

		await refreshOf(page, 'Base').click();
		const error = balanceOf(page, 'Base').getByRole('alert');
		await expect(error).toHaveText(
			'base-sepolia.gateway.tenderly.co is rate-limiting requests. Try again later or set your own endpoint in Settings.'
		);
		await expect(error).toBeFocused();
		await expect(balanceOf(page, 'Base')).toContainText('1 ETH');
		await expect(balanceOf(page, 'Base')).toContainText('stale');

		// Retry is the same control, now named for what it does.
		await page.getByRole('button', { name: 'Retry balance of Base' }).click();
		await expect(balanceOf(page, 'Base')).toContainText('2 ETH');
		await expect(balanceOf(page, 'Base')).not.toContainText('stale');
		await expect(balanceOf(page, 'Base').getByRole('alert')).toHaveCount(0);
	});

	for (const [name, reply, message] of [
		[
			'a connection failure',
			'abort',
			'Could not reach base-sepolia.gateway.tenderly.co. The balance could not be read.'
		],
		[
			'an unreadable answer',
			wei('0xnope'),
			'base-sepolia.gateway.tenderly.co returned a response QAnchor could not read.'
		]
	] as const) {
		test(`${name} with no earlier value shows the error only`, async ({ page }) => {
			await stubBase(page, [reply]);
			await open(page);
			await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
			await refreshOf(page, 'Base').click();
			await expect(balanceOf(page, 'Base')).toHaveText(message);
			await expect(balanceOf(page, 'Base').getByRole('alert')).toBeFocused();
		});
	}

	test('an endpoint on another chain is caught before any balance is shown', async ({ page }) => {
		await page.route(`${BASE_RPC}/`, (route) =>
			route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: '0x1' } })
		);
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await refreshOf(page, 'Base').click();
		await expect(balanceOf(page, 'Base')).toHaveText(
			'This endpoint serves chain ID 1, but Base Sepolia is chain ID 84532.'
		);
	});

	test('the endpoint set in Settings is used instead of the default (FR-041)', async ({ page }) => {
		const hosts: string[] = [];
		await page.route('https://rpc.example.dev/**', (route) => {
			hosts.push(new URL(route.request().url()).host);
			const { method } = route.request().postDataJSON() as { method: string };
			return route.fulfill({
				json: { jsonrpc: '2.0', id: 1, result: method === 'eth_chainId' ? '0x14a34' : '0x0' }
			});
		});
		await open(page);
		await putRecords(page, 'endpoints', [
			{ networkId: 'base-sepolia', url: 'https://rpc.example.dev/base' }
		]);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await refreshOf(page, 'Base').click();
		await expect(balanceOf(page, 'Base')).toContainText('0 ETH');
		expect(hosts).toEqual(['rpc.example.dev', 'rpc.example.dev']);
	});

	test('Solana, Tron, and Bitcoin balances are read and shown in their coin', async ({ page }) => {
		await page.route('https://api.devnet.solana.com/', (route) =>
			route.fulfill({
				json: { jsonrpc: '2.0', id: 1, result: { context: {}, value: 2_500_000_000 } }
			})
		);
		await page.route('https://nile.trongrid.io/wallet/getaccount', (route) =>
			route.fulfill({ json: { address: TRON, balance: 1_000_000 } })
		);
		await page.route(`https://mempool.space/testnet4/api/address/${BTC_TESTNET}`, (route) =>
			route.fulfill({
				json: {
					chain_stats: { funded_txo_sum: 5000, spent_txo_sum: 1000 },
					mempool_stats: { funded_txo_sum: 250, spent_txo_sum: 0 }
				}
			})
		);
		await open(page);
		await add(page, { label: 'Sol', chain: 'Solana', address: SOLANA });
		await add(page, { label: 'Trx', chain: 'Tron', address: TRON });
		await add(page, { label: 'Btc', chain: 'Bitcoin', address: BTC_TESTNET });
		await expect(page.getByTestId('wallets-row')).toHaveCount(3);
		for (const label of ['Sol', 'Trx', 'Btc']) await refreshOf(page, label).click();
		await expect(balanceOf(page, 'Sol')).toContainText('2.5 SOL');
		await expect(balanceOf(page, 'Trx')).toContainText('1 TRX');
		await expect(balanceOf(page, 'Btc')).toContainText('0.0000425 BTC');
	});

	test('an entry on a network this version does not know has no Refresh', async ({ page }) => {
		await open(page);
		await putRecords(page, 'wallets', [
			{
				id: 'x',
				label: 'Old',
				chain: 'evm',
				networkId: 'eth-goerli',
				address: EVM,
				notes: '',
				createdAt: 1,
				updatedAt: 1
			}
		]);
		await page.reload();
		await appOpened(page);
		await expect(balanceOf(page, 'Old')).toHaveText('No endpoint for this network');
		await expect(page.getByTestId('wallets-refresh')).toHaveCount(0);
	});

	test('a second click while a refresh runs sends no second request', async ({ page }) => {
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		const methods: string[] = [];
		await page.route(`${BASE_RPC}/`, async (route) => {
			const { method } = route.request().postDataJSON() as { method: string };
			methods.push(method);
			if (method === 'eth_getBalance') await held;
			await route.fulfill({
				json: { jsonrpc: '2.0', id: 1, result: method === 'eth_chainId' ? '0x14a34' : '0x0' }
			});
		});
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await refreshOf(page, 'Base').click();
		await expect.poll(() => methods).toEqual(['eth_chainId', 'eth_getBalance']);
		// Still focusable while busy, so keyboard focus is not lost; the click does nothing.
		await expect(refreshOf(page, 'Base')).toHaveAttribute('aria-disabled', 'true');
		// force: Playwright would otherwise wait for aria-disabled to clear; a person can click.
		await refreshOf(page, 'Base').click({ force: true });
		await expect(balanceOf(page, 'Base')).toHaveText('Refreshing…');
		release();
		await expect(balanceOf(page, 'Base')).toContainText('0 ETH');
		expect(methods).toEqual(['eth_chainId', 'eth_getBalance']);
	});

	test('leaving the page cancels a refresh in flight (NFR-019)', async ({ page }) => {
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		const failed: string[] = [];
		page.on('requestfailed', (request) => failed.push(request.url()));
		await page.route(`${BASE_RPC}/`, async (route) => {
			await held;
			await route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: '0x14a34' } }).catch(() => {});
		});
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await refreshOf(page, 'Base').click();
		await expect(balanceOf(page, 'Base')).toHaveText('Refreshing…');
		await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Unit converter' })
			.click();
		await expect(page).toHaveURL(/\/units$/);
		await expect.poll(() => failed).toEqual([`${BASE_RPC}/`]);
		release();
	});

	test('the balance, stale mark, and error have no WCAG 2.1 AA violations', async ({ page }) => {
		await stubBase(page, [wei('0xde0b6b3a7640000'), { status: 429, body: 'Too Many Requests' }]);
		await open(page);
		await add(page, { label: 'Base', network: 'Base Sepolia', address: EVM });
		await refreshOf(page, 'Base').click();
		await expect(balanceOf(page, 'Base')).toContainText('1 ETH');
		await refreshOf(page, 'Base').click();
		await expect(balanceOf(page, 'Base')).toContainText('stale');
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
	});
});
