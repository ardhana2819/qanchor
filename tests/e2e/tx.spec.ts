import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { appOpened, scanA11y } from './helpers.ts';

// Tx lookup (T-040): every FR-040 and FR-042 acceptance criterion against stubbed endpoints. The
// stubs answer with the responses recorded for the parsers (src/lib/core/tx/fixtures), so no
// test reaches a real chain.

const fixture = (name: string) =>
	JSON.parse(readFileSync(`src/lib/core/tx/fixtures/${name}.json`, 'utf8'));

const EVM = fixture('evm-success-transfer');
const EVM_PENDING = fixture('evm-pending');
const BTC = fixture('bitcoin-confirmed');
const SOL = fixture('solana-transfer');
const SOL_STATUS = fixture('solana-status-finalized');
const TRON = fixture('tron-failed');

const SEPOLIA = 'https://sepolia.gateway.tenderly.co';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

type Reply = [status: number, body: unknown] | 'hang' | 'fail';

/** Answers every request to `origin`; JSON-RPC calls are routed by method. */
async function stub(page: Page, origin: string, reply: (request: Request) => Reply) {
	const seen: Request[] = [];
	await page.route(`${origin}/**`, async (route: Route) => {
		const request = route.request();
		if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
		seen.push(request);
		const answer = reply(request);
		if (answer === 'hang') return; // never answered: the page has to abort or time out
		if (answer === 'fail') return route.abort('failed');
		const [status, body] = answer;
		await route.fulfill({
			status,
			headers: CORS,
			body: typeof body === 'string' ? body : JSON.stringify(body)
		});
	});
	return seen;
}

const method = (request: Request) => request.postDataJSON()?.method as string | undefined;
const rpc = (result: unknown): Reply => [200, { jsonrpc: '2.0', id: 1, result }];

function sepolia(tx: unknown = EVM.transaction, receipt: unknown = EVM.receipt) {
	return (request: Request): Reply => {
		if (method(request) === 'eth_chainId') return rpc('0xaa36a7');
		if (method(request) === 'eth_getTransactionByHash') return rpc(tx);
		return rpc(receipt);
	};
}

async function open(page: Page): Promise<void> {
	await page.goto('/tx');
	await appOpened(page);
}

async function lookUp(page: Page, networkName: string, hash: string): Promise<void> {
	await page.getByLabel('Network', { exact: true }).selectOption({ label: networkName });
	await page.getByLabel('Transaction hash').fill(hash);
	await page.getByRole('button', { name: 'Look up' }).click();
}

const row = (page: Page, field: string) => page.locator(`[data-field="${field}"]`);
const alert = (page: Page) => page.getByRole('alert');

/** Waits for enter animations (staggered rows, the callout) before an axe scan. */
const settled = (page: Page) =>
	page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

test('Tx lookup is in the sidebar and starts with the empty state', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Tx lookup' })
		.click();
	await expect(page).toHaveURL(/\/tx$/);
	await expect(page).toHaveTitle('Tx lookup · QAnchor');
	await expect(
		page.getByText('Paste a transaction hash to look it up. Nothing is requested until you submit.')
	).toBeVisible();
});

test.describe('FR-040 AC-1: loading state and one lookup at a time (EC-024)', () => {
	test('the button is busy and the host is named until the lookup settles', async ({ page }) => {
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route(`${SEPOLIA}/**`, async (route) => {
			if (route.request().method() === 'OPTIONS')
				return route.fulfill({ status: 204, headers: CORS });
			if (method(route.request()) === 'eth_getTransactionByHash') await held;
			const answer = sepolia()(route.request()) as [number, unknown];
			await route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(answer[1]) });
		});
		const seen: string[] = [];
		page.on('request', (r) => {
			if (r.url().startsWith(SEPOLIA) && r.method() === 'POST') seen.push(method(r) ?? '');
		});
		await open(page);

		await lookUp(page, 'Ethereum Sepolia', EVM.hash);
		const busy = page.getByRole('button', { name: 'Looking up…' });
		await expect(busy).toBeDisabled();
		await expect(page.getByTestId('tx-progress')).toHaveText('Asking sepolia.gateway.tenderly.co…');
		// A second submit, by click and by Enter, starts nothing.
		await busy.click({ force: true });
		await page.getByLabel('Transaction hash').press('Enter');

		release();
		await expect(page.getByTestId('tx-result')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Look up' })).toBeEnabled();
		await expect(page.getByTestId('tx-progress')).toHaveText('');
		expect(seen).toEqual(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt']);
	});
});

