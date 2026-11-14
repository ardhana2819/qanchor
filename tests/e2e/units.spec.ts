import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { appOpened } from './helpers.ts';

// Unit converter (T-013): FR-030 to FR-032, US-004, design S-04. The conversion rules themselves
// are unit-tested in src/lib/core; this checks typing, errors, and the page around them.

const MAX_UINT256 = (2n ** 256n - 1n).toString();

async function openConverter(page: Page): Promise<void> {
	await page.goto('/units');
	// Typing before hydration would not convert; the layout opens storage once it is live.
	await appOpened(page);
}

const field = (page: Page, unit: string) => page.getByRole('textbox', { name: unit, exact: true });

async function family(page: Page, name: string): Promise<void> {
	await page.getByRole('radio', { name }).check();
}

test('the converter is the first tool in the navigation and on the index (FR-001 AC-1, AC-7)', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByRole('main').getByRole('link', { name: 'Unit converter' })).toBeVisible();

	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Unit converter' })
		.click();

	await expect(page).toHaveURL(/\/units$/);
	await expect(page).toHaveTitle('Unit converter · QAnchor');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unit converter');
	await expect(page.getByRole('link', { name: 'Unit converter' })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('typing in one field updates the others exactly (FR-030 AC-1, AC-2)', async ({ page }) => {
	await openConverter(page);

	await field(page, 'ether').fill('1');
	await expect(field(page, 'gwei')).toHaveValue('1000000000');
	await expect(field(page, 'wei')).toHaveValue('1000000000000000000');

	await field(page, 'gwei').fill('1.5');
	await expect(field(page, 'ether')).toHaveValue('0.0000000015');
	await expect(field(page, 'wei')).toHaveValue('1500000000');
	// The field being typed in keeps the text as typed.
	await expect(field(page, 'gwei')).toHaveValue('1.5');
});

for (const [name, display, base, expected] of [
	['Bitcoin', 'BTC', 'sats', '100000000'],
	['Solana', 'SOL', 'lamports', '1000000000'],
	['Tron', 'TRX', 'sun', '1000000']
] as const) {
	test(`1 ${display} is ${expected} ${base} (FR-030 AC-2)`, async ({ page }) => {
		await openConverter(page);
		await family(page, name);

		await field(page, display).fill('1');

		await expect(field(page, base)).toHaveValue(expected);
	});
}

test('0.1 ether converts with no rounding artefacts (FR-030 AC-3)', async ({ page }) => {
	await openConverter(page);

	await field(page, 'ether').fill('0.1');

	await expect(field(page, 'wei')).toHaveValue('100000000000000000');
});

test('2^256 - 1 wei is shown in full in every unit (FR-030 AC-4)', async ({ page }) => {
	await openConverter(page);

	await field(page, 'wei').fill(MAX_UINT256);

	await expect(field(page, 'ether')).toHaveValue(
		`${MAX_UINT256.slice(0, -18)}.${MAX_UINT256.slice(-18)}`
	);
	await expect(field(page, 'gwei')).toHaveValue(
		`${MAX_UINT256.slice(0, -9)}.${MAX_UINT256.slice(-9)}`
	);
});

const INVALID: [string, string, string][] = [
	['wei', '0.5', 'wei has no decimal places.'],
	['gwei', '0.0000000001', 'gwei allows at most 9 decimal places.'],
	['ether', '1,5', 'Use . as the decimal separator and no thousands separators.'],
	['ether', '1,000', 'Use . as the decimal separator and no thousands separators.'],
	['ether', '-1', 'Amounts cannot be negative.'],
	['ether', '1e-7', 'Write the number in full; scientific notation is not supported.'],
	['ether', 'abc', 'Enter a number, for example 1.5.'],
	['ether', '+1', 'Remove the + sign.']
];

for (const [unit, input, message] of INVALID) {
	test(`${input} in ${unit} shows "${message}" and changes no other field (FR-031)`, async ({
		page
	}) => {
		await openConverter(page);
		await field(page, 'ether').fill('2');

		await field(page, unit).fill(input);

		await expect(field(page, unit)).toHaveAttribute('aria-invalid', 'true');
		await expect(field(page, unit)).toHaveAccessibleDescription(message);
		const others = ['ether', 'gwei', 'wei'].filter((u) => u !== unit);
		const before: Record<string, string> = {
			ether: '2',
			gwei: '2000000000',
			wei: '2000000000000000000'
		};
		for (const other of others) {
			await expect(field(page, other)).toHaveValue(before[other]);
			await expect(field(page, other)).not.toHaveAttribute('aria-invalid');
		}
	});
}

test('fixing an invalid value clears the error and converts (FR-031)', async ({ page }) => {
	await openConverter(page);
	await field(page, 'ether').fill('1,5');
	await expect(page.locator('.units .error')).toHaveCount(1);

	await field(page, 'ether').fill('1.5');

	await expect(page.locator('.units .error')).toHaveCount(0);
	await expect(field(page, 'ether')).not.toHaveAttribute('aria-invalid');
	await expect(field(page, 'gwei')).toHaveValue('1500000000');
});

test('clearing a field clears every field, with no error (FR-031 AC-2)', async ({ page }) => {
	await openConverter(page);
	await field(page, 'ether').fill('1');
	await field(page, 'ether').fill('abc');

	await field(page, 'ether').fill('');

	for (const unit of ['ether', 'gwei', 'wei']) await expect(field(page, unit)).toHaveValue('');
	await expect(field(page, 'ether')).not.toHaveAttribute('aria-invalid');
	await expect(page.locator('.units .error')).toHaveCount(0);
});

test('surrounding whitespace is trimmed (EC-013)', async ({ page }) => {
	await openConverter(page);

	await field(page, 'ether').fill('  1  ');

	await expect(field(page, 'wei')).toHaveValue('1000000000000000000');
	await expect(field(page, 'ether')).not.toHaveAttribute('aria-invalid');
	await expect(field(page, 'ether')).toHaveValue('  1  ');
});

test('switching the family starts from empty fields', async ({ page }) => {
	await openConverter(page);
	await field(page, 'ether').fill('1');

	await family(page, 'Bitcoin');

	await expect(field(page, 'BTC')).toHaveValue('');
	await expect(field(page, 'sats')).toHaveValue('');
	await expect(field(page, 'ether')).toHaveCount(0);

	await family(page, 'Ethereum');
	await expect(field(page, 'ether')).toHaveValue('');
});

test('a custom token converts both ways with its decimals (FR-032 AC-1)', async ({ page }) => {
	await openConverter(page);
	await family(page, 'Custom token');
	const decimals = page.getByRole('textbox', { name: 'Decimals' });
	await expect(decimals).toHaveValue('18');

	await decimals.fill('6');
	await field(page, 'base units').fill('1500000');
	await expect(field(page, 'token')).toHaveValue('1.5');

	await field(page, 'token').fill('2.25');
	await expect(field(page, 'base units')).toHaveValue('2250000');
});

test('changing the decimals reconverts from the field last typed in (FR-032)', async ({ page }) => {
	await openConverter(page);
	await family(page, 'Custom token');
	const decimals = page.getByRole('textbox', { name: 'Decimals' });
	await decimals.fill('6');
	await field(page, 'base units').fill('1500000');

	await decimals.fill('2');

	await expect(field(page, 'base units')).toHaveValue('1500000');
	await expect(field(page, 'token')).toHaveValue('15000');
	await expect(page.getByText('10² base units')).toBeVisible();
});

test('invalid decimals show an error and convert nothing (FR-032, EC-012)', async ({ page }) => {
	await openConverter(page);
	await family(page, 'Custom token');
	const decimals = page.getByRole('textbox', { name: 'Decimals' });
	await decimals.fill('6');
	await field(page, 'token').fill('1');
	await expect(field(page, 'base units')).toHaveValue('1000000');

	await decimals.fill('37');
	await expect(decimals).toHaveAccessibleDescription(
		/Decimals must be a whole number from 0 to 36\./
	);
	await field(page, 'token').fill('2');
	await expect(field(page, 'base units')).toHaveValue('1000000');

	await decimals.fill('0');
	await expect(field(page, 'base units')).toHaveValue('2');
});

test('decimals 0 allow no fractional token value (EC-012)', async ({ page }) => {
	await openConverter(page);
	await family(page, 'Custom token');
	await page.getByRole('textbox', { name: 'Decimals' }).fill('0');

	await field(page, 'token').fill('0.5');

	await expect(field(page, 'token')).toHaveAccessibleDescription('token has no decimal places.');
});

test('copy buttons are disabled until their field has a value, then copy it', async ({ page }) => {
	await page.addInitScript(() => {
		navigator.clipboard.writeText = async (text: string) => {
			(window as unknown as { copied: string[] }).copied ??= [];
			(window as unknown as { copied: string[] }).copied.push(text);
		};
	});
	await openConverter(page);
	const copyWei = page.getByRole('button', { name: 'Copy wei' });
	await expect(copyWei).toBeDisabled();

	await field(page, 'ether').fill('0.1');
	await copyWei.click();

	await expect(page.locator('.toast')).toHaveText('Copied');
	expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
		'100000000000000000'
	]);
});

