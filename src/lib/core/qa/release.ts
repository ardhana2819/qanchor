import { releaseKey, resultsByCase, countStatuses, type StatusCounts } from './run.ts';
import { countFindings, durationText, elapsedMs, findingCountsText } from './session.ts';
import { escapeInlineMarkdown, oneLine, openResultLine } from './summary.ts';
import type { CaseSnapshot, Finding, Run, Session, TestResult } from './types.ts';

// The release summary (FR-140, FR-141, plan finding F-16). Releases are computed from the runs
// and sessions on each visit, never stored. Totals and the pass rate come from the latest result
// per case, so a retest that passed after a fix is not counted as an open failure.

/** The group of runs and sessions without a release (FR-140 AC-5). */
export const NO_RELEASE = 'No release';

export interface ReleaseData {
	runs: readonly Run[];
	results: readonly TestResult[];
	sessions: readonly Session[];
	findings: readonly Finding[];
}

export interface ReleaseGroup {
	/** `releaseKey` of the release; '' for "No release". */
	key: string;
	/** The first spelling used (EC-031), or NO_RELEASE. */
	name: string;
	/** Oldest first. */
	runs: Run[];
	/** Oldest first. */
	sessions: Session[];
	/** The latest change to a run, result, session, or finding of the release. */
	lastActivity: number;
}

/**
 * Every release used by a run or a session, listed once (FR-140 AC-1, FR-110 AC-4), latest
 * activity first, and "No release" last when anything has none (AC-5).
 */
export function groupReleases(data: ReleaseData): ReleaseGroup[] {
	const groups = new Map<string, ReleaseGroup>();
	/** When each release's shown spelling was used, to keep the oldest one (EC-031). */
	const named = new Map<string, number>();
	const groupOf = (release: string, createdAt: number) => {
		const key = releaseKey(release);
		let group = groups.get(key);
		if (!group) {
			group = { key, name: '', runs: [], sessions: [], lastActivity: 0 };
			groups.set(key, group);
		}
		if (key !== '' && createdAt < (named.get(key) ?? Infinity)) {
			named.set(key, createdAt);
			group.name = release.trim();
		}
		return group;
	};

	const runGroups = new Map<string, ReleaseGroup>();
	for (const run of data.runs) {
		const group = groupOf(run.release, run.createdAt);
		group.runs.push(run);
		group.lastActivity = Math.max(group.lastActivity, run.updatedAt);
		runGroups.set(run.id, group);
	}
	for (const result of data.results) {
		const group = runGroups.get(result.runId);
		if (group) group.lastActivity = Math.max(group.lastActivity, result.updatedAt);
	}
	const sessionGroups = new Map<string, ReleaseGroup>();
	for (const session of data.sessions) {
		const group = groupOf(session.release, session.createdAt);
		group.sessions.push(session);
		group.lastActivity = Math.max(group.lastActivity, session.updatedAt);
		sessionGroups.set(session.id, group);
	}
	for (const finding of data.findings) {
		const group = sessionGroups.get(finding.sessionId);
		if (group) group.lastActivity = Math.max(group.lastActivity, finding.updatedAt);
	}

	return [...groups.values()]
		.map((group) => ({
			...group,
			name: group.key === '' ? NO_RELEASE : group.name,
			runs: group.runs.sort((a, b) => a.createdAt - b.createdAt),
			sessions: group.sessions.sort((a, b) => a.createdAt - b.createdAt)
		}))
		.sort((a, b) => Number(a.key === '') - Number(b.key === '') || b.lastActivity - a.lastActivity);
}

/** The group a release page shows: by any spelling of the release, or '' for "No release". */
export function findRelease(groups: readonly ReleaseGroup[], release: string): ReleaseGroup | null {
	const key = releaseKey(release);
	return groups.find((group) => group.key === key) ?? null;
}

export interface LatestRow {
	item: CaseSnapshot;
	/** The most recent result of the case in the release; null when no run has one. */
	result: TestResult | null;
	/** The run the result is from, or the latest run with the case when untested. */
	runId: string;
}

const isOpen = (row: LatestRow) => row.result !== null && row.result.status !== 'pass';

/**
 * Each case of the release once, with its most recent result over all its runs (FR-140 AC-3).
 * Cases are matched by key; the most recent result is the one saved last, and on a tie the one
 * from the later run. The case's title is from that result's run. Failed and blocked come first
 * (design 13.3 P2-07), each part in key order.
 */
