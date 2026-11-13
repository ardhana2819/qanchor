import { describe, expect, it } from 'vitest';
import { parseThemePreference } from './theme.svelte.ts';

describe('parseThemePreference', () => {
	it('keeps an explicit light or dark choice', () => {
		expect(parseThemePreference('light')).toBe('light');
		expect(parseThemePreference('dark')).toBe('dark');
	});

	it('falls back to system for a missing, stale, or tampered value', () => {
		for (const value of [null, '', 'system', 'Dark', ' dark', 'neon']) {
			expect(parseThemePreference(value)).toBe('system');
		}
	});
});
