import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	appOpened,
	png,
	putRecords,
	readStore,
	scanA11y,
	seedCases,
	testCase,
	testResult,
	testRun
} from './helpers.ts';

// Screenshots in run execution (T-063; design 13.3 P2-04, 13.5, 13.7; FR-112, FR-113 AC-4,
// FR-092 AC-3; EC-029, EC-032, EC-034; plan finding F-7). Images are made in the test; pastes
// are synthetic clipboard events, the way a screenshot tool hands the page an image file.

interface StoredShot {
	owner: [string, string, number];
	n: number;
	mediaType: string;
}

const IMAGE = { name: 'image.png', type: 'image/png', bytes: [...png(64, 48)] };

async function openRun(page: Page, results: object[] = [], fields: object = {}): Promise<void> {
	await page.goto('/runs');
	await appOpened(page);
	await seedCases(page, [testCase(1), testCase(2), testCase(3)] as { number: number }[]);
	await putRecords(page, 'runs', [testRun('run-1', [1, 2, 3], { name: 'Smoke', ...fields })]);
	if (results.length > 0) await putRecords(page, 'results', results);
	await page.goto('/runs/view?id=run-1');
	await expect(page.getByTestId('run-loading')).toHaveCount(0);
}

const panel = (page: Page) => page.getByTestId('run-result');
const area = (page: Page) => page.getByTestId('run-screenshots');
const thumbnails = (page: Page) => area(page).getByRole('img');
const target = (page: Page) =>
	area(page).getByRole('button', { name: 'Paste, drop, or choose an image' });
const alert = (page: Page) => area(page).getByRole('alert');
const radio = (page: Page, name: 'Pass' | 'Fail' | 'Blocked') =>
	panel(page).getByRole('radio', { name: new RegExp(`^${name}`) });
const actual = (page: Page) => page.getByRole('textbox', { name: 'Actual result' });
const stored = (page: Page) => readStore<StoredShot>(page, 'screenshots');

async function choose(page: Page, ...names: string[]): Promise<void> {
	await area(page)
		.getByLabel('Screenshot files')
		.setInputFiles(names.map((name) => ({ name, mimeType: 'image/png', buffer: png(64, 48) })));
}

/** Dispatches a paste on the element; true when the page took it over (preventDefault). */
function paste(
	on: Locator,
	{ files = [], text }: { files?: (typeof IMAGE)[]; text?: string }
): Promise<boolean> {
	return on.evaluate(
		(element, { files, text }) => {
			const data = new DataTransfer();
			for (const f of files) {
				data.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
			}
			if (text) data.setData('text/plain', text);
			const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
			// Set on the event, as Firefox drops clipboardData given to the constructor.
			Object.defineProperty(event, 'clipboardData', { value: data });
			element.dispatchEvent(event);
			return event.defaultPrevented;
		},
		{ files, text }
	);
}

/**
 * The name a click saves a file under. Firefox saves a WebP file, then opens it in a new tab
 * instead of reporting a download (its default for images it can show).
 */
async function savedName(page: Page, button: Locator): Promise<string> {
	const [name] = await Promise.all([
		Promise.race([
			page.waitForEvent('download').then((download) => download.suggestedFilename()),
			page
				.context()
				.waitForEvent('page')
				.then(async (tab) => {
					const opened = decodeURIComponent(new URL(tab.url()).pathname.split('/').pop() ?? '');
					await tab.close();
					return opened;
				})
		]),
		// Not click(): it waits for the navigation Firefox's new tab starts.
		button.dispatchEvent('click')
	]);
	return name;
}

