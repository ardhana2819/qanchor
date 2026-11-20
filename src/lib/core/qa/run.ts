import type { CaseSnapshot, ResultStatus, TestCase, TestResult } from './types.ts';

// Rules of a run: snapshots, progress counts, releases, and linked issues.

/** A deep copy of the fields a run keeps, so later edits to the case never reach it (FR-110 AC-3). */
export function snapshotCase(item: TestCase | CaseSnapshot): CaseSnapshot {
	return {
		id: item.id,
		number: item.number,
		title: item.title,
		preconditions: item.preconditions,
		steps: item.steps.map((step) => ({ action: step.action, expected: step.expected })),
		expected: item.expected,
		tags: [...item.tags],
		priority: item.priority
	};
}

/** The snapshots of a new run, in key order whatever the selection order (design 13.9). */
export function snapshotsForRun(cases: readonly (TestCase | CaseSnapshot)[]): CaseSnapshot[] {
	return cases.map(snapshotCase).sort((a, b) => a.number - b.number);
}

export type StatusCounts = Record<ResultStatus | 'untested', number> & { total: number };

/**
 * Counts per status for a run (FR-111 AC-2). A case without a result is untested; a result for a
 * case that is not in the run, or for another run, is ignored.
 */
export function countStatuses(
	runId: string,
	cases: readonly Pick<CaseSnapshot, 'number'>[],
	results: readonly Pick<TestResult, 'runId' | 'caseNumber' | 'status'>[]
): StatusCounts {
	const statusOf = resultsByCase(runId, results);
	const counts: StatusCounts = { pass: 0, fail: 0, blocked: 0, untested: 0, total: cases.length };
	for (const { number } of cases) counts[statusOf.get(number)?.status ?? 'untested'] += 1;
	return counts;
}

/** The results of one run by case number. */
export function resultsByCase<T extends Pick<TestResult, 'runId' | 'caseNumber'>>(
	runId: string,
	results: readonly T[]
): Map<number, T> {
	const map = new Map<number, T>();
	for (const result of results) if (result.runId === runId) map.set(result.caseNumber, result);
	return map;
}

/**
 * The form two releases are compared in: `v2.3.0` and ` V2.3.0 ` are one release, `2.3.0` is
 * another (FR-110 AC-4, EC-031).
 */
export function releaseKey(release: string): string {
	return release.trim().toLowerCase();
}

/**
 * Distinct releases, trimmed, in the spelling first seen, without blanks. Pass values oldest
 * first so the first spelling used is the one shown (EC-031).
 */
export function distinctReleases(releases: Iterable<string>): string[] {
	const byKey = new Map<string, string>();
	for (const release of releases) {
		const key = releaseKey(release);
		if (key !== '' && !byKey.has(key)) byKey.set(key, release.trim());
	}
	return [...byKey.values()];
}

/**
 * The link for a linked issue, or null when it is not an `http:` or `https:` URL and is shown as
 * plain text, like a key such as `PAY-123` (FR-123 AC-2).
 */
export function issueHref(issue: string): string | null {
	const text = issue.trim();
	if (!URL.canParse(text)) return null;
	const url = new URL(text);
	return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
}
