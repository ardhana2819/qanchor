import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { hydrated } from './helpers.ts';

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
	await hydrated(page);
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations in ${colorScheme} mode (NFR-009)`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		await page.reload();
		await hydrated(page);

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
	await hydrated(page);
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
	const button = page.getByRole('button', { name: 'Secondary' });
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
	await hydrated(page);
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

// T-008b: toast and live region, data table, dialog.

async function generateRows(page: Page, total: number): Promise<void> {
	await count(page).fill(String(total));
	await submit(page).click();
	await expect(page.getByRole('region', { name: 'Generated example rows' })).toBeVisible();
}

const liveRegion = (page: Page) => page.locator('[aria-live="polite"]');

test('the result count is announced through the live region, without a toast', async ({ page }) => {
	await generateRows(page, 12);

	await expect(liveRegion(page)).toHaveText('12 rows generated');
	await expect(page.locator('.toast')).toBeHidden();
});

test('a toast confirms an action, is read out once, and leaves after 4 s', async ({ page }) => {
	await page.clock.install();
	await page.goto('/components');
	await hydrated(page);

	await page.getByRole('button', { name: 'Delete wallet' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

	const toast = page.locator('.toast');
	await expect(toast).toBeVisible();
	await expect(toast).toHaveText('Example only: no wallet was deleted');
	await expect(liveRegion(page)).toHaveText('Example only: no wallet was deleted');
	// The toast is not a live region itself, so the message is not read twice.
	await expect(toast).not.toHaveAttribute('aria-live');

	await page.clock.runFor(3900);
	await expect(toast).toBeVisible();
	await page.clock.runFor(1000);
	await expect(toast).toBeHidden();
});

test('a data table has a caption, column headers, and mono data cells', async ({ page }) => {
	await generateRows(page, 12);
	const table = page.getByRole('table', { name: 'Generated example rows' });

	await expect(table.getByRole('columnheader')).toHaveText(['#', 'Address', 'Variant', 'Actions']);
	await expect(table.locator('tbody tr')).toHaveCount(12);
	const address = table.getByRole('cell').nth(1);
	await expect(address).toHaveText(/^0x[0-9a-f]{40}$/);
	expect(await address.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('monospace');
	await expect(table.getByRole('button', { name: 'Details of row 3' })).toBeVisible();
});

test('results enter staggered over the first 12 rows; later rows come with the 12th', async ({
	page
}) => {
	await generateRows(page, 30);
	const delays = await page.evaluate(() =>
		[...document.querySelectorAll('.enter')].map((el) => getComputedStyle(el).animationDelay)
	);

	// 12 rows on their own, then one block with every later row: 13 animated elements.
	expect(delays).toHaveLength(13);
	expect(delays.slice(0, 3)).toEqual(['0s', '0.028s', '0.056s']);
	expect(delays[11]).toBe('0.308s');
	expect(delays[12]).toBe('0.308s');
	await expect(page.locator('tbody').nth(1).locator('tr')).toHaveCount(18);
});

test('the table header stays visible while the table scrolls', async ({ page }) => {
	await generateRows(page, 100);
	const region = page.getByRole('region', { name: 'Generated example rows' });
	const header = region.getByRole('columnheader', { name: 'Address' });
	const top = (await region.boundingBox())!.y;

	await region.evaluate((el) => el.scrollTo(0, 2000));

	await expect
		.poll(async () => Math.round((await header.boundingBox())!.y))
		.toBe(Math.round(top + 1));
});

test('a wide table scrolls inside its own box at 375 px', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await generateRows(page, 12);

	const pageOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth
	);
	expect(pageOverflow).toBe(false);
	const region = page.getByRole('region', { name: 'Generated example rows' });
	expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test('a dialog keeps focus off the page behind it, closes on Escape, and returns focus', async ({
	page
}) => {
	const trigger = page.getByRole('button', { name: 'Delete wallet' });
	await trigger.click();
	const dialog = page.getByRole('dialog', { name: 'Delete wallet?' });
	await expect(dialog).toBeVisible();

	// A native modal dialog makes the page inert. Tab cycles through the dialog and may pass
	// through the browser's own UI (document.body here), but never reaches the page behind.
	const stops: string[] = [];
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press('Tab');
		const where = await dialog.evaluate((el) =>
			el.contains(document.activeElement)
				? 'dialog'
				: document.activeElement === document.body
					? 'browser'
					: 'page'
		);
		stops.push(where);
	}
	expect(stops).not.toContain('page');
	expect(stops.filter((stop) => stop === 'dialog').length).toBeGreaterThanOrEqual(4);

	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
});

test('closing a dialog with its own button returns focus to the trigger', async ({ page }) => {
	await generateRows(page, 12);
	const trigger = page.getByRole('button', { name: 'Details of row 4' });

	await trigger.click();
	const dialog = page.getByRole('dialog', { name: 'Row 4' });
	await expect(dialog).toContainText(/0x[0-9a-f]{40}/);
	await dialog.getByRole('button', { name: 'Close' }).click();

	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
});

test('a dialog reopened before its close event arrives stays open', async ({ page }) => {
	// Regression (T-047): the queued close event of the first close used to end the reopened
	// dialog, which hid an unsaved-changes prompt shown on a second Back.
	const trigger = page.getByRole('button', { name: 'Delete wallet' });
	await trigger.click();
	const dialog = page.getByRole('dialog', { name: 'Delete wallet?' });
	await expect(dialog).toBeVisible();

	await dialog.evaluate(async (el) => {
		el.querySelector('button')!.click();
		// Let Svelte's effect call close(); the close event is a task that has not run yet.
		await Promise.resolve();
		await Promise.resolve();
		const reopen = [...document.querySelectorAll('button')].find(
			(b) => b.textContent?.trim() === 'Delete wallet'
		)!;
		reopen.click();
	});

	await expect(dialog).toBeVisible();
	await page.waitForTimeout(300);
	await expect(dialog).toBeVisible();
});

test('an open dialog has no WCAG 2.1 AA violations', async ({ page }) => {
	await page.getByRole('button', { name: 'Delete wallet' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	// Let the open fade finish, so contrast is measured on the final colours.
	await dialog.evaluate((el) =>
		Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
	);

	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();

	expect(results.violations.map((v) => `${v.id}: ${v.nodes[0].target}`)).toEqual([]);
});

test('reduced motion removes the stagger and the enter animation (NFR-006)', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.reload();
	await hydrated(page);
	await generateRows(page, 30);

	const timings = await page.evaluate(() =>
		[...document.querySelectorAll('.enter')].map((el) => {
			const style = getComputedStyle(el);
			return parseFloat(style.animationDelay) + parseFloat(style.animationDuration);
		})
	);
	expect(timings.filter((t) => t > 0)).toEqual([]);
});
