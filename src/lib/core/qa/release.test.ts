import { describe, expect, it } from 'vitest';
import {
	findRelease,
	groupReleases,
	latestResults,
	NO_RELEASE,
	passRate,
	passRateText,
	releaseSummaryMarkdown,
	releaseTotals,
	type ReleaseData
} from './release.ts';
import type { CaseSnapshot, Finding, Run, Session, TestResult } from './types.ts';

const MIN = 60_000;

const snapshot = (number: number, title = `Case ${number}`): CaseSnapshot => ({
	id: `c${number}`,
	number,
	title,
	preconditions: '',
	steps: [],
	expected: 'x',
	tags: [],
	priority: 'medium'
});

const run = (
	id: string,
	release: string,
	createdAt: number,
	numbers: number[] = [],
	part: Partial<Run> = {}
): Run => ({
	id,
	name: `Run ${id}`,
	release,
	environment: '',
	status: 'in-progress',
	cases: numbers.map((n) => snapshot(n)),
	createdAt,
	updatedAt: createdAt,
	completedAt: null,
	...part
});

const result = (
	runId: string,
	caseNumber: number,
	status: TestResult['status'],
	updatedAt: number,
	part: Partial<TestResult> = {}
): TestResult => ({
	runId,
	caseNumber,
	status,
	failedStep: null,
	actual: '',
	reason: '',
	notes: '',
	linkedIssue: '',
	updatedAt,
	...part
});

const session = (
	id: string,
	release: string,
	createdAt: number,
	part: Partial<Session> = {}
): Session => ({
	id,
	charter: `Charter ${id}`,
	release,
	environment: '',
	timeboxMinutes: 60,
	status: 'ended',
	startedAt: createdAt,
	pausedAt: null,
	pausedMs: 0,
	endedAt: createdAt + 45 * MIN,
	createdAt,
	updatedAt: createdAt,
	...part
});

const finding = (sessionId: string, type: Finding['type'], updatedAt = 0): Finding => ({
	id: `${sessionId}-${type}-${updatedAt}`,
	sessionId,
	type,
	text: 'x',
	at: 0,
	createdAt: updatedAt,
	updatedAt
});

const empty: ReleaseData = { runs: [], results: [], sessions: [], findings: [] };

describe('groupReleases (FR-140 AC-1, AC-5, EC-031)', () => {
	it('lists each release once in its first spelling, latest activity first, No release last', () => {
		const groups = groupReleases({
			...empty,
			runs: [
				run('a', 'v2.3.0', 10),
				run('b', ' V2.3.0 ', 5),
				run('c', '2.3.0', 20),
				run('d', '', 30)
			],
			sessions: [session('s1', 'v2.4.0', 1), session('s2', '  ', 2)],
			results: [result('a', 1, 'pass', 100)],
			findings: [finding('s1', 'bug', 50)]
		});

		expect(groups.map((g) => [g.name, g.lastActivity])).toEqual([
			['V2.3.0', 100],
			['v2.4.0', 50],
			['2.3.0', 20],
			[NO_RELEASE, 30]
		]);
		// The first spelling used is the oldest record's (b), trimmed, not the first in the list.
		expect(groups[0].name).toBe('V2.3.0');
		expect(groups[0].runs.map((r) => r.id)).toEqual(['b', 'a']);
		expect(groups[3].runs.map((r) => r.id)).toEqual(['d']);
		expect(groups[3].sessions.map((s) => s.id)).toEqual(['s2']);
	});

	it('takes the spelling of the oldest record also when it is a session', () => {
		const [group] = groupReleases({
			...empty,
			runs: [run('a', 'V2.3.0', 10)],
			sessions: [session('s1', 'v2.3.0', 1)]
		});
		expect(group.name).toBe('v2.3.0');
	});

	it('is empty with nothing stored, and finds a release by any spelling', () => {
		expect(groupReleases(empty)).toEqual([]);
		const groups = groupReleases({ ...empty, runs: [run('a', 'v2.3.0', 1), run('b', '', 2)] });
		expect(findRelease(groups, ' V2.3.0')?.name).toBe('v2.3.0');
		expect(findRelease(groups, '')?.name).toBe(NO_RELEASE);
		expect(findRelease(groups, 'v9')).toBeNull();
	});
});

describe('latestResults (FR-140 AC-3)', () => {
	it('shows a retest that passed instead of the earlier failure', () => {
		const runs = [run('r1', 'v1', 1, [1, 2, 3]), run('r2', 'v1', 2, [2])];
		const rows = latestResults(runs, [
			result('r1', 1, 'pass', 10),
			result('r1', 2, 'fail', 10),
			result('r2', 2, 'pass', 20)
		]);
		expect(rows.map((r) => [r.item.number, r.result?.status ?? 'untested', r.runId])).toEqual([
			[1, 'pass', 'r1'],
			[2, 'pass', 'r2'],
			[3, 'untested', 'r1']
		]);
	});

	it('keeps an earlier result when the case is untested in a later run', () => {
		const runs = [run('r1', 'v1', 1, [1]), run('r2', 'v1', 2, [1])];
		const [row] = latestResults(runs, [result('r1', 1, 'fail', 10)]);
		expect(row.result?.status).toBe('fail');
		expect(row.runId).toBe('r1');
	});

	it('takes an untested case from the latest run that has it', () => {
		const runs = [
			run('r1', 'v1', 1, [7]),
			{ ...run('r2', 'v1', 2, []), cases: [snapshot(7, 'Renamed seven')] }
		];
		const [row] = latestResults(runs, []);
		expect([row.item.title, row.runId, row.result]).toEqual(['Renamed seven', 'r2', null]);
	});

	it('takes the result saved last, also from an older run, and the later run on a tie', () => {
		const runs = [run('r1', 'v1', 1, [1, 2]), run('r2', 'v1', 2, [1, 2])];
		const rows = latestResults(runs, [
			result('r1', 1, 'blocked', 30),
			result('r2', 1, 'pass', 20),
			result('r1', 2, 'fail', 20),
			result('r2', 2, 'pass', 20)
		]);
		expect(rows.map((r) => [r.item.number, r.result?.status, r.runId])).toEqual([
			[1, 'blocked', 'r1'],
			[2, 'pass', 'r2']
		]);
	});

	it('lists failed and blocked first, each part in key order, with the title of the result run', () => {
		const runs = [
			run('r1', 'v1', 1, [1, 2, 3, 4]),
			{ ...run('r2', 'v1', 2, []), cases: [snapshot(4, 'Renamed four')] }
		];
		const rows = latestResults(runs, [
			result('r1', 1, 'pass', 1),
			result('r1', 2, 'blocked', 1),
			result('r1', 3, 'pass', 1),
			result('r2', 4, 'fail', 2)
		]);
		expect(rows.map((r) => [r.item.number, r.item.title])).toEqual([
			[2, 'Case 2'],
			[4, 'Renamed four'],
			[1, 'Case 1'],
			[3, 'Case 3']
		]);
	});
});

