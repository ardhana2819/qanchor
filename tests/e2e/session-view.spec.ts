import { expect, test, type Page } from '@playwright/test';
import {
	appOpened,
	png,
	putRecords,
	readStore,
	scanA11y,
	testFinding,
	testSession
} from './helpers.ts';

// Session page (T-070; design 13.3 P2-06, 13.6, 13.7; FR-130 AC-2 to AC-6, FR-131 AC-1, AC-2,
// AC-4; EC-033, EC-036; NFR-003, NFR-008, NFR-009).

interface StoredSession {
	charter: string;
	timeboxMinutes: number;
	status: string;
	pausedMs: number;
	endedAt: number | null;
}

interface StoredFinding {
	id: string;
	type: string;
	text: string;
	at: number;
}

const MIN = 60_000;
/** The page's clock in these tests: the session started 23 minutes before. */
const NOW = Date.UTC(2026, 10, 27, 9, 0);
const STARTED = NOW - 23 * MIN;

const clock = (page: Page) => page.getByTestId('session-clock');
const text = (page: Page) => page.getByRole('textbox', { name: 'Finding', exact: true });
const items = (page: Page) => page.getByTestId('finding');
const composer = (page: Page) => page.getByRole('form', { name: 'Add a finding' });
const composerType = (page: Page, name: string) =>
	composer(page).getByRole('group', { name: 'Finding type' }).getByRole('radio', { name });
const filter = (page: Page, name: string) =>
	page.getByRole('group', { name: 'Show findings of type' }).getByRole('radio', { name });
const toast = (page: Page) => page.getByTestId('app-toast');

async function openSession(
	page: Page,
	{
		session = {},
		findings = [],
		screenshots = []
	}: { session?: object; findings?: object[]; screenshots?: object[] } = {}
): Promise<void> {
	await page.goto('/sessions');
	await appOpened(page);
	await putRecords(page, 'sessions', [
		testSession('s1', {
			charter: 'Explore withdraw limits',
			startedAt: STARTED,
			createdAt: STARTED,
			updatedAt: STARTED,
			...session
		})
	]);
	if (findings.length > 0) await putRecords(page, 'findings', findings);
	if (screenshots.length > 0) await putRecords(page, 'screenshots', screenshots);
	await page.goto('/sessions/view?id=s1');
	// toHaveCount, not toBeVisible, as the page is often scanned next: see scanA11y.
	await expect(page.getByTestId('session-charter-heading')).toHaveCount(1);
}

/** Fakes the page's clock at NOW, standing still until a test moves it. */
async function stopClock(page: Page): Promise<void> {
	await page.clock.install({ time: NOW - 1_000 });
	await page.clock.pauseAt(NOW);
}

/** Lets the page see itself hidden or shown, as when the tab is switched (FR-130 AC-3). */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
	await page.evaluate((value) => {
		(window as unknown as { __hidden: boolean }).__hidden = value;
		document.dispatchEvent(new Event('visibilitychange'));
	}, hidden);
}

