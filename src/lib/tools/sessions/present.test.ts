import { describe, expect, it } from 'vitest';
import { sessionErrors } from '#lib/core/qa/validation.ts';
import type { Session } from '#lib/core/qa/types.ts';
import {
	clockLine,
	deleteFindingBody,
	FINDING_FILTER_OPTIONS,
	FINDING_TYPE_OPTIONS,
	findingTextError,
	noFindingsOfType,
	timeboxChoiceOf,
	deletedSessionText,
	deleteSessionBody,
	deleteSessionTitle,
	sessionErrorsByField,
	TIMEBOX_OPTIONS,
	timeboxMinutes
} from './present.ts';

const draft = {
	charter: 'Explore withdraw limits',
	timeboxMinutes: 60,
	release: '',
	environment: ''
};

describe('timebox (FR-130 AC-1, design 13.3 P2-06)', () => {
	it('offers 30, 60, 90 minutes, then Custom', () => {
		expect(TIMEBOX_OPTIONS.map((o) => o.label)).toEqual(['30 min', '60 min', '90 min', 'Custom']);
	});

	it('takes a preset as it is and ignores the minutes field', () => {
		expect(timeboxMinutes('30', 'x')).toBe(30);
		expect(timeboxMinutes('90', '')).toBe(90);
	});

	it('reads Custom from the minutes field, whole numbers only', () => {
		expect(timeboxMinutes('custom', ' 45 ')).toBe(45);
		expect(timeboxMinutes('custom', '')).toBeNaN();
		expect(timeboxMinutes('custom', '4.5')).toBeNaN();
		expect(timeboxMinutes('custom', '-5')).toBeNaN();
		expect(timeboxMinutes('custom', '1e2')).toBeNaN();
	});
});

describe('sessionErrorsByField (design 13.7)', () => {
	const errors = (part: Partial<typeof draft>) =>
		sessionErrorsByField(sessionErrors({ ...draft, ...part }));

	it('has no error for a valid draft', () => {
		expect(errors({}).size).toBe(0);
	});

	it('asks for a charter', () => {
		expect(errors({ charter: '  ' }).get('charter')).toBe('Enter a charter.');
	});

	it('gives the timebox range at 4 and 481 minutes, and with an empty Custom field', () => {
		for (const minutes of [4, 481, NaN]) {
			expect(errors({ timeboxMinutes: minutes }).get('timebox')).toBe(
				'Timebox from 5 to 480 minutes.'
			);
		}
		expect(errors({ timeboxMinutes: 5 }).has('timebox')).toBe(false);
		expect(errors({ timeboxMinutes: 480 }).has('timebox')).toBe(false);
	});

	it('gives the length limit of a long charter, release, or environment', () => {
		const result = errors({
			charter: 'x'.repeat(201),
			release: 'x'.repeat(201),
			environment: 'x'.repeat(5001)
		});
		expect(result.get('charter')).toBe('Up to 200 characters.');
		expect(result.get('release')).toBe('Up to 200 characters.');
		expect(result.get('environment')).toBe('Up to 5,000 characters.');
	});
});

describe('delete copy', () => {
	it('names the findings and screenshots deleted with the session', () => {
		expect(deleteSessionBody(0, 0)).toBe('It has no findings. This cannot be undone.');
		expect(deleteSessionBody(1, 0)).toBe('Its 1 finding is deleted too. This cannot be undone.');
		expect(deleteSessionBody(3, 0)).toBe('Its 3 findings are deleted too. This cannot be undone.');
		expect(deleteSessionBody(3, 1)).toBe(
			'Its 3 findings and 1 screenshot are deleted too. This cannot be undone.'
		);
		expect(deleteSessionBody(1, 2)).toBe(
			'Its 1 finding and 2 screenshots are deleted too. This cannot be undone.'
		);
	});

	it('titles the dialog and the toast with the charter', () => {
		expect(deleteSessionTitle('Explore limits')).toBe('Delete session "Explore limits"?');
		expect(deletedSessionText('Explore limits')).toBe('Deleted session "Explore limits".');
	});
});

const MIN = 60_000;
const T0 = 1_800_000_000_000;
const session = (part: Partial<Session> = {}): Session => ({
	id: 's1',
	charter: 'Explore',
	release: '',
	environment: '',
	timeboxMinutes: 60,
	status: 'running',
	startedAt: T0,
	pausedAt: null,
	pausedMs: 0,
	endedAt: null,
	createdAt: T0,
	updatedAt: T0,
	...part
});

describe('clockLine (FR-130 AC-2, AC-6; design 13.9 decision 2)', () => {
	it('shows elapsed and left while running, over past the timebox', () => {
		expect(clockLine(session(), T0 + 23 * MIN + 59_999)).toBe('23 min elapsed · 37 min left');
		expect(clockLine(session(), T0 + 65 * MIN)).toBe('65 min elapsed · 5 min over');
	});

	it('says paused, and stands still while paused', () => {
		const paused = session({ status: 'paused', pausedAt: T0 + 10 * MIN });
		expect(clockLine(paused, T0 + 99 * MIN)).toBe('10 min elapsed · 50 min left · paused');
	});

	it('gives the total once ended', () => {
		const ended = session({ status: 'ended', endedAt: T0 + 65 * MIN });
		expect(clockLine(ended, T0 + 999 * MIN)).toBe('Ended after 1 h 5 min');
	});
});

describe('timeboxChoiceOf (FR-130 AC-6)', () => {
	it('picks the preset, or Custom with the minutes', () => {
		expect(timeboxChoiceOf(90)).toEqual({ choice: '90', custom: '' });
		expect(timeboxChoiceOf(45)).toEqual({ choice: 'custom', custom: '45' });
	});
});

describe('findings copy (FR-131)', () => {
	it('offers the four types, and All before them in the filter', () => {
		expect(FINDING_TYPE_OPTIONS.map((o) => o.label)).toEqual(['Bug', 'Question', 'Idea', 'Note']);
		expect(FINDING_FILTER_OPTIONS.map((o) => o.value)).toEqual([
			'all',
			'bug',
			'question',
			'idea',
			'note'
		]);
	});

	it('asks for the text, and gives the length limit', () => {
		expect(findingTextError([])).toBeUndefined();
		expect(findingTextError([{ field: 'text', problem: { kind: 'required' } }])).toBe(
			'Write the finding.'
		);
		expect(findingTextError([{ field: 'text', problem: { kind: 'too-long', max: 5000 } }])).toBe(
			'Up to 5,000 characters.'
		);
	});

	it('names an empty filter and the screenshots of a deleted finding', () => {
		expect(noFindingsOfType('question')).toBe('No question findings.');
		expect(deleteFindingBody(0)).toBe('This cannot be undone.');
		expect(deleteFindingBody(1)).toBe('Its 1 screenshot is deleted too. This cannot be undone.');
		expect(deleteFindingBody(3)).toBe('Its 3 screenshots are deleted too. This cannot be undone.');
	});
});