describe('totals and pass rate (FR-141 AC-2, plan finding F-16)', () => {
	it('counts each case once and leaves untested out of the pass rate', () => {
		const runs = [run('r1', 'v1', 1, [1, 2, 3, 4]), run('r2', 'v1', 2, [2])];
		const totals = releaseTotals(
			latestResults(runs, [
				result('r1', 1, 'pass', 1),
				result('r1', 2, 'fail', 1),
				result('r2', 2, 'pass', 2),
				result('r1', 3, 'blocked', 1)
			])
		);
		expect(totals).toEqual({ pass: 2, fail: 0, blocked: 1, untested: 1, total: 4, executed: 3 });
		expect(passRate(totals)).toBe(66.7);
		expect(passRateText(totals)).toBe('66.7%');
	});

	it('rounds to one decimal and shows whole numbers with .0', () => {
		expect(passRateText({ pass: 112, executed: 120 })).toBe('93.3%');
		expect(passRateText({ pass: 1, executed: 1 })).toBe('100.0%');
		expect(passRateText({ pass: 0, executed: 5 })).toBe('0.0%');
		expect(passRateText({ pass: 1, executed: 8 })).toBe('12.5%');
	});

	it('has no pass rate with nothing executed', () => {
		expect(passRate({ pass: 0, executed: 0 })).toBeNull();
		expect(passRateText({ pass: 0, executed: 0 })).toBe('n/a');
	});
});

describe('releaseSummaryMarkdown (FR-141 AC-1)', () => {
	it('gives totals, the per-run table, open failures with issues, and sessions', () => {
		const data: ReleaseData = {
			runs: [
				run('r1', 'v2.3.0', 1, [1, 2, 3, 4], { name: 'Smoke | Android', status: 'completed' }),
				run('r2', 'v2.3.0', 2, [2, 5], { name: 'Retest' })
			],
			results: [
				result('r1', 1, 'pass', 1),
				result('r1', 2, 'fail', 1, { actual: 'Wrong fee\nmore detail' }),
				result('r1', 3, 'blocked', 1, { reason: 'No *testnet* funds', linkedIssue: 'PAY-12' }),
				result('r1', 4, 'fail', 1, {
					actual: 'Crash',
					linkedIssue: 'https://jira.example.com/browse/PAY-13'
				}),
				result('r2', 2, 'pass', 2)
			],
			sessions: [session('s1', 'v2.3.0', 3, { charter: 'Explore limits' })],
			findings: [finding('s1', 'bug', 1), finding('s1', 'bug', 2), finding('s1', 'question', 3)]
		};
		const [group] = groupReleases(data);

		expect(releaseSummaryMarkdown(group, data, 999 * MIN)).toBe(
			[
				'## Release: v2.3.0',
				'',
				'**Pass rate:** 50.0% (2 passed of 4 executed; untested cases are excluded)',
				'**Cases:** 5 (latest result per case): 2 passed, 1 failed, 1 blocked, 1 untested',
				'',
				'### Runs',
				'| Run | Status | Passed | Failed | Blocked | Untested |',
				'| --- | --- | ---: | ---: | ---: | ---: |',
				'| Smoke \\| Android | Completed | 1 | 2 | 1 | 0 |',
				'| Retest | In progress | 1 | 0 | 0 | 1 |',
				'',
				'### Open failures and blocks',
				'- TC-3 Case 3: Blocked. No \\*testnet\\* funds (PAY-12)',
				'- TC-4 Case 4: Failed. Crash (<https://jira.example.com/browse/PAY-13>)',
				'',
				'### Sessions',
				'| Session | Status | Time | Findings |',
				'| --- | --- | --- | --- |',
				'| Explore limits | Ended | 45 min | 2 bugs · 1 question |',
				''
			].join('\n')
		);
	});

	it('handles a release with sessions only and nothing executed', () => {
		const data: ReleaseData = { ...empty, sessions: [session('s1', '', 0)] };
		const [group] = groupReleases(data);
		expect(releaseSummaryMarkdown(group, data, 0)).toBe(
			[
				'## Release: No release',
				'',
				'**Pass rate:** n/a (no case executed yet)',
				'**Cases:** 0 (latest result per case): 0 passed, 0 failed, 0 blocked, 0 untested',
				'',
				'### Sessions',
				'| Session | Status | Time | Findings |',
				'| --- | --- | --- | --- |',
				'| Charter s1 | Ended | 45 min | No findings |',
				''
			].join('\n')
		);
	});
});
