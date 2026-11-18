import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Request } from '@playwright/test';
import { appOpened, scanA11y } from './helpers.ts';

// Calldata decoder (T-042): FR-050 to FR-053 and EC-014, EC-015. Decoding is local, so the only
// stubbed endpoint is the one the tx lookup hand-off needs.

const num = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');
const ADDRESS = '5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const ADDRESS_EIP55 = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const TRANSFER = `0xa9059cbb${num(0).slice(0, 24)}${ADDRESS}${num(1_000_000)}`;

async function open(page: Page): Promise<void> {
	await page.goto('/calldata');
	await appOpened(page);
}

async function decode(page: Page, calldata: string, abi = ''): Promise<void> {
	await page.getByLabel('Calldata', { exact: true }).fill(calldata);
	await page.getByLabel('ABI or signature (optional)').fill(abi);
	await page.getByRole('button', { name: 'Decode' }).click();
}

/** The arguments table as [#, name, type, value] per row. */
async function argumentRows(page: Page): Promise<string[][]> {
	const rows = page.getByRole('table', { name: 'Arguments' }).locator('tbody tr');
	return rows.evaluateAll((trs) =>
		trs.map((tr) =>
			[...tr.querySelectorAll('td')].slice(0, 4).map((td) => td.textContent?.trim() ?? '')
		)
	);
}

const result = (page: Page) => page.getByTestId('calldata-result');
const alert = (page: Page) => page.getByRole('alert');
const settled = (page: Page) =>
	page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

test('Calldata decoder is in the sidebar and starts with the empty state', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Calldata decoder' })
		.click();
	await expect(page).toHaveURL(/\/calldata$/);
	await expect(page).toHaveTitle('Calldata decoder · QAnchor');
	await expect(page.getByRole('main')).toContainText(
		'Paste calldata to decode it. Add an ABI or a signature for functions outside the built-in list.'
	);
});

test.describe('FR-050: decode with a signature or a JSON ABI', () => {
	test('AC-1, AC-4: a signature gives the function, selector, and typed arguments', async ({
		page
	}) => {
		await open(page);
		await decode(page, TRANSFER, 'transfer(address,uint256)');
		await expect(page.getByTestId('calldata-signature')).toHaveText('transfer(address,uint256)');
		await expect(page.getByTestId('calldata-function')).toHaveText('transfer');
		await expect(page.getByTestId('calldata-selector')).toHaveText('0xa9059cbb');
		await expect(result(page)).toContainText('Your signature');
		expect(await argumentRows(page)).toEqual([
			['1', '', 'address', ADDRESS_EIP55],
			['2', '', 'uint256', '1000000']
		]);
	});

	test('AC-2: a JSON ABI picks the matching function and shows its argument names', async ({
		page
	}) => {
		const abi = JSON.stringify([
			{ type: 'function', name: 'approve', inputs: [{ type: 'address' }, { type: 'uint256' }] },
			{
				type: 'function',
				name: 'transfer',
				inputs: [
					{ name: 'recipient', type: 'address' },
					{ name: 'wad', type: 'uint256' }
				]
			},
			{ type: 'event', name: 'Transfer', inputs: [] }
		]);
		await open(page);
		await decode(page, TRANSFER, abi);
		await expect(result(page)).toContainText('Your ABI');
		expect(await argumentRows(page)).toEqual([
			['1', 'recipient', 'address', ADDRESS_EIP55],
			['2', 'wad', 'uint256', '1000000']
		]);
	});

	test('AC-3, AC-4: nested arrays and tuples, uint256 max as an exact decimal', async ({
		page
	}) => {
		const max = (1n << 256n) - 1n;
		// f((address who, uint256[] ids) order, bool flag)
		const data =
			num(0x40) + num(1) + num(0).slice(0, 24) + ADDRESS + num(0x40) + num(2) + num(max) + num(0);
		await open(page);
		await decode(page, `0x12345678${data}`, 'f((address who, uint256[] ids) order, bool flag)');
		// The selector of the signature is not 0x12345678: decode with the right one instead.
		await expect(alert(page)).toContainText('Selector mismatch');
		const selector = (await alert(page).textContent())?.match(/ABI (0x[0-9a-f]{8})/)?.[1];
		await decode(page, `${selector}${data}`, 'f((address who, uint256[] ids) order, bool flag)');
		expect(await argumentRows(page)).toEqual([
			['1', 'order.who', 'address', ADDRESS_EIP55],
			['1', 'order.ids[0]', 'uint256', max.toString()],
			['1', 'order.ids[1]', 'uint256', '0'],
			['2', 'flag', 'bool', 'true']
		]);
	});
});

