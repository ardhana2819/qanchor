import { describe, expect, it } from 'vitest';
import {
	otherCasesText,
	passRateDetail,
	releaseCountsText,
	releaseQuery,
	requestedRelease,
	unknownReleaseText
} from './present.ts';

const params = (query: string) => new URLSearchParams(query);

describe('releaseQuery', () => {
	it('carries the first spelling, encoded', () => {
		expect(releaseQuery({ key: 'v2.3.0 rc&1', name: 'V2.3.0 rc&1' })).toBe('name=V2.3.0%20rc%261');
	});

	it('uses `none` for "No release" (plan finding F-16)', () => {
		expect(releaseQuery({ key: '', name: 'No release' })).toBe('none');
	});

	it('round-trips through requestedRelease', () => {
		const name = 'Sprint #4 / ä';
		expect(requestedRelease(params(releaseQuery({ key: name.toLowerCase(), name })))).toBe(name);
	});
});

describe('requestedRelease', () => {
	it('reads the name, trimmed', () => {
		expect(requestedRelease(params('name=%20v2.3.0%20'))).toBe('v2.3.0');
	});

	it('reads `none` as "No release", even beside a name', () => {
		expect(requestedRelease(params('none'))).toBe('');
		expect(requestedRelease(params('none&name=v1'))).toBe('');
	});

	it('is null when the URL names no release (EC-028)', () => {
		expect(requestedRelease(params(''))).toBeNull();
		expect(requestedRelease(params('name='))).toBeNull();
		expect(requestedRelease(params('name=%20%20'))).toBeNull();
		expect(requestedRelease(params('id=v1'))).toBeNull();
	});
});

describe('copy', () => {
	it('names the unknown release (design 13.7)', () => {
		expect(unknownReleaseText('v9')).toBe('No run or session uses the release "v9".');
	});

	it('states the numbers behind the pass rate (FR-141 AC-2)', () => {
		expect(passRateDetail({ pass: 112, executed: 120 })).toBe('from 112 of 120 executed');
		expect(passRateDetail({ pass: 0, executed: 0 })).toBe('No case executed yet');
	});

	it('counts runs and sessions in words', () => {
		expect(releaseCountsText({ runs: [{}, {}] as never, sessions: [{}] as never })).toBe(
			'2 runs · 1 session'
		);
		expect(releaseCountsText({ runs: [], sessions: [] })).toBe('0 runs · 0 sessions');
	});

	it('labels the disclosure of the cases that are not open', () => {
		expect(otherCasesText(96, 0)).toBe('Show 96 passed');
		expect(otherCasesText(1200, 4)).toBe('Show 1,200 passed and 4 untested');
		expect(otherCasesText(0, 4)).toBe('Show 4 untested');
	});
});