/** Every thumbnail's image has loaded (and the CSP allowed its blob: URL). */
async function loaded(page: Page): Promise<boolean[]> {
	const images = await thumbnails(page).all();
	return Promise.all(
		images.map((img) => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
	);
}

test('the area appears once a result is picked', async ({ page }) => {
	await openRun(page);
	await expect(area(page)).toHaveCount(0);

	await radio(page, 'Fail').check();

	await expect(target(page)).toBeVisible();
	await expect(area(page).getByRole('group')).toContainText('optional, up to 5');
});

test.describe('before the first save (plan finding F-7)', () => {
	test('a pasted image waits, then is saved with the result (FR-112 AC-1, EC-029)', async ({
		page
	}) => {
		await openRun(page);
		await radio(page, 'Fail').check();
		await actual(page).fill('The balance stays at 0');

		// Pasted into the text field: the image wins, and the text stays as typed.
		expect(await paste(actual(page), { files: [IMAGE], text: 'copied text' })).toBe(true);

		await expect(thumbnails(page)).toHaveCount(1);
		await expect(area(page).getByRole('img', { name: 'Screenshot 1 of TC-1' })).toBeVisible();
		await expect(actual(page)).toHaveValue('The balance stays at 0');
		await expect(page.locator('[aria-live="polite"]').first()).toContainText(
			'Screenshot added, 1 of 5.'
		);
		expect(await stored(page)).toEqual([]);

		await page.getByTestId('run-save-result').click();
		await expect(page.getByTestId('run-save-status')).toContainText('Saved');
		const shots = await stored(page);
		expect(shots.map(({ owner, n }) => ({ owner, n }))).toEqual([
			{ owner: ['result', 'run-1', 1], n: 1 }
		]);

		await page.reload();
		await expect(thumbnails(page)).toHaveCount(1);
		expect(await loaded(page)).toEqual([true]);
	});

	test('a waiting screenshot stays with its case while another is open', async ({ page }) => {
		await openRun(page);
		await radio(page, 'Fail').check();
		await choose(page, 'a.png');
		await expect(thumbnails(page)).toHaveCount(1);

		await page.getByTestId('run-next').click();
		await expect(area(page)).toHaveCount(0);
		await page.getByTestId('run-previous').click();

		await expect(thumbnails(page)).toHaveCount(1);
		expect(await loaded(page)).toEqual([true]);
		expect(await stored(page)).toEqual([]);
	});

	test('Pass saves the waiting screenshots with it', async ({ page }) => {
		await openRun(page);
		await radio(page, 'Fail').check();
		await choose(page, 'a.png', 'b.png');
		await expect(thumbnails(page)).toHaveCount(2);

		await radio(page, 'Pass').check();

		await expect.poll(async () => (await stored(page)).map((s) => s.n).sort()).toEqual([1, 2]);
	});
});

test.describe('on a saved result', () => {
	test('a chosen image is stored at once', async ({ page }) => {
		await openRun(page, [testResult('run-1', 1, 'pass')]);

		await choose(page, 'a.png');

		await expect(thumbnails(page)).toHaveCount(1);
		await expect.poll(async () => (await stored(page)).length).toBe(1);
		expect(await loaded(page)).toEqual([true]);
	});

	test('a dropped image is added', async ({ page }) => {
		await openRun(page, [testResult('run-1', 1, 'pass')]);
		const transfer = await page.evaluateHandle((image) => {
			const data = new DataTransfer();
			data.items.add(new File([new Uint8Array(image.bytes)], image.name, { type: image.type }));
			return data;
		}, IMAGE);

		await target(page).dispatchEvent('drop', { dataTransfer: transfer });

		await expect(thumbnails(page)).toHaveCount(1);
		await expect.poll(async () => (await stored(page)).length).toBe(1);
	});

	test('several images are added up to the limit, then refused (FR-112 AC-6)', async ({ page }) => {
		await openRun(page, [testResult('run-1', 1, 'pass')]);

		await choose(page, '1.png', '2.png', '3.png', '4.png', '5.png', '6.png');

		await expect(thumbnails(page)).toHaveCount(5);
		await expect(alert(page)).toHaveText('5 of 5 screenshots');
		await expect(area(page).getByTestId('screenshot-limit')).toBeVisible();
		await expect(target(page)).toHaveCount(0);
		expect(await stored(page)).toHaveLength(5);
	});
});

test.describe('refusals (FR-112 AC-5, design 13.7)', () => {
	test('a paste without an image keeps its text in a text field', async ({ page }) => {
		await openRun(page);
		await radio(page, 'Fail').check();

		const taken = await paste(page.getByRole('textbox', { name: 'Notes (optional)' }), {
			text: 'Seen on build 812'
		});

		expect(taken).toBe(false);
		await expect(alert(page)).toHaveCount(0);
	});

	test('a paste without an image elsewhere says the clipboard has none', async ({ page }) => {
		await openRun(page);
		await radio(page, 'Fail').check();

		expect(await paste(target(page), { text: 'just text' })).toBe(true);

		await expect(alert(page)).toHaveText('The clipboard has no image.');
		await expect(thumbnails(page)).toHaveCount(0);
	});

	test('a file that is not an image', async ({ page }) => {
		await openRun(page);
		await radio(page, 'Fail').check();

		await area(page)
			.getByLabel('Screenshot files')
			.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });

		await expect(alert(page)).toHaveText('notes.txt is not an image.');
		await expect(thumbnails(page)).toHaveCount(0);
	});

	test('full storage names the space used and links to Settings (EC-032, FR-092 AC-3)', async ({
		page
	}) => {
		await openRun(page, [testResult('run-1', 1, 'pass')]);
		await page.evaluate(() => {
			const add = IDBObjectStore.prototype.add;
			IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...args) {
				if (this.name === 'screenshots') throw new DOMException('Full', 'QuotaExceededError');
				return add.apply(this, args);
			};
		});

		await choose(page, 'a.png');

		await expect(alert(page)).toContainText('Not enough storage to save this screenshot.');
		await expect(alert(page).getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
			'href',
			'/settings'
		);
		await expect(thumbnails(page)).toHaveCount(0);
		expect(await stored(page)).toEqual([]);
	});
});

