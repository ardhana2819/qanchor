import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { appOpened, putRecords, seedCases, testCase, testResult, testRun } from './helpers.ts';

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

test('tx lookup', async ({ page }) => {
	await page.route('https://mempool.space/**', async (route) => {
		const body = readFileSync('src/lib/core/tx/fixtures/bitcoin-confirmed.json', 'utf8');
		await route.fulfill({
			headers: { 'access-control-allow-origin': '*' },
			body: JSON.stringify(JSON.parse(body).transaction)
		});
	});
	await page.goto('/tx');
	await appOpened(page);
	await once(page, ['tx-network', 'tx-hash', 'tx-lookup', 'tx-progress']);

	await page.getByTestId('tx-network').selectOption('bitcoin');
	await page
		.getByTestId('tx-hash')
		.fill('ac634c3e67938e3ae0c0ee8471dcb1db9712c10d014054fea7aea3f6e443d933');
	await once(page, ['tx-explorer']);
	await page.getByTestId('tx-lookup').click();
	await once(page, ['tx-result']);
	await each(page, 'tx-row', 7);
	await each(page, 'tx-input-row', 3);
	await each(page, 'tx-output-row', 2);

	await page.unrouteAll();
	await page.route('https://mempool.space/**', (route) => route.abort('failed'));
	await page.getByTestId('tx-lookup').click();
	await once(page, ['tx-error', 'tx-retry']);
});

test('calldata decoder', async ({ page }) => {
	const word = (n: number) => n.toString(16).padStart(64, '0');
	const transfer = `0xa9059cbb${word(1)}${word(2)}`;
	await page.goto('/calldata');
	await appOpened(page);
	await once(page, ['calldata-input', 'calldata-abi', 'calldata-decode']);

	await page.getByTestId('calldata-input').fill(`${transfer}ff`);
	await page.getByTestId('calldata-decode').click();
	await once(page, [
		'calldata-result',
		'calldata-signature',
		'calldata-function',
		'calldata-selector',
		'calldata-extra'
	]);
	await each(page, 'calldata-arg-row', 2);

	await page.getByTestId('calldata-input').fill(`0xdeadbeef${word(1)}`);
	await page.getByTestId('calldata-decode').click();
	await once(page, ['calldata-unknown']);
	await each(page, 'calldata-word-row', 1);

	await page.getByTestId('calldata-input').fill('0x');
	await page.getByTestId('calldata-decode').click();
	await once(page, ['calldata-no-selector']);

	await page.getByTestId('calldata-input').fill(transfer);
	await page.getByTestId('calldata-abi').fill('approve(address,uint256)');
	await page.getByTestId('calldata-decode').click();
	await once(page, ['calldata-error']);
});

test('tx lookup hand-off to the calldata decoder', async ({ page }) => {
	const call = JSON.parse(readFileSync('src/lib/core/tx/fixtures/evm-success-call.json', 'utf8'));
	const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
	await page.route('https://sepolia.gateway.tenderly.co/**', async (route) => {
		if (route.request().method() === 'OPTIONS')
			return route.fulfill({ status: 204, headers: cors });
		const method = route.request().postDataJSON()?.method;
		const result =
			method === 'eth_chainId'
				? '0xaa36a7'
				: method === 'eth_getTransactionByHash'
					? call.transaction
					: call.receipt;
		await route.fulfill({ headers: cors, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) });
	});
	await page.goto('/tx');
	await appOpened(page);
	await page.getByTestId('tx-network').selectOption('eth-sepolia');
	await page.getByTestId('tx-hash').fill(call.hash);
	await page.getByTestId('tx-lookup').click();
	await once(page, ['tx-decode-input']);
});