export function latestResults(runs: readonly Run[], results: readonly TestResult[]): LatestRow[] {
	const rows = new Map<number, LatestRow>();
	for (const run of [...runs].sort((a, b) => a.createdAt - b.createdAt)) {
		const byCase = resultsByCase(run.id, results);
		for (const item of run.cases) {
			const result = byCase.get(item.number) ?? null;
			const row = rows.get(item.number);
			const newer =
				!row ||
				(result !== null && (row.result === null || result.updatedAt >= row.result.updatedAt)) ||
				(result === null && row.result === null);
			if (newer) rows.set(item.number, { item, result, runId: run.id });
		}
	}
	return [...rows.values()].sort(
		(a, b) => Number(isOpen(b)) - Number(isOpen(a)) || a.item.number - b.item.number
	);
}

export type ReleaseTotals = StatusCounts & { executed: number };

/** Counts over the latest result per case (plan finding F-16); executed = passed + failed + blocked. */
export function releaseTotals(rows: readonly LatestRow[]): ReleaseTotals {
	const totals: ReleaseTotals = {
		pass: 0,
		fail: 0,
		blocked: 0,
		untested: 0,
		total: rows.length,
		executed: 0
	};
	for (const { result } of rows) totals[result?.status ?? 'untested'] += 1;
	totals.executed = totals.pass + totals.fail + totals.blocked;
	return totals;
}

/** Passed over executed in percent, rounded to one decimal; null with nothing executed. */
export function passRate(totals: Pick<ReleaseTotals, 'pass' | 'executed'>): number | null {
	if (totals.executed === 0) return null;
	return Math.round((totals.pass * 1000) / totals.executed) / 10;
}

/** "93.3%" with one decimal (FR-141 AC-2), or "n/a" with nothing executed. */
export function passRateText(totals: Pick<ReleaseTotals, 'pass' | 'executed'>): string {
	const rate = passRate(totals);
	return rate === null ? 'n/a' : `${rate.toFixed(1)}%`;
}

const RUN_STATUS: Record<Run['status'], string> = {
	'in-progress': 'In progress',
	completed: 'Completed'
};

const SESSION_STATUS: Record<Session['status'], string> = {
	running: 'Running',
	paused: 'Paused',
	ended: 'Ended'
};

/**
 * The release summary as Markdown (FR-141): totals and the pass rate with the numbers it comes
 * from, a table per run with its own counts, the open failures and blocks with linked issues,
 * and the sessions with their findings counts. Ends with one newline.
 */
export function releaseSummaryMarkdown(
	group: ReleaseGroup,
	data: Pick<ReleaseData, 'results' | 'findings'>,
	now: number
): string {
	const md = (text: string) => escapeInlineMarkdown(oneLine(text));
	const rows = latestResults(group.runs, data.results);
	const totals = releaseTotals(rows);
	const lines = [`## Release: ${md(group.name)}`, ''];

	lines.push(
		totals.executed === 0
			? '**Pass rate:** n/a (no case executed yet)'
			: `**Pass rate:** ${passRateText(totals)} (${totals.pass} passed of ${totals.executed} executed; untested cases are excluded)`,
		`**Cases:** ${totals.total} (latest result per case): ${totals.pass} passed, ` +
			`${totals.fail} failed, ${totals.blocked} blocked, ${totals.untested} untested`
	);

	if (group.runs.length > 0) {
		lines.push(
			'',
			'### Runs',
			'| Run | Status | Passed | Failed | Blocked | Untested |',
			'| --- | --- | ---: | ---: | ---: | ---: |'
		);
		for (const run of group.runs) {
			const counts = countStatuses(run.id, run.cases, data.results);
			lines.push(
				`| ${md(run.name)} | ${RUN_STATUS[run.status]} | ${counts.pass} | ${counts.fail} | ` +
					`${counts.blocked} | ${counts.untested} |`
			);
		}
	}

	const open = rows.filter(isOpen);
	if (open.length > 0) {
		lines.push('', '### Open failures and blocks');
		for (const { item, result } of open) if (result) lines.push(openResultLine(item, result));
	}

	if (group.sessions.length > 0) {
		lines.push(
			'',
			'### Sessions',
			'| Session | Status | Time | Findings |',
			'| --- | --- | --- | --- |'
		);
		for (const session of group.sessions) {
			const counts = countFindings(data.findings.filter((f) => f.sessionId === session.id));
			lines.push(
				`| ${md(session.charter)} | ${SESSION_STATUS[session.status]} | ` +
					`${durationText(elapsedMs(session, now))} | ${findingCountsText(counts)} |`
			);
		}
	}
	return `${lines.join('\n')}\n`;
}