test('the keyboard reaches the family, every unit field, and its copy button', async ({ page }) => {
	await openConverter(page);
	await page.getByRole('radio', { name: 'Ethereum' }).focus();

	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('radio', { name: 'Bitcoin' })).toBeChecked();

	await page.keyboard.press('Tab');
	await expect(field(page, 'BTC')).toBeFocused();
	await page.keyboard.type('1');
	await expect(field(page, 'sats')).toHaveValue('100000000');
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Copy BTC' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(field(page, 'sats')).toBeFocused();
});

// The panel is a <form> with several fields and no submit button, so the browser never submits it.
test('Enter in a field does not submit or reload the page', async ({ page }) => {
	await openConverter(page);
	await field(page, 'ether').fill('1');

	await field(page, 'ether').press('Enter');

	await expect(page).toHaveURL(/\/units$/);
	await expect(field(page, 'wei')).toHaveValue('1000000000000000000');
});

test('on a phone the family is a select with the same behaviour', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await openConverter(page);
	await expect(page.getByRole('radio', { name: 'Bitcoin' })).toBeHidden();

	await page.getByRole('combobox', { name: 'Unit family' }).selectOption('Solana');
	await field(page, 'SOL').fill('1');

	await expect(field(page, 'lamports')).toHaveValue('1000000000');
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBe(0);
});

