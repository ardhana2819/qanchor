import { describe, expect, it } from 'vitest';
import { decodeHex, encodeHex } from './hex.ts';

describe('hex', () => {
	it('encodes lowercase, with or without the 0x prefix', () => {
		expect(encodeHex(Uint8Array.from([0, 0xab, 0xff]))).toBe('0x00abff');
		expect(encodeHex(Uint8Array.from([0, 0xab, 0xff]), false)).toBe('00abff');
		expect(encodeHex(new Uint8Array(0))).toBe('0x');
	});

	it('decodes either case, with or without the prefix', () => {
		for (const text of ['0x00ABff', '0X00abFF', '00abff']) {
			const result = decodeHex(text);
			expect(result.ok && [...result.value]).toEqual([0, 0xab, 0xff]);
		}
	});

	it.each([
		['', 'empty'],
		['0x', 'empty'],
		['0xabc', 'odd-length'],
		['0xzz', 'not-hex'],
		['0x 00', 'not-hex'],
		['0x0x00', 'not-hex']
	] as const)('rejects %j as %s', (text, error) => {
		expect(decodeHex(text)).toEqual({ ok: false, error });
	});

	it('round-trips every byte value', () => {
		const all = Uint8Array.from({ length: 256 }, (_, i) => i);
		const decoded = decodeHex(encodeHex(all));
		expect(decoded.ok && [...decoded.value]).toEqual([...all]);
	});
});