test.describe('FR-051: built-in selectors, and nothing looked up online', () => {
	test('AC-1: ERC-20 transfer decodes with no ABI, with names from the table', async ({ page }) => {
		await open(page);
		await decode(page, TRANSFER);
		await expect(result(page)).toContainText('Built-in · ERC-20');
		expect(await argumentRows(page)).toEqual([
			['1', 'to', 'address', ADDRESS_EIP55],
			['2', 'amount', 'uint256', '1000000']
		]);
	});

	test('AC-1: a selector shared by ERC-20 and ERC-721 carries a note', async ({ page }) => {
		await open(page);
		await decode(page, `0x095ea7b3${TRANSFER.slice(10)}`);
		await expect(result(page)).toContainText('Built-in · ERC-20, ERC-721');
		await expect(result(page)).toContainText('In ERC-721 the last argument is the token ID');
	});

	test('AC-2, EC-015: an unknown selector shows raw words and calls no external service', async ({
		page
	}) => {
		await open(page);
		await page.waitForLoadState('networkidle');
		const requests: Request[] = [];
		page.on('request', (request) => requests.push(request));
		await decode(page, `0xdeadbeef${num(1)}${num(2)}abcd`);
		const unknown = page.getByTestId('calldata-unknown');
		await expect(unknown).toContainText('0xdeadbeef is not in the built-in list');
		await expect(unknown).toContainText('Add an ABI or a signature');
		await expect(page.getByTestId('calldata-word-row')).toHaveCount(3);
		await expect(page.getByTestId('calldata-word-row').last()).toContainText('0x40');
		await expect(page.getByTestId('calldata-word-row').last()).toContainText('0xabcd');
		await page.waitForLoadState('networkidle');
		expect(requests.map((r) => r.url())).toEqual([]);
	});
});

test.describe('FR-052: error states', () => {
	for (const [input, why] of [
		['0xa9059cbz', 'not hex'],
		['0xa9059cb', 'odd length'],
		['transfer', 'text']
	]) {
		test(`AC-1: ${why} is a field error and nothing is decoded`, async ({ page }) => {
			await open(page);
			await decode(page, TRANSFER);
			await decode(page, input);
			const field = page.getByLabel('Calldata', { exact: true });
			await expect(field).toHaveAttribute('aria-invalid', 'true');
			await expect(field).toBeFocused();
			await expect(
				page.getByText('Calldata must be hex with an even number of digits.')
			).toBeVisible();
			await expect(result(page)).toHaveCount(0);
		});
	}

	test('AC-1: an empty field asks for calldata', async ({ page }) => {
		await open(page);
		await page.getByRole('button', { name: 'Decode' }).click();
		await expect(page.getByText('Paste calldata to decode.')).toBeVisible();
	});

	for (const input of ['0x', '0xa9059c']) {
		test(`AC-2: "${input}" has no function selector`, async ({ page }) => {
			await open(page);
			await decode(page, input);
			await expect(page.getByTestId('calldata-no-selector')).toHaveText(
				'No function selector (plain transfer or empty data).'
			);
		});
	}

	test('AC-3: a selector mismatch shows both selectors, focused', async ({ page }) => {
		await open(page);
		await decode(page, TRANSFER, 'approve(address,uint256)');
		await expect(alert(page)).toContainText(
			'Selector mismatch: calldata 0xa9059cbb, ABI 0x095ea7b3.'
		);
		await expect(alert(page)).toBeFocused();
		await expect(result(page)).toHaveCount(0);
	});

	test('AC-4: inconsistent offsets give a decoding error and no values', async ({ page }) => {
		await open(page);
		await decode(page, `0x12345678${num(0x1000)}`, 'f(bytes)');
		// Decode with the signature's own selector so only the offset is wrong.
		const selector = (await alert(page).textContent())?.match(/ABI (0x[0-9a-f]{8})/)?.[1];
		await decode(page, `${selector}${num(0x1000)}`, 'f(bytes)');
		await expect(alert(page)).toContainText('Decoding failed');
		await expect(alert(page)).toContainText(
			'Argument 1: offset 4096 points past the end of the data.'
		);
		await expect(page.getByRole('table')).toHaveCount(0);
	});

	test('AC-4: a built-in function with short data is a decoding error too', async ({ page }) => {
		await open(page);
		await decode(page, TRANSFER.slice(0, 74));
		await expect(alert(page)).toContainText('Argument 2 (amount): data ends before this value.');
		await expect(page.getByRole('table')).toHaveCount(0);
	});

	for (const [abi, message] of [
		['[{"type":"function",', 'The ABI is not valid JSON.'],
		['transfer(address,uint7)', 'Unknown type "uint7".']
	]) {
		test(`AC-5: "${abi}" is a field error on the ABI input`, async ({ page }) => {
			await open(page);
			await decode(page, TRANSFER, abi);
			const field = page.getByLabel('ABI or signature (optional)');
			await expect(field).toHaveAttribute('aria-invalid', 'true');
			await expect(field).toBeFocused();
			await expect(page.getByText(message)).toBeVisible();
			await expect(result(page)).toHaveCount(0);
		});
	}
});

