import type { ReleaseData } from '#lib/core/qa/release.ts';
import { runs } from '#lib/state/runs.svelte.ts';
import { sessions } from '#lib/state/sessions.svelte.ts';

// Releases are computed from runs and sessions on each visit, never stored (plan finding F-16),
// so both pages read the two stores and combine their states.

/** Browser only; call from onMount. */
export async function loadReleaseData(): Promise<void> {
	await Promise.all([runs.load(), sessions.load()]);
}

/** Read inside `$derived`: the stores' states are reactive. */
export function releaseDataStatus(): 'loading' | 'ready' | 'unavailable' {
	if (runs.status === 'unavailable' || sessions.status === 'unavailable') return 'unavailable';
	return runs.status === 'ready' && sessions.status === 'ready' ? 'ready' : 'loading';
}

/** Read inside `$derived`: the stores' records are reactive. */
export function releaseData(): ReleaseData {
	return {
		runs: runs.list,
		results: runs.results,
		sessions: sessions.list,
		findings: sessions.findings
	};
}
