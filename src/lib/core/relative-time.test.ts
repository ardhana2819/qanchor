import { describe, expect, it } from 'vitest';
import { fullDateTime, relativeTime } from './relative-time.ts';

const now = Date.UTC(2026, 10, 20, 12, 0, 0);
const ago = (ms: number) => relativeTime(now - ms, now);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
	it.each([
		[0, 'just now'],
		[59_999, 'just now'],
		[MIN, '1 minute ago'],
		[59 * MIN, '59 minutes ago'],
		[HOUR, '1 hour ago'],
		[23 * HOUR, '23 hours ago'],
		[DAY, 'yesterday'],
		[6 * DAY, '6 days ago']
	])('%i ms ago reads "%s"', (ms, text) => {
		expect(ago(ms)).toBe(text);
	});

	it('shows the date from a week on', () => {
		expect(ago(7 * DAY)).toMatch(/^1[23] Nov 2026$/);
	});

	it('reads a time in the future (another clock) as just now', () => {
		expect(relativeTime(now + HOUR, now)).toBe('just now');
	});
});

describe('fullDateTime', () => {
	it('gives the date and the time', () => {
		expect(fullDateTime(now)).toMatch(/^2[01] Nov 2026, \d{2}:\d{2}$/);
	});
});