test.describe('EC-014: selector only, and trailing bytes', () => {
	test('selector-only calldata decodes for a zero-argument function', async ({ page }) => {
		await open(page);
		await decode(page, '0x3ccfd60b', 'withdraw()');
		await expect(page.getByTestId('calldata-function')).toHaveText('withdraw');
		await expect(result(page)).toContainText('This function takes no arguments.');
	});

	test('extra bytes after the arguments are a warning, and the values still show', async ({
		page
	}) => {
		await open(page);
		await decode(page, `${TRANSFER}deadbeef`);
		await expect(page.getByTestId('calldata-extra')).toHaveText(
			'4 extra bytes after the arguments. They are not part of the call as decoded.'
		);
		expect(await argumentRows(page)).toHaveLength(2);
	});
});

test.describe('FR-053: hand-off from tx lookup', () => {
	const call = JSON.parse(readFileSync('src/lib/core/tx/fixtures/evm-success-call.json', 'utf8'));
	const transfer = JSON.parse(
		readFileSync('src/lib/core/tx/fixtures/evm-success-transfer.json', 'utf8')
	);
	const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

	async function lookUp(page: Page, fixture: typeof call): Promise<void> {
		await page.route('https://sepolia.gateway.tenderly.co/**', async (route) => {
			if (route.request().method() === 'OPTIONS') {
				return route.fulfill({ status: 204, headers: CORS });
			}
			const method = route.request().postDataJSON()?.method;
			const result =
				method === 'eth_chainId'
					? '0xaa36a7'
					: method === 'eth_getTransactionByHash'
						? fixture.transaction
						: fixture.receipt;
			await route.fulfill({
				headers: CORS,
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, result })
			});
		});
		await page.goto('/tx');
		await appOpened(page);
		await page.getByLabel('Network', { exact: true }).selectOption({ label: 'Ethereum Sepolia' });
		await page.getByLabel('Transaction hash').fill(fixture.hash);
		await page.getByRole('button', { name: 'Look up' }).click();
		await expect(page.getByTestId('tx-result')).toBeVisible();
	}

	test('AC-1: "Decode input" opens the decoder pre-filled and decoded', async ({ page }) => {
		await lookUp(page, call);
		await page.getByRole('button', { name: 'Decode input' }).click();
		await expect(page).toHaveURL(/\/calldata$/);
		await expect(page.getByLabel('Calldata', { exact: true })).toHaveValue(call.transaction.input);
		await expect(page.getByTestId('calldata-function')).toHaveText('approve');
		await expect(result(page)).toContainText('Built-in · ERC-20, ERC-721');
		// The calldata is not put in the URL.
		expect(page.url()).not.toContain(call.transaction.input.slice(2, 20));
	});

	test('a plain transfer has no input to decode', async ({ page }) => {
		await lookUp(page, transfer);
		await expect(page.locator('[data-field="input"]')).toContainText('0x');
		await expect(page.getByRole('button', { name: 'Decode input' })).toHaveCount(0);
	});
});

test.describe('keyboard and accessibility (NFR-009)', () => {
	test('Ctrl+Enter decodes from the calldata field', async ({ page }) => {
		await open(page);
		await page.getByLabel('Calldata', { exact: true }).fill(TRANSFER);
		await page.getByLabel('Calldata', { exact: true }).press('Control+Enter');
		await expect(page.getByTestId('calldata-function')).toHaveText('transfer');
	});

	test('the decoded result has no WCAG 2.1 AA violations', async ({ page }) => {
		await open(page);
		await decode(page, `${TRANSFER}00`);
		await expect(result(page)).toBeVisible();
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
	});

	test('the unknown-selector and error states have no WCAG 2.1 AA violations', async ({ page }) => {
		await open(page);
		await decode(page, `0xdeadbeef${num(1)}`);
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
		await decode(page, TRANSFER, 'approve(address,uint256)');
		await expect(alert(page)).toBeFocused();
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
	});
});