test.describe('clock (FR-130 AC-2 to AC-6, plan finding F-15)', () => {
	test.beforeEach(async ({ page }) => {
		await stopClock(page);
	});

	test('shows whole minutes elapsed and left, and moves once a minute', async ({ page }) => {
		await openSession(page);
		await expect(clock(page)).toHaveText('23 min elapsed · 37 min left');
		await page.clock.runFor(59_000);
		await expect(clock(page)).toHaveText('23 min elapsed · 37 min left');
		await page.clock.runFor(1_000);
		await expect(clock(page)).toHaveText('24 min elapsed · 36 min left');
	});

	test('is right after a reload and after the tab was closed (EC-036)', async ({ page }) => {
		await openSession(page);
		await page.goto('/sessions');
		await page.clock.fastForward(2 * 60 * MIN);
		await page.goto('/sessions/view?id=s1');
		await expect(clock(page)).toHaveText('143 min elapsed · 83 min over');
	});

	test('does not count a paused hour, also after a reload (AC-5)', async ({ page }) => {
		await openSession(page);
		await page.getByTestId('session-pause').click();
		await expect(page.getByTestId('session-resume')).toBeFocused();
		await expect(clock(page)).toHaveText('23 min elapsed · 37 min left · paused');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Paused');

		await page.clock.fastForward(60 * MIN);
		await page.reload();
		await expect(clock(page)).toHaveText('23 min elapsed · 37 min left · paused');
		await page.getByTestId('session-resume').click();
		await expect(page.getByTestId('session-pause')).toBeFocused();
		await expect(clock(page)).toHaveText('23 min elapsed · 37 min left');
		await page.clock.runFor(2 * MIN);
		await expect(clock(page)).toHaveText('25 min elapsed · 35 min left');

		const [stored] = await readStore<StoredSession>(page, 'sessions');
		expect(stored).toMatchObject({ status: 'running', pausedMs: 60 * MIN });
	});

	test('waits for the next minute, and runs no timer while the page is hidden (AC-3, NFR-003)', async ({
		page
	}) => {
		await page.addInitScript(() => {
			const w = window as unknown as { __hidden: boolean; __waits: number[] };
			w.__hidden = false;
			w.__waits = [];
			Object.defineProperty(Document.prototype, 'visibilityState', {
				get: () => (w.__hidden ? 'hidden' : 'visible')
			});
			const setTimeoutOf = window.setTimeout.bind(window);
			window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
				if ((delay ?? 0) >= 1_000) w.__waits.push(delay ?? 0);
				return setTimeoutOf(handler, delay, ...args);
			}) as typeof window.setTimeout;
		});
		await openSession(page, { session: { startedAt: STARTED - 15_000 } });
		await expect(clock(page)).toHaveText('23 min elapsed · 37 min left');
		const waits = () => page.evaluate(() => (window as unknown as { __waits: number[] }).__waits);
		// 23 min 15 s elapsed: the clock waits 45 s for the next shown minute, nothing sooner.
		expect(await waits()).toContain(45_000);
		expect(Math.min(...(await waits()))).toBe(45_000);

		await setHidden(page, true);
		await page.evaluate(() => ((window as unknown as { __waits: number[] }).__waits = []));
		await page.clock.runFor(10 * MIN);
		await expect(clock(page)).toHaveText('23 min elapsed · 37 min left');
		expect(await waits()).toEqual([]);

		await setHidden(page, false);
		await expect(clock(page)).toHaveText('33 min elapsed · 27 min left');
	});

	test('says once that the timebox is reached, and keeps running (AC-4)', async ({ page }) => {
		await openSession(page, { session: { timeboxMinutes: 24 } });
		await expect(page.getByTestId('session-timebox')).toHaveCount(0);
		await page.clock.runFor(MIN);
		await expect(page.getByTestId('session-timebox')).toHaveText(
			'Timebox reached. The session keeps running until you end it.'
		);
		await expect(page.getByTestId('session-timebox')).toHaveClass(/animate/);
		await expect(clock(page)).toHaveText('24 min elapsed · 0 min left');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Running');

		await page.reload();
		await expect(page.getByTestId('session-timebox')).toBeVisible();
		await expect(page.getByTestId('session-timebox')).not.toHaveClass(/animate/);
	});

	test('End stores the total time; an ended session cannot restart (AC-6)', async ({ page }) => {
		await openSession(page);
		await page.getByTestId('session-end').click();
		const dialog = page.getByRole('dialog', { name: 'End this session?' });
		await expect(page.getByTestId('session-end-body')).toContainText('The clock stops at 23 min.');
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('session-pause')).toBeVisible();

		await page.getByTestId('session-end').click();
		await page.getByTestId('session-confirm-end').click();
		await expect(toast(page)).toHaveText('Session ended.');
		await expect(clock(page)).toHaveText('Ended after 23 min');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Ended');
		await expect(page.getByTestId('session-pause')).toHaveCount(0);
		await expect(page.getByTestId('session-resume')).toHaveCount(0);
		await expect(page.getByTestId('session-end')).toHaveCount(0);
		await expect(page.getByTestId('session-edit')).toBeFocused();

		await page.clock.fastForward(60 * MIN);
		await page.reload();
		await expect(clock(page)).toHaveText('Ended after 23 min');
		const [stored] = await readStore<StoredSession>(page, 'sessions');
		expect(stored).toMatchObject({ status: 'ended', endedAt: NOW });
	});

	test('a finding added after End is stamped with the total time (FR-131 AC-1)', async ({
		page
	}) => {
		await openSession(page, {
			session: { status: 'ended', endedAt: STARTED + 45 * MIN, timeboxMinutes: 60 }
		});
		await text(page).fill('Remembered later');
		await page.getByTestId('finding-add').click();
		await expect(items(page).getByTestId('finding-time')).toHaveText(['at 45 min']);
	});
});