test.describe('FR-040 AC-2: a confirmed transaction', () => {
	test('EVM: status, block, sender, recipient, value in two units, fee, nonce, input', async ({
		page
	}) => {
		await stub(page, SEPOLIA, sepolia());
		await open(page);
		await lookUp(page, 'Ethereum Sepolia', EVM.hash);

		await expect(page.getByTestId('tx-result')).toContainText('Success');
		await expect(row(page, 'block')).toContainText('12153709');
		await expect(row(page, 'from')).toContainText('0xC2C8Ea7679B5119Fe934bc20262aC99D9497517C');
		await expect(row(page, 'to')).toContainText('0x858bc99d8b994496204160970e7898Ad1DFFe25c');
		await expect(row(page, 'value')).toContainText('0.0051 ETH');
		await expect(row(page, 'value')).toContainText('5100000000000000 wei');
		await expect(row(page, 'fee')).toContainText('0.0006138000032736 ETH');
		await expect(row(page, 'nonce')).toContainText('28803');
		await expect(row(page, 'input')).toContainText('0x');
		await expect(page.getByTestId('tx-result')).toContainText('from sepolia.gateway.tenderly.co');
	});

	test('Bitcoin: inputs and outputs instead of one sender and recipient', async ({ page }) => {
		await stub(page, 'https://mempool.space', () => [200, BTC.transaction]);
		await open(page);
		await lookUp(page, 'Bitcoin', BTC.txid);

		await expect(row(page, 'value')).toContainText('3.99977561 BTC');
		await expect(row(page, 'fee')).toContainText('15345 sats');
		await expect(row(page, 'from')).toHaveCount(0);
		await expect(page.getByTestId('tx-input-row')).toHaveCount(3);
		await expect(page.getByTestId('tx-output-row')).toHaveCount(2);
		await expect(page.getByTestId('tx-output-row').nth(1)).toContainText(
			'bc1phr2a55unpfk2sykn88s4sjuwfwja38phcakv7dtf7zvlt8glq7qq9grnym'
		);
	});

	test('Solana: slot, fee payer, recipient, lamports', async ({ page }) => {
		await stub(page, 'https://solana-rpc.publicnode.com', (request) =>
			method(request) === 'getSignatureStatuses' ? rpc(SOL_STATUS.result) : rpc(SOL.transaction)
		);
		await open(page);
		await lookUp(page, 'Solana', SOL.signature);

		await expect(row(page, 'block')).toContainText('Slot');
		await expect(row(page, 'block')).toContainText('470495358');
		await expect(row(page, 'value')).toContainText('0.002068605 SOL');
		await expect(row(page, 'value')).toContainText('2068605 lamports');
	});

	test('Tron: a failed call shows Failed, the reason, and the fee', async ({ page }) => {
		await stub(page, 'https://api.trongrid.io', (request) =>
			request.url().endsWith('gettransactionbyid') ? [200, TRON.transaction] : [200, TRON.info]
		);
		await open(page);
		await lookUp(page, 'Tron', TRON.txID);

		await expect(page.getByTestId('tx-result')).toContainText('Failed');
		await expect(row(page, 'result')).toContainText('OUT_OF_ENERGY');
		await expect(row(page, 'reason')).toContainText('Not enough energy');
		await expect(row(page, 'fee')).toContainText('0 TRX');
	});
});

