import { describe, expect, it } from 'vitest';
import { isValidTag, normalizeTag, normalizeTags, suggestTags, TAG_MAX_LENGTH } from './tags.ts';

describe('tags (FR-100 AC-5, PRD 10.5)', () => {
	it('trims and lowercases', () => {
		expect(normalizeTag('  Deposit ')).toBe('deposit');
		expect(normalizeTag('USDT-TRC20')).toBe('usdt-trc20');
	});

	it('drops blanks and duplicates, keeping the first position', () => {
		expect(normalizeTags(['Deposit', 'smoke', ' deposit', '', '  ', 'SMOKE', 'tron'])).toEqual([
			'deposit',
			'smoke',
			'tron'
		]);
	});

	it('keeps invalid tags so the editor can flag them', () => {
		expect(normalizeTags(['a b', 'ok'])).toEqual(['a b', 'ok']);
	});

	it.each(['a', 'v2.3.0', 'usdt_trc20', 'e-wallet', 'deposit', 'é', 'ünïcödé', '日本'])(
		'accepts %j',
		(tag) => expect(isValidTag(tag)).toBe(true)
	);

	it.each(['', 'a b', 'tag/1', '#smoke', 'emoji🙂', 'a,b'])('rejects %j', (tag) => {
		expect(isValidTag(tag)).toBe(false);
	});

	it('allows 32 characters and refuses 33', () => {
		expect(isValidTag('a'.repeat(TAG_MAX_LENGTH))).toBe(true);
		expect(isValidTag('a'.repeat(TAG_MAX_LENGTH + 1))).toBe(false);
	});

	it('counts a letter outside the BMP as one character', () => {
		expect(isValidTag('𝐀'.repeat(TAG_MAX_LENGTH))).toBe(true);
	});

	describe('suggestTags', () => {
		const known = ['deposit', 'deposit-tron', 'withdraw', 'smoke', 'deposit'];

		it('suggests known tags with the typed prefix, sorted, once each', () => {
			expect(suggestTags(known, ' DEP', [])).toEqual(['deposit', 'deposit-tron']);
		});

		it('leaves out tags the case already has', () => {
			expect(suggestTags(known, 'dep', ['deposit'])).toEqual(['deposit-tron']);
		});

		it('suggests nothing for empty input or no match', () => {
			expect(suggestTags(known, '  ', [])).toEqual([]);
			expect(suggestTags(known, 'zzz', [])).toEqual([]);
		});
	});
});