test.describe('viewer and removal', () => {
	test('opens the image with its attachment name; Escape returns focus (FR-112 AC-3)', async ({
		page
	}) => {
		await openRun(page, [testResult('run-1', 1, 'pass')]);
		await choose(page, 'a.png');
		const open = area(page).getByRole('button', { name: 'Open Screenshot 1 of TC-1' });
		// By keyboard: a click does not focus a button in WebKit on macOS.
		await open.focus();
		await page.keyboard.press('Enter');
		const viewer = page.getByRole('dialog', { name: 'Screenshot 1 of TC-1' });
		await expect(viewer).toContainText(/TC-1-run1-1\.(webp|jpg) · \d/);
		expect(
			await viewer.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)
		).toBe(64);

		await page.keyboard.press('Escape');

		await expect(viewer).toBeHidden();
		await expect(open).toBeFocused();
	});

	test('Download saves the image under its attachment name (FR-122)', async ({ page }) => {
		await openRun(page, [testResult('run-1', 1, 'pass')]);
		await choose(page, 'a.png');
		await area(page).getByRole('button', { name: 'Open Screenshot 1 of TC-1' }).click();
		const viewer = page.getByRole('dialog', { name: 'Screenshot 1 of TC-1' });

		expect(await savedName(page, viewer.getByRole('button', { name: 'Download' }))).toMatch(
			/^TC-1-run1-1\.(webp|jpg)$/
		);
	});

	test('removing asks first and deletes the stored image (FR-112 AC-4, EC-034)', async ({
		page
	}) => {
		await openRun(page, [testResult('run-1', 1, 'pass')]);
		await choose(page, 'a.png');
		await expect.poll(async () => (await stored(page)).length).toBe(1);
		const remove = area(page).getByRole('button', { name: 'Remove Screenshot 1 of TC-1' });
		const confirm = page.getByRole('dialog', { name: 'Remove this screenshot?' });

		await remove.click();
		await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
		await confirm.getByRole('button', { name: 'Cancel' }).click();
		expect(await stored(page)).toHaveLength(1);

		await remove.click();
		await confirm.getByRole('button', { name: 'Remove' }).click();

		await expect(thumbnails(page)).toHaveCount(0);
		await expect(target(page)).toBeFocused();
		expect(await stored(page)).toEqual([]);
	});
});

test('a completed run shows its screenshots read-only', async ({ page }) => {
	await openRun(page, [testResult('run-1', 1, 'pass')]);
	await choose(page, 'a.png');
	await expect.poll(async () => (await stored(page)).length).toBe(1);
	await page.getByTestId('run-complete').click();
	await page.getByTestId('run-confirm-complete').click();

	await expect(thumbnails(page)).toHaveCount(1);
	await expect(target(page)).toHaveCount(0);
	await expect(area(page).getByRole('button', { name: /^Remove/ })).toHaveCount(0);
	expect(await paste(panel(page), { files: [IMAGE] })).toBe(false);

	await area(page).getByRole('button', { name: 'Open Screenshot 1 of TC-1' }).click();
	await expect(page.getByRole('dialog', { name: 'Screenshot 1 of TC-1' })).toBeVisible();
});

test('deleting a run names its screenshots and leaves none stored (FR-113 AC-4, NFR-024)', async ({
	page
}) => {
	await openRun(page, [testResult('run-1', 1, 'pass')]);
	await choose(page, 'a.png', 'b.png');
	await expect.poll(async () => (await stored(page)).length).toBe(2);

	await page.goto('/runs');
	await page.getByRole('button', { name: 'Delete Smoke' }).click();
	await expect(page.getByTestId('runs-delete-results')).toHaveText(
		'Its 1 result and 2 screenshots are deleted too. This cannot be undone.'
	);
	await page.getByTestId('runs-confirm-delete').click();

	await expect(page.getByTestId('app-toast')).toHaveText('Deleted run "Smoke".');
	expect(await stored(page)).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`the result panel with screenshots has no WCAG 2.1 AA violations in ${colorScheme} mode`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
		await openRun(page, [testResult('run-1', 1, 'pass')]);
		await choose(page, 'a.png');
		await expect(thumbnails(page)).toHaveCount(1);

		expect(await scanA11y(page)).toEqual([]);
	});
}
