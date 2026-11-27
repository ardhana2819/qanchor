import { describe, expect, it } from 'vitest';
import { sessionErrors } from '#lib/core/qa/validation.ts';
import {
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