test('FR-040 AC-3: a pending transaction shows confirmed-only fields as not available', async ({
	page
}) => {
	await stub(page, SEPOLIA, sepolia(EVM_PENDING.transaction, null));
	await open(page);
	await lookUp(page, 'Ethereum Sepolia', EVM_PENDING.hash);

	await expect(page.getByTestId('tx-result')).toContainText('Pending');
	for (const field of ['block', 'fee', 'gas-price']) {
		await expect(row(page, field)).toContainText('Not available while pending');
	}
	await expect(row(page, 'fee')).not.toContainText('0 ETH');
	await expect(row(page, 'value')).toContainText('0 ETH');
});

test.describe('FR-040 AC-4: the hash format is checked before any request', () => {
	const cases: [string, string, string][] = [
		['Ethereum', '0x1234', 'An EVM transaction hash is 0x followed by 64 hex characters.'],
		['Solana', EVM.hash, 'A Solana transaction signature is 64 bytes in Base58'],
		['Tron', SOL.signature, 'A Tron transaction ID is 64 hex characters.'],
		['Bitcoin', 'not a hash', 'A Bitcoin transaction ID is 64 hex characters.'],
		['Bitcoin', '', 'Paste a transaction hash.']
	];
	for (const [network, hash, message] of cases) {
		test(`${network}: "${hash}"`, async ({ page }) => {
			const requests: string[] = [];
			page.on('request', (r) => {
				if (!r.url().startsWith('http://localhost')) requests.push(r.url());
			});
			await open(page);
			await lookUp(page, network, hash);

			const field = page.getByLabel('Transaction hash');
			await expect(field).toHaveAttribute('aria-invalid', 'true');
			await expect(field).toHaveAccessibleDescription(new RegExp(message.replace(/[.]/g, '\\.')));
			await expect(page.getByTestId('tx-explorer')).toHaveCount(0);
			expect(requests).toEqual([]);
		});
	}

	test('accepts an EVM hash without 0x and in upper case, and sends the normal form', async ({
		page
	}) => {
		const seen = await stub(page, SEPOLIA, sepolia());
		await open(page);
		await lookUp(page, 'Ethereum Sepolia', EVM.hash.slice(2).toUpperCase());
		await expect(page.getByTestId('tx-result')).toBeVisible();
		expect(seen[1].postDataJSON().params).toEqual([EVM.hash]);
	});
});

test('FR-040 AC-5: leaving the page during a lookup aborts the request', async ({ page }) => {
	await stub(page, SEPOLIA, (request) => (method(request) === 'eth_chainId' ? 'hang' : rpc(null)));
	const failed = page.waitForEvent('requestfailed', (r) => r.url().startsWith(SEPOLIA));
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await open(page);
	await lookUp(page, 'Ethereum Sepolia', EVM.hash);
	await expect(page.getByRole('button', { name: 'Looking up…' })).toBeVisible();

	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Unit converter' })
		.click();

	await expect(page).toHaveURL(/\/units$/);
	await failed;
	expect(errors).toEqual([]);
});

test('FR-040 AC-6: no request after a lookup has completed', async ({ page }) => {
	const seen = await stub(page, SEPOLIA, sepolia());
	await open(page);
	await lookUp(page, 'Ethereum Sepolia', EVM.hash);
	await expect(page.getByTestId('tx-result')).toBeVisible();
	const after = seen.length;

	await page.waitForTimeout(3000);
	expect(seen.length).toBe(after);
});

