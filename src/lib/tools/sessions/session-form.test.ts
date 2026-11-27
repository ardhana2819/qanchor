import { describe, expect, it } from 'vitest';
import { SessionForm } from './session-form.svelte.ts';

describe('SessionForm (FR-130 AC-1, AC-6)', () => {
	it('starts empty with the default timebox, and shows no error before a save', () => {
		const form = new SessionForm();
		expect(form.draft).toEqual({ charter: '', timeboxMinutes: 60, release: '', environment: '' });
		expect(form.errors.size).toBe(0);
	});

	it('validates on save, then shows each error until fixed', () => {
		const form = new SessionForm();
		expect(form.validate()).toBe('charter');
		expect(form.errors.get('charter')).toBe('Enter a charter.');
		form.charter = 'Explore';
		form.choice = 'custom';
		form.custom = '481';
		expect(form.errors.get('timebox')).toBe('Timebox from 5 to 480 minutes.');
		expect(form.validate()).toBe('timebox');
		form.custom = '480';
		expect(form.validate()).toBeNull();
	});

	it('loads a stored session, a custom timebox as Custom', () => {
		const form = new SessionForm({
			charter: 'Explore',
			timeboxMinutes: 45,
			release: 'v2',
			environment: 'Pixel'
		});
		expect([form.choice, form.custom]).toEqual(['custom', '45']);
		expect(form.draft.timeboxMinutes).toBe(45);
	});

	it('saves trimmed text', () => {
		const form = new SessionForm();
		form.charter = '  Explore  ';
		form.release = ' v2 ';
		form.environment = ' Pixel \n';
		expect(form.input).toEqual({
			charter: 'Explore',
			timeboxMinutes: 60,
			release: 'v2',
			environment: 'Pixel'
		});
	});
});