test.describe('edit details (FR-130 AC-6)', () => {
	test('edits charter, timebox, release, and environment, also of an ended session', async ({
		page
	}) => {
		await openSession(page, { session: { status: 'ended', endedAt: STARTED + 30 * MIN } });
		await page.getByTestId('session-edit').click();
		const dialog = page.getByRole('dialog', { name: 'Edit session details' });
		await expect(dialog.getByRole('textbox', { name: 'Charter' })).toHaveValue(
			'Explore withdraw limits'
		);
		await expect(dialog.getByRole('radio', { name: '60 min' })).toBeChecked();

		await dialog.getByRole('textbox', { name: 'Charter' }).fill(' ');
		await page.getByTestId('session-edit-save').click();
		await expect(dialog.getByText('Enter a charter.')).toBeVisible();
		await expect(dialog.getByRole('textbox', { name: 'Charter' })).toBeFocused();

		await dialog.getByRole('textbox', { name: 'Charter' }).fill('Explore deposit limits');
		await dialog.getByRole('radio', { name: 'Custom' }).check();
		await dialog.getByRole('textbox', { name: 'Minutes' }).fill('45');
		await dialog.getByRole('combobox', { name: 'Release (optional)' }).fill('v2.4.0');
		await page.getByTestId('session-edit-save').click();
		await expect(dialog).toBeHidden();
		await expect(toast(page)).toHaveText('Session details saved.');
		await expect(page.getByTestId('session-charter-heading')).toHaveText('Explore deposit limits');
		await expect(page.getByTestId('session-meta')).toContainText('Timebox 45 min');
		await expect(page.getByTestId('session-meta')).toContainText('Release v2.4.0');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Ended');

		await page.getByTestId('session-edit').click();
		await expect(dialog.getByRole('radio', { name: 'Custom' })).toBeChecked();
		await expect(dialog.getByRole('textbox', { name: 'Minutes' })).toHaveValue('45');

		const [stored] = await readStore<StoredSession>(page, 'sessions');
		expect(stored).toMatchObject({
			charter: 'Explore deposit limits',
			timeboxMinutes: 45,
			status: 'ended',
			endedAt: STARTED + 30 * MIN
		});
	});
});

