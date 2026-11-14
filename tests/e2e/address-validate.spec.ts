import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { appOpened } from './helpers.ts';

// Address generator, Validate tab (T-022): FR-014 AC-1 to AC-6, US-012, EC-007. The verdict logic
// is unit-tested in src/lib/core/chains/verdict.test.ts; this checks the tab and its behaviour.

async function openValidate(page: Page): Promise<void> {
	await page.goto('/address');
	await appOpened(page);
	await page.getByRole('tab', { name: 'Validate' }).click();
}

const input = (page: Page) => page.getByRole('textbox', { name: 'Address', exact: true });
const verdict = (page: Page) => page.getByRole('status', { name: 'Verdict' });

test('the page has Generate and Validate tabs; Generate is selected first', async ({ page }) => {
	await page.goto('/address');
	await expect(page.getByRole('tab', { name: 'Generate', selected: true })).toBeVisible();

	await page.getByRole('tab', { name: 'Generate' }).focus();
	await page.keyboard.press('ArrowRight');

	await expect(page.getByRole('tab', { name: 'Validate', selected: true })).toBeFocused();
	await expect(input(page)).toBeVisible();
	await expect(page.getByRole('button', { name: /^Generat/ })).toBeHidden();
});

test('switching tabs keeps the generated rows and the pasted address', async ({ page }) => {
	await page.goto('/address');
	await appOpened(page);
	await page.getByRole('textbox', { name: 'Valid addresses' }).fill('3');
	await page.getByRole('button', { name: 'Generate' }).click();
	const rows = page.getByRole('table', { name: 'Generated addresses' }).locator('tbody tr');
	await expect(rows).toHaveCount(3);
	const first = await rows.first().locator('td').nth(1).textContent();

	await page.getByRole('tab', { name: 'Validate' }).click();
	await input(page).fill(first!);
	await expect(verdict(page)).toContainText('EVM · any network');
	await page.getByRole('tab', { name: 'Generate' }).click();

	await expect(rows).toHaveCount(3);
	await page.getByRole('tab', { name: 'Validate' }).click();
	await expect(input(page)).toHaveValue(first!);
});

test('a valid address shows its chain, type, and network (FR-014 AC-1)', async ({ page }) => {
	await openValidate(page);

	await input(page).fill('2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2');

	await expect(verdict(page)).toContainText('Valid');
	await expect(verdict(page)).toContainText('Bitcoin · P2SH · testnet');
});

test('an EVM address says the format cannot tell its networks apart (FR-014 AC-2)', async ({
	page
}) => {
	await openValidate(page);

	await input(page).fill('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');

	await expect(verdict(page)).toContainText('EVM · any network');
	await expect(verdict(page)).toContainText('the format alone cannot tell them apart');
});

test('a risky address is valid but marked risky (EC-004)', async ({ page }) => {
	await openValidate(page);

	await input(page).fill('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');

	await expect(verdict(page)).toContainText('Risky');
	await expect(verdict(page)).toContainText(
		'No EIP-55 checksum, so a typo in it cannot be detected.'
	);
	await expect(verdict(page)).not.toContainText('Invalid');
});

for (const [text, defect, closest] of [
	['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD', 'Checksum does not match.', 'EVM · any network'],
	[
		'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
		'Bech32 and Bech32m are mixed up',
		'Bitcoin · P2TR · mainnet'
	],
	['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u', 'Checksum does not match.', 'Tron · any network']
] as const) {
	test(`${text.slice(0, 12)}…: names the defect and the closest format (FR-014 AC-3)`, async ({
		page
	}) => {
		await openValidate(page);

		await input(page).fill(text);

		await expect(verdict(page)).toContainText('Not valid for any supported chain.');
		await expect(verdict(page)).toContainText(defect);
		await expect(verdict(page)).toContainText(`Closest match: ${closest}.`);
	});
}

test('whitespace is reported, not trimmed silently, with the trimmed verdict (FR-014 AC-4)', async ({
	page
}) => {
	await openValidate(page);

	await input(page).fill('  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t ');

	await expect(verdict(page)).toContainText('Whitespace before or after the address.');
	await expect(verdict(page)).toContainText('Without them:');
	await expect(verdict(page)).toContainText('Tron · any network');
	await expect(input(page)).toHaveValue('  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t ');
});

test('an invisible character is named with its position (FR-014 AC-4)', async ({ page }) => {
	await openValidate(page);

	await input(page).fill('TR7NH\u200bqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');

	await expect(verdict(page)).toContainText(
		'An invisible character, U+200B ZERO WIDTH SPACE, at position 6.'
	);
	await expect(verdict(page)).toContainText('Tron · any network');
});

test('clearing the field shows no verdict and no error (FR-014 AC-5)', async ({ page }) => {
	await openValidate(page);
	await input(page).fill('hello');
	await expect(verdict(page)).toContainText('Not valid for any supported chain.');

	await input(page).fill('');

	await expect(verdict(page)).toBeEmpty();
	await expect(input(page)).not.toHaveAttribute('aria-invalid');
});

test('validating makes no request beyond loading the validator code (FR-014 AC-6)', async ({
	page
}) => {
	await openValidate(page);
	const requests: Request[] = [];
	page.on('request', (request) => requests.push(request));

	for (const text of [
		'0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
		'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
		'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
		'not an address'
	]) {
		await input(page).fill(text);
		await expect(verdict(page)).not.toBeEmpty();
	}

	const origin = new URL(page.url()).origin;
	expect(requests.filter((r) => new URL(r.url()).origin !== origin).map((r) => r.url())).toEqual(
		[]
	);
	expect(requests.filter((r) => ['fetch', 'xhr'].includes(r.resourceType()))).toEqual([]);
	// Only the validator's own JavaScript, once.
	expect(requests.every((r) => r.resourceType() === 'script' && r.url().includes('/_app/'))).toBe(
		true
	);
});

test('a new verdict fades in once; with reduced motion it appears at once (design 2.4)', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await openValidate(page);
	await input(page).fill('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
	const panel = verdict(page).locator('.panel');
	await expect(panel).toBeVisible();
	await expect(panel).toHaveCSS('animation-duration', '0.12s');

	await page.emulateMedia({ reducedMotion: 'reduce' });
	await input(page).fill('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u');
	await expect(verdict(page).locator('.panel')).toHaveCSS('animation-duration', '0s');
});

const scan = async (page: Page) =>
	(
		await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
	).violations.map((v) => `${v.id}: ${v.nodes[0].target}`);

for (const [state, text] of [
	['valid', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'],
	['invalid with whitespace', ' bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd']
] as const) {
	test(`the Validate tab has no WCAG 2.1 AA violations (${state})`, async ({ page }) => {
		await openValidate(page);
		await input(page).fill(text);
		await expect(verdict(page)).not.toBeEmpty();
		await verdict(page).evaluate((el) =>
			Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
		);

		expect(await scan(page)).toEqual([]);
	});
}