test.describe('FR-042: error states, each with Retry and focus', () => {
	test('AC-1: not found names the network; Retry runs the same lookup again (AC-6)', async ({
		page
	}) => {
		let found = false;
		const seen = await stub(page, SEPOLIA, (request) =>
			method(request) === 'eth_getTransactionByHash' && !found ? rpc(null) : sepolia()(request)
		);
		await open(page);
		await lookUp(page, 'Ethereum Sepolia', EVM.hash);

		await expect(alert(page)).toContainText(
			'Transaction not found on Ethereum Sepolia. Check that the selected network is the one the transaction was sent on.'
		);
		await expect(alert(page)).toBeFocused();

		found = true;
		await page.getByRole('button', { name: 'Retry' }).click();
		await expect(page.getByTestId('tx-result')).toContainText('Success');
		await expect(alert(page)).toHaveCount(0);
		expect(seen.filter((r) => method(r) === 'eth_getTransactionByHash')).toHaveLength(2);
	});

	test('AC-1: not found on Solana mainnet adds the short-history hint', async ({ page }) => {
		await stub(page, 'https://solana-rpc.publicnode.com', () =>
			rpc({ context: { slot: 1 }, value: [null] })
		);
		await open(page);
		await lookUp(page, 'Solana', SOL.signature);
		await expect(alert(page)).toContainText('Transaction not found on Solana.');
		await expect(alert(page)).toContainText(
			'The default Solana endpoint keeps only the last few days of transactions.'
		);
	});

	const errors: [string, Reply, string][] = [
		[
			'AC-2: HTTP 429',
			[429, 'Too Many Requests'],
			'sepolia.gateway.tenderly.co is rate-limiting requests. Try again later or set your own endpoint in Settings.'
		],
		[
			'AC-2: a JSON-RPC rate-limit error',
			[200, { jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'limit exceeded' } }],
			'sepolia.gateway.tenderly.co is rate-limiting requests.'
		],
		[
			'AC-3: a connection failure (offline, DNS, CORS)',
			'fail',
			'Could not reach sepolia.gateway.tenderly.co. The request did not complete, so this says nothing about whether the transaction exists.'
		],
		[
			'AC-5: a response that is not JSON-RPC',
			[200, '<html>Gateway</html>'],
			'sepolia.gateway.tenderly.co returned a response QAnchor could not read.'
		]
	];
	for (const [name, reply, message] of errors) {
		test(name, async ({ page }) => {
			await stub(page, SEPOLIA, () => reply);
			await open(page);
			await lookUp(page, 'Ethereum Sepolia', EVM.hash);
			await expect(alert(page)).toContainText(message);
			await expect(alert(page)).toBeFocused();
			await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
			await expect(page.getByTestId('tx-result')).toHaveCount(0);
		});
	}

	test('AC-5: a transaction with missing fields is not shown as data', async ({ page }) => {
		const noValue = { ...EVM.transaction };
		delete noValue.value;
		await stub(page, SEPOLIA, sepolia(noValue));
		await open(page);
		await lookUp(page, 'Ethereum Sepolia', EVM.hash);
		await expect(alert(page)).toContainText('returned a response QAnchor could not read.');
		await expect(page.getByTestId('tx-result')).toHaveCount(0);
	});

	test('AC-4: no response within 10 seconds is a timeout', async ({ page }) => {
		await page.clock.install();
		await stub(page, SEPOLIA, () => 'hang');
		await open(page);
		await lookUp(page, 'Ethereum Sepolia', EVM.hash);
		await expect(page.getByRole('button', { name: 'Looking up…' })).toBeVisible();

		await page.clock.fastForward(9_000);
		await expect(alert(page)).toHaveCount(0);
		await page.clock.fastForward(1_100);
		await expect(alert(page)).toContainText(
			'No response from sepolia.gateway.tenderly.co within 10 seconds.'
		);
		await expect(alert(page)).toBeFocused();
	});

	test('FR-041 AC-4: an endpoint on another chain is a network mismatch, and nothing else is asked', async ({
		page
	}) => {
		const seen = await stub(page, SEPOLIA, () => rpc('0x89'));
		await open(page);
		await lookUp(page, 'Ethereum Sepolia', EVM.hash);
		await expect(alert(page)).toContainText(
			'This endpoint serves chain ID 137, but Ethereum Sepolia is chain ID 11155111.'
		);
		expect(seen.map(method)).toEqual(['eth_chainId']);
	});
});

