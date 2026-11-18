import { readFile } from 'node:fs/promises';
import { sha256 } from '@noble/hashes/sha2.js';
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { base58check } from '@scure/base';
import { appOpened, scanA11y } from './helpers.ts';

// Cross-cutting checks for Phase 1 (T-023 for slice 1a, T-034 for slice 1b): every shipped route
// and tool against the non-functional requirements that apply to all of them. Per-tool behaviour
// lives in each tool's own spec.

const ROUTES = [
	'/',
	'/address',
	'/amounts',
	'/units',
	'/tx',
	'/calldata',
	'/wallets',
	'/dummy-data',
	'/checklists',
	'/checklists/deposit',
	'/settings',
	'/this-page-does-not-exist'
];
const TOOL_ROUTES = [
	'/address',
	'/amounts',
	'/units',
	'/tx',
	'/calldata',
	'/wallets',
	'/dummy-data',
	'/checklists',
	'/checklists/deposit'
];

/** Strings that only appear in crypto code (our Taproot tag, noble's scalar check). */
const CRYPTO_MARKERS = ['TapTweak', 'invalid scalar'];

/** A 32-byte private key in hex. */
const HEX_KEY = /[0-9a-fA-F]{64}/;

/** Strings shaped like a Bitcoin WIF private key; `wifKeys` keeps only those that are one. */
const WIF_SHAPE =
	/(?<![1-9A-HJ-NP-Za-km-z])[5KLc9][1-9A-HJ-NP-Za-km-z]{50,51}(?![1-9A-HJ-NP-Za-km-z])/g;
const wif = base58check(sha256);

/**
 * WIF private keys in `text`: Base58Check with version 0x80 (mainnet) or 0xef (testnet) and a
 * 32-byte key, plus 0x01 when compressed. The shape alone is not enough: a run of a Bech32m
 * address between two characters Base58 lacks (`0`, `l`) can have it (seen in CI on PR 34).
 */
function wifKeys(text: string): string[] {
	return [...text.matchAll(WIF_SHAPE)]
		.map(([candidate]) => candidate)
		.filter((candidate) => {
			try {
				const bytes = wif.decode(candidate);
				const version = bytes[0] === 0x80 || bytes[0] === 0xef;
				return version && (bytes.length === 33 || (bytes.length === 34 && bytes[33] === 1));
			} catch {
				return false;
			}
		});
}

function recordRequests(page: Page): Request[] {
	const requests: Request[] = [];
	page.on('request', (request) => requests.push(request));
	return requests;
}

/** Presses Tab (or Shift+Tab) until `target` has focus; fails after `limit` presses. */
async function tabTo(page: Page, target: Locator, limit = 60, key = 'Tab'): Promise<void> {
	for (let i = 0; i < limit; i++) {
		if (await target.evaluate((el) => el === document.activeElement)) return;
		await page.keyboard.press(key);
	}
	throw new Error(`${key} never reached ${target}`);
}

/**
 * Fills a field until `settled` passes. After the first page of a test, appOpened() no longer
 * proves hydration (the database already exists), and typing before hydration is lost; WebKit
 * hung on a disabled Generate this way. Retrying the fill is Playwright's usual answer.
 */
async function fillUntil(
	field: Locator,
	value: string,
	settled: () => Promise<void>
): Promise<void> {
	await expect(async () => {
		await field.fill(value);
		await settled();
	}).toPass({ timeout: 15_000 });
}

/**
 * Generates through the Generate tab with the current chain choice and every variant ticked, and
 * waits for all rows. It waits on the row count on purpose: a toBeEnabled() or toBeVisible()
 * assertion before an axe scan crashes the Firefox page every time (found in T-023).
 */
async function generateAll(page: Page, count: string): Promise<void> {
	const boxes = await page
		.locator('form[aria-label="Address options"] input[type="checkbox"]')
		.all();
	for (const box of boxes) await box.check();
	await page.getByRole('textbox', { name: 'Valid addresses' }).fill(count);
	await page.getByRole('button', { name: 'Generate' }).click();
	await expect(
		page.getByRole('table', { name: 'Generated addresses' }).locator('tbody tr')
	).toHaveCount(Number(count) + boxes.length);
}

