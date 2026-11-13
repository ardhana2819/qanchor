import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// The UI primitives (T-008) on their reference page, /components.

const form = (page: Page) => page.getByRole('form', { name: 'Example form' });
const count = (page: Page) => page.getByRole('textbox', { name: 'Count' });
const submit = (page: Page) => form(page).getByRole('button', { name: /^Generat/ });
const tab = (page: Page, name: string) =>
	page.getByRole('tablist', { name: 'Mode' }).getByRole('tab', { name });

async function left(locator: Locator): Promise<number> {
	return Math.round((await locator.boundingBox())!.x);
}

test.beforeEach(async ({ page }) => {
	await page.goto('/components');
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations in ${colorScheme} mode (NFR-009)`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		await page.reload();

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();

		expect(results.violations.map((v) => `${v.id}: ${v.nodes[0].target}`)).toEqual([]);
	});
}

test('a field links its label, hint, and error to the control', async ({ page }) => {
	await expect(count(page)).toHaveAccessibleDescription('1 to 500 per generation.');
	await expect(count(page)).not.toHaveAttribute('aria-invalid');

	await count(page).fill('0');

	await expect(count(page)).toHaveAttribute('aria-invalid', 'true');
	await expect(count(page)).toHaveAccessibleDescription(
		'Enter a whole number from 1 to 500. 1 to 500 per generation.'
	);
	await expect(submit(page)).toBeDisabled();

	await count(page).fill('500');
	await expect(count(page)).not.toHaveAttribute('aria-invalid');
	await expect(submit(page)).toBeEnabled();
});

test('a loading button is busy and disabled, and says what is happening', async ({ page }) => {
	await submit(page).click();

	await expect(submit(page)).toHaveText('Generating…');
	await expect(submit(page)).toHaveAttribute('aria-busy', 'true');
	await expect(submit(page)).toBeDisabled();

	await expect(submit(page)).toHaveText('Generate');
	await expect(submit(page)).not.toHaveAttribute('aria-busy');
});

test('a checkbox group has a name and reports an empty selection', async ({ page }) => {
	const group = page.getByRole('group', { name: 'Invalid variants' });
	await expect(group.getByRole('checkbox', { name: 'Leading whitespace' })).toBeDisabled();

	await group.getByRole('checkbox', { name: 'Wrong checksum' }).uncheck();

	await expect(group).toHaveAccessibleDescription('Select at least one variant.');
	await expect(submit(page)).toBeDisabled();
	await expect(form(page)).toContainText('0 variants selected');
});

test('a select keeps native keyboard behaviour and its hint', async ({ page }) => {
	const chain = page.getByRole('combobox', { name: 'Chain' });
	await expect(chain).toHaveAccessibleDescription('Address family to generate.');

	await chain.selectOption('Solana');
	await expect(chain).toHaveValue('solana');

	await expect(page.getByRole('combobox', { name: 'Network' })).toBeDisabled();
});

test('tabs follow the ARIA pattern: arrows select, Home/End jump, Tab leaves', async ({ page }) => {
	await tab(page, 'Generate').focus();

	await page.keyboard.press('ArrowRight');
	await expect(tab(page, 'Validate')).toBeFocused();
	await expect(tab(page, 'Validate')).toHaveAttribute('aria-selected', 'true');
	await expect(tab(page, 'Generate')).toHaveAttribute('tabindex', '-1');
	await expect(page.getByRole('tabpanel', { name: 'Validate' })).toContainText('Validate tab');

	await page.keyboard.press('ArrowRight');
	await expect(tab(page, 'Generate')).toBeFocused();
	await page.keyboard.press('End');
	await expect(tab(page, 'Validate')).toBeFocused();
	await page.keyboard.press('Home');
	await expect(tab(page, 'Generate')).toBeFocused();

	await page.keyboard.press('Tab');
	await expect(page.getByRole('tabpanel', { name: 'Generate' })).toBeFocused();
});

test('the tab indicator ends under the selected tab', async ({ page }) => {
	const indicator = page.locator('.indicator');

	await tab(page, 'Validate').click();

	await expect.poll(() => left(indicator)).toBe(await left(tab(page, 'Validate')));
	const box = (await indicator.boundingBox())!;
	expect(Math.round(box.width)).toBe(
		Math.round((await tab(page, 'Validate').boundingBox())!.width)
	);
});

test('the segmented thumb ends under the chosen option, also by keyboard', async ({ page }) => {
	const family = page.getByRole('group', { name: 'Unit family' });
	const thumb = family.locator('.thumb');
	const option = (name: string) => family.locator('label', { hasText: name });

	await family.getByRole('radio', { name: 'Ether' }).focus();
	await page.keyboard.press('ArrowRight');

	await expect(family.getByRole('radio', { name: 'BTC' })).toBeChecked();
	await expect.poll(() => left(thumb)).toBe(await left(option('BTC')));

	await option('TRX').click();
	await expect.poll(() => left(thumb)).toBe(await left(option('TRX')));
});

test('the theme thumb jumps to a stored choice on load instead of sliding', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('qanchor.theme', 'dark'));
	await page.reload();
	const thumb = page.getByRole('group', { name: 'Theme' }).locator('.thumb');

	await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
	expect(await thumb.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
});

test('the form panel shows its focus halo while a control inside has focus', async ({ page }) => {
	const halo = () =>
		form(page).evaluate((el) => getComputedStyle(el, '::after').getPropertyValue('opacity'));
	expect(await halo()).toBe('0');

	await count(page).focus();
	await expect.poll(halo).toBe('1');

	await page.getByRole('heading', { name: 'Components' }).click();
	await expect.poll(halo).toBe('0');
});

test('a pressed button scales down', async ({ page }) => {
	const button = page.getByRole('button', { name: 'Download' });
	const box = (await button.boundingBox())!;

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await expect
		.poll(() => button.evaluate((el) => getComputedStyle(el).transform))
		.toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
	await page.mouse.up();
});

test('nothing transitions layout or shadow properties (60 fps rule, design 2.3)', async ({
	page
}) => {
	const offenders = await page.evaluate(() => {
		const banned = ['all', 'box-shadow', 'width', 'height', 'top', 'left', 'right', 'bottom'];
		const found: string[] = [];
		for (const el of document.querySelectorAll('*')) {
			for (const pseudo of [null, '::before', '::after']) {
				const style = getComputedStyle(el, pseudo);
				if (style.transitionDuration.split(',').every((d) => parseFloat(d) === 0)) continue;
				const props = style.transitionProperty.split(',').map((p) => p.trim());
				const bad = props.filter((p) => banned.includes(p));
				if (bad.length) found.push(`${el.tagName.toLowerCase()}${pseudo ?? ''}: ${bad}`);
			}
		}
		return found;
	});

	expect(offenders).toEqual([]);
});

test('reduced motion makes every transition instant (NFR-006)', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.reload();
	await tab(page, 'Validate').click();

	const durations = await page.evaluate(() =>
		[...document.querySelectorAll('*')].flatMap((el) =>
			[null, '::after'].flatMap((pseudo) =>
				getComputedStyle(el, pseudo)
					.transitionDuration.split(',')
					.map((d) => parseFloat(d))
			)
		)
	);

	expect(durations.filter((d) => d > 0)).toEqual([]);
});
