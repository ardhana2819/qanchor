import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { hydrated, png } from './helpers.ts';

// The screenshot area, thumbnail, and image viewer (T-062, design 13.5, 13.6, FR-112 AC-1, AC-3)
// on /components. Storing screenshots and paste handling come with run execution (T-063).

const live = (page: Page) => page.getByTestId('shots-live');
const state = (page: Page, name: string) => page.getByTestId(`shots-${name}`);
const viewer = (page: Page) => page.getByRole('dialog', { name: /^Screenshot \d of TC-12$/ });
const target = (area: Locator) =>
	area.getByRole('button', { name: 'Paste, drop, or choose an image' });

async function choose(page: Page, ...names: string[]): Promise<void> {
	await live(page)
		.getByLabel('Screenshot files')
		.setInputFiles(names.map((name) => ({ name, mimeType: 'image/png', buffer: png(64, 48) })));
}

/** Every image in the area has loaded: the CSP allows its blob: URL (plan finding F-13). */
async function loaded(area: Locator): Promise<boolean[]> {
	return area
		.locator('img')
		.evaluateAll((images) =>
			(images as HTMLImageElement[]).map((img) => img.complete && img.naturalWidth > 0)
		);
}

test.beforeEach(async ({ page }) => {
	await page.goto('/components');
	await hydrated(page);
	await expect(live(page).getByRole('img')).toHaveCount(2);
});

