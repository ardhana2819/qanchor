import { loadRegions } from '#lib/core/dummy/data/regions.ts';
import { seedKey } from '#lib/core/dummy/random.ts';
import { generateRow, type DummyRow } from '#lib/core/dummy/rows.ts';
import { settingsErrors } from '#lib/core/dummy/settings.ts';
import type { DummyJobRequest, DummyJobResponse } from './messages.ts';

// Dummy data generation off the main thread (FR-080 AC-3, NFR-005, ADR-004). Runs lib/core only.

/** Rows between progress messages: about 20 updates for 10,000 rows, few enough to stay cheap. */
const PROGRESS_STEP = 500;

const post = (response: DummyJobResponse) => self.postMessage(response);

self.onmessage = async (event: MessageEvent<DummyJobRequest>) => {
	const { id, payload } = event.data;
	const { settings, seed } = payload;
	try {
		const errors = settingsErrors(settings);
		if (errors.length > 0)
			throw new Error(`Invalid settings: ${errors.map((e) => e.code).join(', ')}`);
		const regions = await loadRegions();
		const key = seedKey(seed);
		const rows: DummyRow[] = [];
		for (let index = 0; index < settings.count; index++) {
			rows.push(generateRow(key, index, regions, settings));
			const done = index + 1;
			if (done % PROGRESS_STEP === 0 && done < settings.count) {
				post({ type: 'progress', id, done, total: settings.count });
			}
		}
		post({ type: 'done', id, rows });
	} catch (error) {
		post({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
	}
};
