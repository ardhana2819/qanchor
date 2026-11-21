import { describe, expect, it } from 'vitest';
import {
	countStatuses,
	countsInWords,
	distinctReleases,
	issueHref,
	releaseKey,
	resultsByCase,
	snapshotCase,
	snapshotsForRun
} from './run.ts';
import type { TestCase } from './types.ts';

const testCase = (number: number): TestCase => ({
	id: `id-${number}`,
	number,
	title: `Case ${number}`,
	preconditions: 'Logged in',
	steps: [{ action: 'Open', expected: 'Opens' }],
	expected: 'Done',
	tags: ['smoke'],
	priority: 'medium',
	createdAt: 1,
	updatedAt: 2
});

describe('snapshots (FR-110 AC-3, EC-027)', () => {
	it('keeps the case fields and drops the timestamps', () => {
		expect(snapshotCase(testCase(3))).toEqual({
			id: 'id-3',
			number: 3,
			title: 'Case 3',
			preconditions: 'Logged in',
			steps: [{ action: 'Open', expected: 'Opens' }],
			expected: 'Done',
			tags: ['smoke'],
			priority: 'medium'
		});
	});

	it('is a deep copy that later edits to the case do not reach', () => {
		const source = testCase(1);
		const snapshot = snapshotCase(source);
		source.title = 'Edited';
		source.steps[0]!.action = 'Edited';
		source.steps.push({ action: 'New', expected: '' });
		source.tags.push('new');
		source.tags[0] = 'edited';
		expect(snapshot.title).toBe('Case 1');
		expect(snapshot.steps).toEqual([{ action: 'Open', expected: 'Opens' }]);
		expect(snapshot.tags).toEqual(['smoke']);
	});

	it('orders a new run by key, whatever the selection order', () => {
		const run = snapshotsForRun([testCase(12), testCase(2), testCase(100), testCase(1)]);
		expect(run.map((s) => s.number)).toEqual([1, 2, 12, 100]);
	});
});

describe('countsInWords', () => {
	it('names every status, zeros included, in a fixed order', () => {
		expect(countsInWords({ pass: 18, fail: 3, blocked: 2, untested: 17, total: 40 })).toBe(
			'18 passed, 3 failed, 2 blocked, 17 untested'
		);
		expect(countsInWords({ pass: 0, fail: 0, blocked: 0, untested: 0, total: 0 })).toBe(
			'0 passed, 0 failed, 0 blocked, 0 untested'
		);
	});
});

describe('countStatuses (FR-111 AC-2)', () => {
	const cases = [1, 2, 3, 4, 5].map((number) => ({ number }));
	const result = (caseNumber: number, status: 'pass' | 'fail' | 'blocked', runId = 'r1') => ({
		runId,
		caseNumber,
		status
	});

	it('counts every case as untested without results', () => {
		expect(countStatuses('r1', cases, [])).toEqual({
			pass: 0,
			fail: 0,
			blocked: 0,
			untested: 5,
			total: 5
		});
	});

	it('counts each status and leaves the rest untested', () => {
		const results = [result(1, 'pass'), result(2, 'fail'), result(3, 'blocked'), result(4, 'pass')];
		expect(countStatuses('r1', cases, results)).toEqual({
			pass: 2,
			fail: 1,
			blocked: 1,
			untested: 1,
			total: 5
		});
	});

	it('ignores results of another run and of cases not in the run', () => {
		const results = [result(1, 'pass', 'r2'), result(99, 'fail')];
		expect(countStatuses('r1', cases, results).untested).toBe(5);
	});

	it('maps results of one run by case number', () => {
		const map = resultsByCase('r1', [
			result(1, 'pass'),
			result(1, 'fail', 'r2'),
			result(2, 'fail')
		]);
		expect([...map.keys()]).toEqual([1, 2]);
		expect(map.get(1)?.status).toBe('pass');
	});
});

describe('releases (FR-110 AC-4, EC-031)', () => {
	it('treats case and surrounding spaces as the same release', () => {
		expect(releaseKey(' V2.3.0 ')).toBe(releaseKey('v2.3.0'));
		expect(releaseKey('2.3.0')).not.toBe(releaseKey('v2.3.0'));
	});

	it('lists each release once in its first spelling, without blanks', () => {
		expect(distinctReleases(['v2.3.0', ' V2.3.0 ', '', '  ', '2.3.0', 'v2.4.0 '])).toEqual([
			'v2.3.0',
			'2.3.0',
			'v2.4.0'
		]);
	});
});

describe('issueHref (FR-123 AC-2)', () => {
	it.each([
		[
			'https://example.atlassian.net/browse/PAY-123',
			'https://example.atlassian.net/browse/PAY-123'
		],
		['  http://localhost:8080/issues/4 ', 'http://localhost:8080/issues/4'],
		['HTTPS://Example.com', 'https://example.com/']
	])('links %j', (issue, href) => {
		expect(issueHref(issue)).toBe(href);
	});

	it.each([
		'',
		'PAY-123',
		'javascript:alert(1)',
		'data:text/html,x',
		'ftp://example.com/x',
		'mailto:a@b.c'
	])('shows %j as text', (issue) => {
		expect(issueHref(issue)).toBeNull();
	});
});