test.describe('states (design 13.5)', () => {
	test('empty: the drop target is a button that opens the file chooser', async ({ page }) => {
		const area = state(page, 'empty');
		await expect(area.getByRole('group', { name: /^Screenshots/ })).toContainText(
			'optional, up to 5'
		);

		const [chooser] = await Promise.all([page.waitForEvent('filechooser'), target(area).click()]);
		expect(chooser.isMultiple()).toBe(true);
	});

	test('compressing: one placeholder per image', async ({ page }) => {
		const area = state(page, 'compressing');
		await expect(area.getByText('Compressing…')).toHaveCount(2);
		await expect(target(area)).toBeVisible();
	});

	test('full: five thumbnails and the limit instead of the target (FR-112 AC-6)', async ({
		page
	}) => {
		const area = state(page, 'full');
		await expect(area.getByRole('img')).toHaveCount(5);
		await expect(area.getByTestId('screenshot-limit')).toHaveText('5 of 5 screenshots');
		await expect(target(area)).toHaveCount(0);
		expect(await loaded(area)).toEqual([true, true, true, true, true]);
	});

	test('error: the reason is announced', async ({ page }) => {
		await expect(state(page, 'error').getByRole('alert')).toHaveText(
			'This browser cannot open IMG_2041.heic (HEIC).'
		);
	});

	test('read-only: thumbnails open, nothing can be added or removed', async ({ page }) => {
		const area = state(page, 'readonly');
		await expect(area.getByRole('button', { name: /^Open Screenshot/ })).toHaveCount(2);
		await expect(area.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
		await expect(target(area)).toHaveCount(0);
		await expect(area).not.toContainText('optional');
	});
});

test('a chosen image is compressed in the worker and added, with an announcement (FR-112 AC-1)', async ({
	page
}) => {
	await choose(page, 'login.png');

	await expect(live(page).getByRole('img')).toHaveCount(3);
	await expect(live(page).getByRole('img', { name: 'Screenshot 3 of TC-12' })).toBeVisible();
	await expect(page.locator('[aria-live="polite"]').first()).toContainText(
		'Screenshot added, 3 of 5.'
	);
	expect(await loaded(live(page))).toEqual([true, true, true]);
});

test('a dropped image is added like a chosen one', async ({ page }) => {
	const transfer = await page.evaluateHandle(() => {
		const data = new DataTransfer();
		data.items.add(new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' }));
		return data;
	});
	await target(live(page)).dispatchEvent('drop', { dataTransfer: transfer });

	await expect(live(page).getByRole('alert')).toHaveText('notes.txt is not an image.');
	await expect(live(page).getByRole('img')).toHaveCount(2);
});

test('the target gives way to the limit at five, counting images still compressing', async ({
	page
}) => {
	await choose(page, 'a.png', 'b.png', 'c.png');

	await expect(live(page).getByRole('img')).toHaveCount(5);
	await expect(live(page).getByTestId('screenshot-limit')).toBeVisible();
	await expect(target(live(page))).toHaveCount(0);
});

test.describe('image viewer (FR-112 AC-3)', () => {
	test('opens the full image with its file name and size', async ({ page }) => {
		await live(page).getByRole('button', { name: 'Open Screenshot 2 of TC-12' }).click();

		await expect(viewer(page)).toBeVisible();
		await expect(viewer(page).getByRole('heading')).toHaveText('Screenshot 2 of TC-12');
		await expect(viewer(page).getByRole('img', { name: 'Screenshot 2 of TC-12' })).toBeVisible();
		await expect(viewer(page)).toContainText(/TC-12-rundemo-2\.jpg · [\d.]+ KB/);
		// One image, read with evaluate: evaluateAll inside an open modal dialog crashes
		// Playwright's Firefox.
		const image = viewer(page).getByRole('img');
		expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
	});

	for (const how of ['Escape', 'Close'] as const) {
		test(`${how} closes it and returns focus to the thumbnail`, async ({ page }) => {
			const thumbnail = live(page).getByRole('button', { name: 'Open Screenshot 1 of TC-12' });
			await thumbnail.focus();
			await page.keyboard.press('Enter');
			await expect(viewer(page)).toBeVisible();

			if (how === 'Escape') await page.keyboard.press('Escape');
			else await viewer(page).getByRole('button', { name: 'Close' }).click();

			await expect(viewer(page)).toBeHidden();
			await expect(thumbnail).toBeFocused();
		});
	}

	// A modal dialog makes the page behind it inert; Tab may leave for the browser's own controls
	// (then no element in the page has focus), but never reaches the page behind.
	test('Tab never reaches the page behind it', async ({ page }) => {
		await live(page).getByRole('button', { name: 'Open Screenshot 1 of TC-12' }).click();
		await expect(viewer(page)).toBeVisible();

		const reached: string[] = [];
		for (let i = 0; i < 6; i++) {
			await page.keyboard.press('Tab');
			reached.push(
				await viewer(page).evaluate((el) => {
					const active = document.activeElement;
					if (!active || active === document.body) return 'browser';
					return el.contains(active) ? (active.textContent?.trim() ?? '') : 'outside';
				})
			);
		}
		expect(reached).not.toContain('outside');
		expect(reached).toEqual(expect.arrayContaining(['Download', 'Close']));
	});

	test('Download saves the image under its attachment name (FR-122)', async ({ page }) => {
		await live(page).getByRole('button', { name: 'Open Screenshot 1 of TC-12' }).click();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			viewer(page).getByRole('button', { name: 'Download' }).click()
		]);

		expect(download.suggestedFilename()).toBe('TC-12-rundemo-1.jpg');
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has no WCAG 2.1 AA violations in ${colorScheme} mode`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await live(page).getByRole('button', { name: 'Open Screenshot 1 of TC-12' }).click();
			await viewer(page).evaluate((el) =>
				Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
			);

			const results = await new AxeBuilder({ page })
				.include('dialog[open]')
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();
			expect(results.violations.map((v) => `${v.id}: ${v.nodes[0].target}`)).toEqual([]);
		});
	}
});

test('removing asks first; Cancel keeps the screenshot (FR-112 AC-4)', async ({ page }) => {
	const confirm = page.getByRole('dialog', { name: 'Remove this screenshot?' });
	const remove = live(page).getByRole('button', { name: 'Remove Screenshot 2 of TC-12' });

	await remove.click();
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(live(page).getByRole('img')).toHaveCount(2);

	await remove.click();
	await confirm.getByRole('button', { name: 'Remove' }).click();
	await expect(live(page).getByRole('img')).toHaveCount(1);
	await expect(live(page).getByRole('img', { name: 'Screenshot 2 of TC-12' })).toHaveCount(0);
});

test.describe('thumbnail added (design 13.6)', () => {
	const animations = (area: Locator) =>
		area
			.locator('img')
			.evaluateAll((images) =>
				images.map((img) =>
					(img.closest('div') as HTMLElement)
						.getAnimations()
						.map((a) => Number(a.effect?.getComputedTiming().duration))
				)
			);

	test('plays on a new thumbnail only, not on the ones already shown', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.reload();
		await hydrated(page);
		await expect(live(page).getByRole('img')).toHaveCount(2);
		await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));

		await choose(page, 'new.png');
		await expect(live(page).getByRole('img')).toHaveCount(3);

		const [first, second, added] = await animations(live(page));
		expect([first, second]).toEqual([[], []]);
		expect(added).toHaveLength(1);
		expect(added[0]).toBeGreaterThan(0);
	});

	test('is instant with reduced motion (NFR-006)', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.reload();
		await hydrated(page);
		await expect(live(page).getByRole('img')).toHaveCount(2);

		await choose(page, 'new.png');
		await expect(live(page).getByRole('img')).toHaveCount(3);

		const durations = await live(page)
			.locator('img')
			.evaluateAll((images) =>
				images.map((img) => parseFloat(getComputedStyle(img.closest('div')!).animationDuration))
			);
		expect(durations).toEqual([0, 0, 0]);
	});
});