/** Generates `rows` dummy-data rows with the default fields and waits for the preview. */
async function generateDummy(page: Page, rows: string): Promise<void> {
	await fillUntil(page.getByRole('textbox', { name: 'Rows', exact: true }), rows, () =>
		expect(page.getByRole('textbox', { name: 'Rows', exact: true })).toHaveValue(rows, {
			timeout: 1000
		})
	);
	await page.getByRole('button', { name: 'Generate' }).click();
	// toHaveCount, not toBeVisible, before an axe scan in Firefox (see generateAll).
	await expect(page.getByText(/^Showing (all|the first)/)).toHaveCount(1, { timeout: 30_000 });
}

/** Filters the checklists and waits for the highlighted matches. */
async function filterChecklists(page: Page, text: string): Promise<void> {
	await fillUntil(page.getByRole('textbox', { name: 'Filter' }), text, () =>
		expect(page.locator('main mark').first()).toBeAttached({ timeout: 1000 })
	);
}

test.describe('no network activity while idle (NFR-003)', () => {
	for (const path of ROUTES) {
		test(`${path}: no request in 10 s after load`, async ({ page }) => {
			test.slow();
			await page.goto(path);
			await appOpened(page);
			await page.waitForLoadState('networkidle');
			const requests = recordRequests(page);

			await page.waitForTimeout(10_000);

			expect(requests.map((r) => r.url())).toEqual([]);
		});
	}
});

test('every request while using each tool goes to this origin only (NFR-011)', async ({ page }) => {
	test.slow();
	const requests = recordRequests(page);
	await page.goto('/');
	await appOpened(page);

	await page.goto('/address');
	await generateAll(page, '5');
	await page.getByRole('tab', { name: 'Validate' }).click();
	await page
		.getByRole('textbox', { name: 'Address', exact: true })
		.fill('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
	await expect(page.getByRole('status', { name: 'Verdict' })).not.toBeEmpty();

	await page.goto('/amounts');
	await fillUntil(page.getByRole('textbox', { name: 'Decimals' }), '18', () =>
		expect(page.getByRole('button', { name: 'Generate' })).toBeEnabled({ timeout: 1000 })
	);
	await page.getByRole('button', { name: 'Generate' }).click();
	await expect(page.getByRole('table', { name: 'Edge-case amounts' })).toBeVisible();

	await page.goto('/units');
	await fillUntil(page.getByRole('textbox', { name: 'ether', exact: true }), '1.5', () =>
		expect(page.getByRole('textbox', { name: 'wei', exact: true })).toHaveValue(
			'1500000000000000000',
			{ timeout: 1000 }
		)
	);

	await page.goto('/dummy-data');
	await generateDummy(page, '20');
	await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Download' }).click()
	]);

	await page.goto('/checklists');
	await filterChecklists(page, 'memo');
	await page
		.getByRole('main')
		.getByRole('link', { name: /^Memo and tag/ })
		.click();
	await expect(page.getByRole('button', { name: 'Copy as Markdown' })).toBeVisible();

	await page.goto('/settings');
	await appOpened(page);
	await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Export backup' }).click()
	]);

	const origin = new URL(page.url()).origin;
	const foreign = requests.filter(
		(r) => !r.url().startsWith(origin) && !r.url().startsWith('blob:')
	);
	expect(foreign.map((r) => r.url())).toEqual([]);
	expect(requests.length).toBeGreaterThan(0);
});

test('the WIF check finds a real key and ignores a Bech32m fragment of the same shape', () => {
	// Bitcoin wiki WIF example (uncompressed, mainnet); the address is from the PR 34 CI run.
	const key = '5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ';
	expect(wifKeys(`Key: ${key}.`)).toEqual([key]);
	expect(wifKeys('tb1pkx809nchu7gx9r86n3zvmfdm23t5xv6777r49xapr77k5ywe9sq26c3v')).toEqual([]);
	expect('tb1pkx809nchu7gx9r86n3zvmfdm23t5xv6777r49xapr77k5ywe9sq26c3v').toMatch(
		new RegExp(WIF_SHAPE.source)
	);
});