test('testnet wallets', async ({ page }) => {
	await page.goto('/wallets');
	await appOpened(page);
	await once(page, ['wallets-add', 'wallets-count', 'wallets-empty']);

	await page.getByTestId('wallets-add').click();
	await once(page, [
		'wallets-form',
		'wallets-label',
		'wallets-chain',
		'wallets-network',
		'wallets-address',
		'wallets-notes',
		'wallets-save'
	]);
	const address = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
	await page.getByTestId('wallets-label').fill('One');
	await page.getByTestId('wallets-address').fill(address);
	await page.getByTestId('wallets-save').click();
	await each(page, 'wallets-row', 1);
	await each(page, 'wallets-edit', 1);
	await each(page, 'wallets-delete', 1);
	await each(page, 'wallets-address-cell', 1);
	await each(page, 'wallets-balance', 1);
	await each(page, 'wallets-refresh', 1);
	// No endpoint is reached in this test: the refresh fails and shows its error.
	await page.route(
		(url) => url.hostname !== 'localhost',
		(route) => route.abort()
	);
	await page.getByTestId('wallets-refresh').click();
	await once(page, ['wallets-balance-error']);

	await page.getByTestId('wallets-add').click();
	await page.getByTestId('wallets-label').fill('Two');
	await page.getByTestId('wallets-address').fill(address);
	await page.getByTestId('wallets-save').click();
	await once(page, ['wallets-duplicate']);
	await page.keyboard.press('Escape');

	await page.getByTestId('wallets-delete').click();
	await once(page, ['wallets-confirm-delete']);
	await page.keyboard.press('Escape');

	await each(page, 'wallets-faucets', 1);
	await page.getByTestId('wallets-faucets').locator('summary').click();
	await each(page, 'wallets-faucet-link', 3);
	await page.getByTestId('wallets-faucet-add').click();
	await once(page, [
		'wallets-faucet-form',
		'wallets-faucet-url',
		'wallets-faucet-label',
		'wallets-faucet-save'
	]);
	await page.getByTestId('wallets-faucet-url').fill('https://faucet.example.dev');
	await page.getByTestId('wallets-faucet-save').click();
	await each(page, 'wallets-own-faucet', 1);
	await each(page, 'wallets-faucet-remove', 1);

	// A mainnet entry, as an imported backup can hold: no faucet is listed.
	await putRecords(page, 'wallets', [
		{
			id: 'mainnet',
			label: 'Mainnet',
			chain: 'evm',
			networkId: 'eth',
			address,
			notes: '',
			createdAt: 1,
			updatedAt: 1
		}
	]);
	await page.reload();
	await appOpened(page);
	await page.getByTestId('wallets-faucets').first().locator('summary').click();
	await once(page, ['wallets-no-faucet']);
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

/** Two cases and a run of both, one failed, for the QA pages. */
async function seedQa(page: Page): Promise<void> {
	await page.goto('/');
	await appOpened(page);
	await seedCases(page, [testCase(1, { tags: ['smoke'] }), testCase(2)] as { number: number }[]);
	const run = testRun('run-1', [1, 2], { environment: 'Pixel 7' });
	run.cases[0] = { ...run.cases[0], preconditions: 'A funded wallet', expected: 'It works' };
	await putRecords(page, 'runs', [run]);
	await putRecords(page, 'results', [
		{ ...testResult('run-1', 1, 'fail'), linkedIssue: 'https://jira.example.dev/PAY-1' }
	]);
}

const loaded = (page: Page) => expect(page.locator('[data-testid$="-loading"]')).toHaveCount(0);

test('test cases', async ({ page }) => {
	await seedQa(page);
	await page.goto('/cases');
	await loaded(page);
	await once(page, [
		'cases-new',
		'cases-filter',
		'cases-tags',
		'cases-priority',
		'cases-count',
		'cases-new-run'
	]);
	await each(page, 'cases-row', 2);
	await each(page, 'cases-duplicate', 2);
	await each(page, 'cases-delete', 2);
	await page.getByTestId('cases-delete').first().click();
	await once(page, ['cases-delete-runs', 'cases-confirm-delete']);
	await page.keyboard.press('Escape');

	await page.getByTestId('cases-filter').fill('nothing');
	await once(page, ['cases-no-match', 'cases-clear-filters']);
});

test('test case editor', async ({ page }) => {
	await seedQa(page);
	await page.goto('/cases/edit?id=case-1');
	await loaded(page);
	await once(page, [
		'case-editor-key',
		'case-editor-title',
		'case-editor-priority',
		'case-editor-tags-input',
		'case-editor-preconditions',
		'case-editor-add-step',
		'case-editor-expected',
		'case-editor-cancel',
		'case-editor-save',
		'case-editor-duplicate',
		'case-editor-delete'
	]);
	await each(page, 'case-editor-tags-chip', 1);
	await each(page, 'case-editor-step', 1);
	await each(page, 'case-editor-step-action', 1);
	await each(page, 'case-editor-step-expected', 1);
	await each(page, 'case-editor-step-insert', 1);
	await page.getByTestId('case-editor-step-insert').click();
	await once(page, [
		'case-editor-insert-target',
		'case-editor-insert-chain',
		'case-editor-insert-sample',
		'case-editor-insert-preview',
		'case-editor-insert-another',
		'case-editor-insert-confirm'
	]);
	await page.getByRole('radio', { name: 'Amount' }).check();
	await once(page, ['case-editor-insert-preset', 'case-editor-insert-amount']);
	await page.getByRole('radio', { name: 'Dummy data' }).check();
	await once(page, ['case-editor-insert-field']);
	await page.keyboard.press('Escape');

	await page.getByTestId('case-editor-title').fill('Changed');
	await once(page, ['case-editor-status']);
	await page.getByTestId('case-editor-cancel').click();
	await once(page, ['case-editor-keep-editing', 'case-editor-discard']);
	await page.getByTestId('case-editor-keep-editing').click();

	await page.getByTestId('case-editor-delete').click();
	await once(page, ['case-editor-delete-runs', 'case-editor-confirm-delete']);
	await page.keyboard.press('Escape');

	await page.goto('/cases/edit?id=missing');
	await once(page, ['case-editor-not-found']);
});

test('test runs and New run', async ({ page }) => {
	await seedQa(page);
	await page.goto('/runs');
	await loaded(page);
	await once(page, ['runs-new', 'runs-count']);
	await each(page, 'runs-row', 1);
	await each(page, 'runs-delete', 1);
	await page.getByTestId('runs-delete').click();
	await once(page, ['runs-delete-results', 'runs-confirm-delete']);
	await page.keyboard.press('Escape');

	await page.goto('/runs/new');
	await loaded(page);
	await once(page, [
		'new-run-name',
		'new-run-release',
		'new-run-environment',
		'new-run-filter',
		'new-run-tags',
		'new-run-priority',
		'new-run-count',
		'new-run-select-all',
		'new-run-selected',
		'new-run-problem',
		'new-run-cancel',
		'new-run-create'
	]);
	await each(page, 'new-run-row', 2);
	await each(page, 'new-run-select', 2);
	await page.getByTestId('new-run-filter').fill('nothing');
	await once(page, ['new-run-no-match']);
});

test('run execution', async ({ page }) => {
	await seedQa(page);
	await page.goto('/runs/view?id=run-1');
	await loaded(page);
	await once(page, [
		'run-name',
		'run-environment',
		'run-counts',
		'run-shortcuts',
		'run-copy-summary',
		'run-complete',
		'run-case-list-toggle',
		'run-case-filter',
		'run-case-key',
		'run-case-position',
		'run-previous',
		'run-next',
		'run-preconditions',
		'run-expected',
		'run-result',
		'run-failed-step',
		'run-linked-issue',
		'run-issue-link',
		'run-actual',
		'run-notes',
		'run-save-status'
	]);
	await each(page, 'run-case-row', 2);
	await each(page, 'run-step', 1);

	await page
		.getByTestId('run-result')
		.getByRole('radio', { name: /^Blocked/ })
		.check();
	await once(page, ['run-reason', 'run-save-result']);
	await page.getByTestId('run-case-filter').selectOption('blocked');
	await once(page, ['run-no-cases']);

	await page.getByTestId('run-shortcuts').click();
	await once(page, ['run-shortcut-list']);
	await page.keyboard.press('Escape');
	await page.getByTestId('run-complete').click();
	await once(page, ['run-complete-body', 'run-confirm-complete']);
	await page.getByTestId('run-confirm-complete').click();
	await once(page, ['run-reopen']);

	await page.goto('/runs/view?id=missing');
	await once(page, ['run-not-found']);
});

test('app shell', async ({ page }) => {
	await page.goto('/');
	await once(page, ['app-toast']);
});
