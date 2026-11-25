import { describe, expect, it } from 'vitest';
import { usageText } from './storage-status.ts';

describe('usageText (design 13.3 S-10)', () => {
	it('names the use and the estimated quota', () => {
		expect(usageText(38_000_000, 2_000_000_000)).toBe('38 MB of about 2 GB used');
		expect(usageText(0, 1_900_000_000)).toBe('0 bytes of about 1.9 GB used');
	});

	it('names the use alone where the browser gives no quota', () => {
		expect(usageText(512_000, undefined)).toBe('512 KB used');
		expect(usageText(512_000, 0)).toBe('512 KB used');
	});
});