test('no private key reaches the page, storage, requests, or an export (NFR-012)', async ({
	page
}) => {
	test.slow();
	const requests = recordRequests(page);
	await page.goto('/address');
	await appOpened(page);
	const seen: string[] = [];
	const chain = page.getByRole('combobox', { name: 'Chain', exact: true });

	for (const option of ['EVM', 'Solana', 'Tron']) {
		await chain.selectOption(option);
		await generateAll(page, '20');
		seen.push(await page.locator('body').innerText());
	}
	await chain.selectOption('Bitcoin');
	for (const type of [
		'P2PKH (legacy)',
		'P2SH (nested SegWit)',
		'P2WPKH (native SegWit)',
		'P2TR (Taproot)'
	]) {
		for (const network of ['Mainnet', 'Testnet']) {
			await page.getByRole('combobox', { name: 'Address type', exact: true }).selectOption(type);
			await page.getByRole('combobox', { name: 'Network', exact: true }).selectOption(network);
			await generateAll(page, '10');
			seen.push(await page.locator('body').innerText());
		}
	}
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Download' }).click()
	]);
	seen.push(await readFile((await download.path())!, 'utf8'));

	seen.push(
		await page.evaluate(async () => {
			const dump: unknown[] = [{ ...localStorage }, { ...sessionStorage }, document.cookie];
			for (const { name } of await indexedDB.databases()) {
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					const request = indexedDB.open(name!);
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
				for (const store of db.objectStoreNames) {
					dump.push(
						await new Promise((resolve) => {
							const all = db.transaction(store).objectStore(store).getAll();
							all.onsuccess = () => resolve(all.result);
						})
					);
				}
				db.close();
			}
			return JSON.stringify(dump);
		})
	);
	seen.push(...requests.map((r) => `${r.url()} ${r.postData() ?? ''}`));

	for (const text of seen) {
		expect(text).not.toMatch(HEX_KEY);
		expect(wifKeys(text)).toEqual([]);
	}
});

test.describe('crypto code loads only where and when it is needed (FR-001 AC-5, NFR-015)', () => {
	/**
	 * Every script the page requested, fetched again by URL: Chromium does not keep the response
	 * body of a worker script, and the dummy-data worker must be checked too.
	 */
	async function scriptBodies(page: Page, requests: Request[]): Promise<string[]> {
		const urls = new Set(
			requests
				.filter((r) => r.resourceType() === 'script' || r.url().endsWith('.js'))
				.map((r) => r.url())
		);
		return Promise.all([...urls].map(async (url) => (await page.request.get(url)).text()));
	}

	const hasCrypto = (bodies: string[]) =>
		bodies.some((body) => CRYPTO_MARKERS.some((marker) => body.includes(marker)));

	test('the default route and the non-crypto tools load no crypto chunk', async ({ page }) => {
		const requests = recordRequests(page);
		await page.goto('/');
		await appOpened(page);
		await page.waitForLoadState('networkidle');
		expect(hasCrypto(await scriptBodies(page, requests))).toBe(false);

		for (const name of ['Amount edge cases', 'Unit converter', 'Dummy data', 'Checklists']) {
			await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click();
			await page.waitForLoadState('networkidle');
		}
		// The dummy-data worker is a separate script; it must not pull in crypto code either.
		await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Dummy data' })
			.click();
		await generateDummy(page, '5');
		expect(requests.some((r) => r.url().includes('dummy.worker'))).toBe(true);
		await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Checklists' })
			.click();
		await page.getByRole('main').getByRole('link', { name: 'Deposit' }).click();
		await page.waitForLoadState('networkidle');
		expect(hasCrypto(await scriptBodies(page, requests))).toBe(false);
	});

	test('/address loads crypto only on the first Generate or keystroke in Validate', async ({
		page
	}) => {
		const requests = recordRequests(page);
		await page.goto('/address');
		await appOpened(page);
		await page.waitForLoadState('networkidle');
		expect(hasCrypto(await scriptBodies(page, requests))).toBe(false);

		await page.getByRole('tab', { name: 'Validate' }).click();
		await page.getByRole('textbox', { name: 'Address', exact: true }).fill('T');
		await expect(page.getByRole('status', { name: 'Verdict' })).not.toBeEmpty();
		expect(hasCrypto(await scriptBodies(page, requests))).toBe(true);
	});
});