test('FR-041 AC-3: a lookup goes to the endpoint saved in Settings', async ({ page }) => {
	const custom = 'https://rpc.example.dev';
	const defaults = await stub(page, SEPOLIA, sepolia());
	const overrides = await stub(page, custom, sepolia());
	await page.goto('/settings');
	await appOpened(page);
	await page.locator('[data-network="eth-sepolia"]').getByRole('button', { name: /^Edit/ }).click();
	await page.getByRole('textbox', { name: 'Endpoint URL for Ethereum Sepolia' }).fill(custom);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('[data-network="eth-sepolia"]')).toContainText('Custom');

	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Tx lookup' })
		.click();
	await expect(page).toHaveURL(/\/tx$/);
	await lookUp(page, 'Ethereum Sepolia', EVM.hash);

	await expect(page.getByTestId('tx-result')).toContainText('from rpc.example.dev (your endpoint)');
	expect(overrides).toHaveLength(3);
	expect(defaults).toHaveLength(0);
});

test.describe('FR-043: open in explorer', () => {
	test('a valid hash gets an explorer link that opens in a new tab with no opener', async ({
		page
	}) => {
		await open(page);
		await page.getByLabel('Network', { exact: true }).selectOption({ label: 'Solana Devnet' });
		await page.getByLabel('Transaction hash').fill(SOL.signature);

		const link = page.getByRole('link', { name: /Open in explorer/ });
		await expect(link).toHaveAttribute(
			'href',
			`https://explorer.solana.com/tx/${SOL.signature}?cluster=devnet`
		);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	test('the link uses the normal form of the hash for the selected network', async ({ page }) => {
		await open(page);
		await page.getByLabel('Network', { exact: true }).selectOption({ label: 'Bitcoin Testnet4' });
		await page.getByLabel('Transaction hash').fill(`0x${BTC.txid.toUpperCase()}`);
		await expect(page.getByRole('link', { name: /Open in explorer/ })).toHaveAttribute(
			'href',
			`https://mempool.space/testnet4/tx/${BTC.txid}`
		);
		await page.getByLabel('Network', { exact: true }).selectOption({ label: 'Solana' });
		await expect(page.getByRole('link', { name: /Open in explorer/ })).toHaveCount(0);
	});
});

test.describe('accessibility (NFR-009)', () => {
	test('the result has no WCAG 2.1 AA violations', async ({ page }) => {
		await stub(page, 'https://mempool.space', () => [200, BTC.transaction]);
		await open(page);
		await lookUp(page, 'Bitcoin', BTC.txid);
		await expect(page.getByTestId('tx-output-row')).toHaveCount(2);
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
	});

	test('the error state has no WCAG 2.1 AA violations', async ({ page }) => {
		await stub(page, SEPOLIA, () => 'fail');
		await open(page);
		await lookUp(page, 'Ethereum Sepolia', EVM.hash);
		await expect(alert(page)).toHaveCount(1);
		await settled(page);
		expect(await scanA11y(page)).toEqual([]);
	});

	test('a lookup works from the keyboard alone', async ({ page }) => {
		await stub(page, SEPOLIA, sepolia());
		await open(page);
		await page.getByLabel('Network', { exact: true }).focus();
		await page.keyboard.press('Tab');
		await expect(page.getByLabel('Transaction hash')).toBeFocused();
		await page.getByLabel('Network', { exact: true }).selectOption({ label: 'Ethereum Sepolia' });
		await page.getByLabel('Transaction hash').focus();
		await page.keyboard.type(EVM.hash);
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('tx-result')).toContainText('Success');
	});
});