test.describe('findings (FR-131)', () => {
	test('with none, the list says so; an empty finding is refused', async ({ page }) => {
		await openSession(page);
		await expect(page.getByTestId('session-findings-empty')).toHaveText(
			'No findings yet. Note what you observe as you go.'
		);
		await expect(composerType(page, 'Note')).toBeChecked();
		await page.getByTestId('finding-add').click();
		await expect(composer(page).getByText('Write the finding.')).toBeVisible();
		await expect(text(page)).toBeFocused();
		expect(await readStore(page, 'findings')).toEqual([]);
	});

	test('three findings from the keyboard only, focus back in the field each time (AC-4, NFR-008)', async ({
		page
	}) => {
		await stopClock(page);
		await openSession(page);
		await text(page).focus();
		for (const line of ['Max ignores the fee', 'Is the limit 10k?', 'Memo is optional']) {
			await page.keyboard.type(line);
			await page.keyboard.press('ControlOrMeta+Enter');
			await expect(text(page)).toHaveValue('');
			await expect(text(page)).toBeFocused();
		}
		await expect(items(page)).toHaveCount(3);
		await expect(items(page).getByTestId('finding-text-shown')).toHaveText([
			'Max ignores the fee',
			'Is the limit 10k?',
			'Memo is optional'
		]);
		await expect(items(page).first().getByTestId('finding-time')).toHaveText('at 23 min');
		await expect(page.getByTestId('session-finding-counts')).toHaveText('3 notes');

		const stored = await readStore<StoredFinding>(page, 'findings');
		expect(stored.map((f) => [f.type, f.at])).toEqual([
			['note', 23 * MIN],
			['note', 23 * MIN],
			['note', 23 * MIN]
		]);
	});

	test('lists in time order with type, and filters by type (AC-2)', async ({ page }) => {
		await openSession(page, {
			findings: [
				testFinding('f3', 's1', { type: 'bug', text: 'Wrong fee', at: 30 * MIN }),
				testFinding('f1', 's1', { type: 'question', text: 'Limit?', at: 2 * MIN }),
				testFinding('f2', 's1', { type: 'bug', text: 'Max ignores fee', at: 12 * MIN })
			]
		});
		await expect(items(page).getByTestId('finding-time')).toHaveText([
			'at 2 min',
			'at 12 min',
			'at 30 min'
		]);
		await expect(items(page).first()).toContainText('Question');
		await expect(page.getByTestId('session-finding-counts')).toHaveText('2 bugs · 1 question');

		await filter(page, 'Bug').check();
		await expect(items(page).getByTestId('finding-text-shown')).toHaveText([
			'Max ignores fee',
			'Wrong fee'
		]);
		await filter(page, 'Idea').check();
		await expect(page.getByTestId('session-findings-none')).toHaveText('No idea findings.');

		// A new finding of another type shows the whole list again, so it is not hidden.
		await text(page).fill('Use a slider');
		await composerType(page, 'Idea').check();
		await composerType(page, 'Note').check();
		await page.getByTestId('finding-add').click();
		await expect(filter(page, 'All')).toBeChecked();
		await expect(items(page)).toHaveCount(4);
	});

	test('edits a finding in place and keeps its time; Cancel keeps it as it was', async ({
		page
	}) => {
		await openSession(page, {
			findings: [testFinding('f1', 's1', { type: 'note', text: 'Fee wrong', at: 12 * MIN })]
		});
		await page.getByRole('button', { name: 'Edit the finding at 12 min' }).click();
		const edit = page.getByRole('form', { name: 'Edit the finding at 12 min' });
		await expect(edit.getByRole('textbox', { name: 'Finding' })).toBeFocused();
		await edit.getByRole('textbox', { name: 'Finding' }).fill('Changed');
		await edit.getByRole('button', { name: 'Cancel' }).click();
		await expect(items(page).getByTestId('finding-text-shown')).toHaveText('Fee wrong');
		await expect(page.getByRole('button', { name: 'Edit the finding at 12 min' })).toBeFocused();

		await page.getByRole('button', { name: 'Edit the finding at 12 min' }).click();
		await edit.getByRole('textbox', { name: 'Finding' }).fill('');
		await edit.getByRole('button', { name: 'Save' }).click();
		await expect(edit.getByText('Write the finding.')).toBeVisible();
		await edit.getByRole('radio', { name: 'Bug' }).check();
		await edit.getByRole('textbox', { name: 'Finding' }).fill('Fee shown as 0');
		await edit.getByRole('textbox', { name: 'Finding' }).press('ControlOrMeta+Enter');
		await expect(items(page).getByTestId('finding-text-shown')).toHaveText('Fee shown as 0');
		await expect(items(page)).toContainText('Bug');
		await expect(items(page).getByTestId('finding-time')).toHaveText('at 12 min');

		const [stored] = await readStore<StoredFinding>(page, 'findings');
		expect(stored).toMatchObject({ type: 'bug', text: 'Fee shown as 0', at: 12 * MIN });
	});

	test('screenshots go with the new finding, and are deleted with it (FR-112, EC-034)', async ({
		page
	}) => {
		await stopClock(page);
		await openSession(page);
		await composer(page)
			.getByLabel('Screenshot files')
			.setInputFiles([
				{ name: 'a.png', mimeType: 'image/png', buffer: png(64, 48) },
				{ name: 'b.png', mimeType: 'image/png', buffer: png(64, 48) }
			]);
		await expect(
			composer(page).getByRole('img', { name: 'Screenshot 2 of the new finding' })
		).toBeVisible();
		expect(await readStore(page, 'screenshots')).toEqual([]);

		await text(page).fill('Fee shown as 0');
		await page.getByTestId('finding-add').click();
		await expect(
			items(page).getByRole('img', { name: /^Screenshot [12] of the finding at 23 min$/ })
		).toHaveCount(2);
		await expect(composer(page).getByRole('img')).toHaveCount(0);
		const [finding] = await readStore<StoredFinding>(page, 'findings');
		const shots = await readStore<{ owner: unknown[] }>(page, 'screenshots');
		expect(shots.map((s) => s.owner)).toEqual([
			['finding', 's1', finding.id],
			['finding', 's1', finding.id]
		]);

		await page.reload();
		await expect(items(page).getByRole('img')).toHaveCount(2);
		await page.getByRole('button', { name: 'Delete the finding at 23 min' }).click();
		await expect(page.getByTestId('finding-delete-body')).toHaveText(
			'Its 2 screenshots are deleted too. This cannot be undone.'
		);
		await page.getByTestId('finding-confirm-delete').click();
		await expect(toast(page)).toHaveText('Finding deleted.');
		await expect(page.getByTestId('session-findings-empty')).toBeVisible();
		expect(await readStore(page, 'findings')).toEqual([]);
		expect(await readStore(page, 'screenshots')).toEqual([]);
	});

	test('a finding of a session deleted in another tab is not saved (EC-033)', async ({ page }) => {
		await openSession(page);
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					const request = indexedDB.open('qanchor');
					request.onsuccess = () => {
						const tx = request.result.transaction('sessions', 'readwrite');
						tx.objectStore('sessions').delete('s1');
						tx.oncomplete = () => (request.result.close(), resolve());
					};
				})
		);
		await text(page).fill('Lost?');
		await page.getByTestId('finding-add').click();
		await expect(page.getByTestId('finding-save-error')).toBeVisible();
		await expect(text(page)).toHaveValue('Lost?');
		expect(await readStore(page, 'findings')).toEqual([]);
	});
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations on a session in ${colorScheme} mode (NFR-009)`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme });
		await openSession(page, {
			session: { timeboxMinutes: 5, release: 'v2.3.0', environment: 'Android 14' },
			findings: [
				testFinding('f1', 's1', { type: 'bug', text: 'Wrong fee', at: 2 * MIN }),
				testFinding('f2', 's1', { type: 'question', text: 'Limit?', at: 3 * MIN }),
				testFinding('f3', 's1', { type: 'idea', text: 'Slider', at: 4 * MIN }),
				testFinding('f4', 's1', { type: 'note', text: 'Memo', at: 5 * MIN })
			]
		});
		await expect(page.getByTestId('session-timebox')).toHaveCount(1);
		await page.getByTestId('finding-add').click();
		await page.getByRole('button', { name: 'Edit the finding at 2 min' }).click();
		expect(await scanA11y(page)).toEqual([]);
	});
}