test.describe('small-screen menu', () => {
	test.use({ viewport: { width: 800, height: 700 } });

	test('opens from the Menu button, navigates, and closes after navigating', async ({ page }) => {
		await page.goto('/');
		const menu = page.getByText('Menu', { exact: true });
		const link = page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Unit converter' });
		await expect(link).toBeHidden();

		await menu.click();
		await expect(link).toBeVisible();
		await link.click();

		await expect(page).toHaveURL(/\/units$/);
		await expect(link).toBeHidden();
	});

	test('opens from the keyboard', async ({ page }) => {
		await page.goto('/');
		await page.getByText('Menu', { exact: true }).focus();

		await page.keyboard.press('Enter');

		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Unit converter' })
		).toBeVisible();
	});

	test('the menu fades and drops in once (design 2.4)', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.goto('/');

		await page.getByText('Menu', { exact: true }).click();

		const animations = await page.locator('.menu-panel').evaluate((el) =>
			el.getAnimations().map((a) => ({
				name: (a as CSSAnimation).animationName,
				duration: a.effect?.getTiming().duration
			}))
		);
		// Svelte scopes the keyframes name, so only its suffix is stable.
		expect(animations).toEqual([{ name: expect.stringMatching(/menu-open$/), duration: 240 }]);
		await page
			.locator('.menu-panel')
			.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
		await expect(page.locator('.menu-panel')).toHaveCSS('opacity', '1');
	});

	test('with reduced motion the menu appears at once', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');

		await page.getByText('Menu', { exact: true }).click();

		await expect(page.locator('.menu-panel')).toHaveCSS('animation-duration', '0s');
		await expect(page.locator('.menu-panel')).toHaveCSS('opacity', '1');
	});
});

const scan = async (page: Page) =>
	(
		await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
	).violations.map((v) => `${v.id}: ${v.nodes[0].target}`);

test('the converter has no WCAG 2.1 AA violations, with values and an error', async ({ page }) => {
	await openConverter(page);
	await field(page, 'ether').fill('1');
	await field(page, 'wei').fill('0.5');

	expect(await scan(page)).toEqual([]);
});

test('the custom-token form has no WCAG 2.1 AA violations', async ({ page }) => {
	await openConverter(page);
	await family(page, 'Custom token');
	await page.getByRole('textbox', { name: 'Decimals' }).fill('99');

	expect(await scan(page)).toEqual([]);
});