test.describe('accessibility in both themes (NFR-009)', () => {
	for (const colorScheme of ['light', 'dark'] as const) {
		for (const path of ROUTES) {
			test(`${path} in ${colorScheme}`, async ({ page }) => {
				await page.emulateMedia({ colorScheme });
				await page.goto(path);
				await appOpened(page);
				// Scan the settled page: a control leaving its disabled loading state fades its
				// colours, and a scan mid-fade reads a contrast that is never shown (T-043).
				await expect(page.locator('[data-testid$="-loading"]')).toHaveCount(0);
				await page.evaluate(() =>
					Promise.allSettled(document.getAnimations().map((a) => a.finished))
				);

				expect(await scanA11y(page)).toEqual([]);
			});
		}

		// One scan per page: a second axe run in the same Firefox page crashes the page (as in
		// T-011), so results and verdict are separate tests.
		test(`address results in ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/address');
			await appOpened(page);
			await generateAll(page, '3');
			await page
				.getByRole('table', { name: 'Generated addresses' })
				.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));

			expect(await scanA11y(page)).toEqual([]);
		});

		test(`address verdict in ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/address');
			await appOpened(page);
			await page.getByRole('tab', { name: 'Validate' }).click();
			await page
				.getByRole('textbox', { name: 'Address', exact: true })
				.fill('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
			const verdict = page.getByRole('status', { name: 'Verdict' });
			await expect(verdict).toContainText('Risky');
			// Scanned mid-fade, the badge's contrast reads too low; wait for the verdict to settle.
			await verdict.evaluate((el) =>
				Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
			);

			expect(await scanA11y(page)).toEqual([]);
		});

		test(`dummy-data results in ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/dummy-data');
			await appOpened(page);
			await generateDummy(page, '3');
			await page
				.getByRole('table', { name: 'Generated dummy data' })
				.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));

			expect(await scanA11y(page)).toEqual([]);
		});

		test(`filtered checklists in ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme });
			await page.goto('/checklists');
			await appOpened(page);
			await filterChecklists(page, '4294967295');

			expect(await scanA11y(page)).toEqual([]);
		});
	}
});

test.describe('no main-thread task over 200 ms during bulk generation (NFR-005)', () => {
	// The Long Tasks API exists only in Chromium; the work itself is the same in every browser.
	test.skip(({ browserName }) => browserName !== 'chromium', 'Long Tasks API is Chromium-only.');

	/** Starts recording long tasks (over 50 ms) from now on. */
	async function recordLongTasks(page: Page): Promise<() => Promise<number[]>> {
		await page.evaluate(() => {
			const durations: number[] = [];
			Object.defineProperty(window, '__longTasks', { value: durations });
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) durations.push(Math.round(entry.duration));
			}).observe({ type: 'longtask' });
		});
		return () => page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
	}

	test('500 addresses with every variant', async ({ page }) => {
		await page.goto('/address');
		await appOpened(page);
		const longTasks = await recordLongTasks(page);

		await generateAll(page, '500');

		expect((await longTasks()).filter((ms) => ms > 200)).toEqual([]);
	});

	test('10,000 dummy-data rows, then a CSV download', async ({ page }) => {
		test.slow();
		await page.goto('/dummy-data');
		await appOpened(page);
		const longTasks = await recordLongTasks(page);

		await generateDummy(page, '10000');
		await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Download' }).click()
		]);

		expect((await longTasks()).filter((ms) => ms > 200)).toEqual([]);
	});
});

test.describe('motion (NFR-006)', () => {
	async function useEveryTool(page: Page): Promise<void> {
		await page.goto('/address');
		await appOpened(page);
		await generateAll(page, '20');
		await page.goto('/amounts');
		await fillUntil(page.getByRole('textbox', { name: 'Decimals' }), '6', () =>
			expect(page.getByRole('button', { name: 'Generate' })).toBeEnabled({ timeout: 1000 })
		);
		await page.getByRole('button', { name: 'Generate' }).click();
		await expect(page.getByRole('table', { name: 'Edge-case amounts' })).toBeVisible();
		await page.goto('/dummy-data');
		await generateDummy(page, '20');
		await page.goto('/checklists');
		await filterChecklists(page, 'memo');
	}

	test('with reduced motion, nothing animates for any length of time', async ({ page }) => {
		// Uses two tools end to end; WebKit in CI needs more than the default 30 s.
		test.slow();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await useEveryTool(page);

		const moving = await page.evaluate(() =>
			document
				.getAnimations()
				.filter((a) => Number(a.effect?.getComputedTiming().activeDuration ?? 0) > 0)
				.map((a) => (a as CSSAnimation).animationName ?? a.constructor.name)
		);
		expect(moving).toEqual([]);
	});

	for (const path of ROUTES) {
		test(`${path}: no animation keeps running while idle`, async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'no-preference' });
			await page.goto(path);
			await appOpened(page);
			await page.waitForTimeout(1500);

			const running = await page.evaluate(() =>
				document.getAnimations().map((a) => ({
					state: a.playState,
					iterations: a.effect?.getComputedTiming().iterations
				}))
			);
			expect(running.filter((a) => a.state === 'running' || a.iterations === Infinity)).toEqual([]);
		});
	}
});

test.describe('every tool works from the keyboard alone (NFR-008)', () => {
	test('Address generator: generate, copy, then validate', async ({ page }) => {
		await page.addInitScript(() => {
			navigator.clipboard.writeText = async () => undefined;
		});
		await page.goto('/address');
		await appOpened(page);

		await tabTo(page, page.getByRole('textbox', { name: 'Valid addresses' }));
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('2');
		await tabTo(page, page.getByRole('checkbox', { name: 'Wrong length' }));
		await page.keyboard.press('Space');
		await tabTo(page, page.getByRole('button', { name: 'Generate' }));
		await page.keyboard.press('Enter');
		await expect(
			page.getByRole('table', { name: 'Generated addresses' }).locator('tbody tr')
		).toHaveCount(3);
		await tabTo(page, page.getByRole('button', { name: 'Copy address 1', exact: true }));
		await page.keyboard.press('Enter');
		await expect(page.locator('.toast')).toHaveText('Copied');

		// Back up the page: past its end, Firefox moves focus to the browser itself.
		await tabTo(page, page.getByRole('tab', { name: 'Generate' }), 60, 'Shift+Tab');
		await page.keyboard.press('ArrowRight');
		// The tab panel itself takes focus first (it is focusable), then the field.
		await tabTo(page, page.getByRole('textbox', { name: 'Address', exact: true }), 3);
		await page.keyboard.type('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
		await expect(page.getByRole('status', { name: 'Verdict' })).toContainText('Tron · any network');
	});

	test('Amount edge cases: choose a preset and generate', async ({ page }) => {
		await page.goto('/amounts');
		await appOpened(page);

		await tabTo(page, page.getByRole('combobox', { name: 'Preset' }));
		// Typeahead picks an option without opening the menu on every platform.
		await page.keyboard.type('ETH');
		await expect(page.getByRole('textbox', { name: 'Decimals' })).toHaveValue('18');
		await tabTo(page, page.getByRole('textbox', { name: 'Balance' }));
		await page.keyboard.type('10');
		await page.keyboard.press('Enter');

		await expect(page.getByRole('table', { name: 'Edge-case amounts' })).toBeVisible();
		await tabTo(page, page.getByRole('button', { name: 'Copy input 1', exact: true }));
	});

	test('Unit converter: switch family and convert', async ({ page }) => {
		await page.goto('/units');
		await appOpened(page);

		await tabTo(page, page.getByRole('radio', { name: 'Ethereum' }));
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Tab');
		await page.keyboard.type('1');

		await expect(page.getByRole('textbox', { name: 'sats', exact: true })).toHaveValue('100000000');
	});

	test('Dummy data: choose a preset, generate, and download', async ({ page }) => {
		await page.goto('/dummy-data');
		await appOpened(page);

		await tabTo(page, page.getByRole('combobox', { name: 'Preset' }));
		await page.keyboard.type('Invalid');
		await expect(page.getByRole('checkbox', { name: 'Address', exact: true })).not.toBeChecked();
		await tabTo(page, page.getByRole('textbox', { name: 'Rows' }));
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('5');
		await page.keyboard.press('Enter');
		await expect(
			page.getByRole('table', { name: 'Generated dummy data' }).locator('tbody tr')
		).toHaveCount(5);
		await tabTo(page, page.getByRole('button', { name: 'Download' }));
		const [file] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
		expect(file.suggestedFilename()).toMatch(/^qanchor-dummy-v1-[0-9a-f]{16}\.csv$/);
	});

	for (const path of TOOL_ROUTES) {
		test(`${path}: every focusable control shows a focus ring`, async ({ page }) => {
			await page.goto(path);
			await appOpened(page);
			const missing: string[] = [];

			for (let i = 0; i < 40; i++) {
				await page.keyboard.press('Tab');
				const ring = await page.evaluate(() => {
					const el = document.activeElement as HTMLElement | null;
					if (!el || el === document.body) return null;
					const style = getComputedStyle(el);
					// Native radios and checkboxes inside custom controls draw the ring on a sibling.
					const sibling = el.nextElementSibling ? getComputedStyle(el.nextElementSibling) : null;
					const visible = (s: CSSStyleDeclaration | null) =>
						!!s &&
						((s.outlineStyle !== 'none' && s.outlineWidth !== '0px') || s.boxShadow !== 'none');
					return {
						name: `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}`,
						ok: visible(style) || visible(sibling)
					};
				});
				if (ring && !ring.ok) missing.push(ring.name);
			}

			expect(missing).toEqual([]);
		});
	}
});
