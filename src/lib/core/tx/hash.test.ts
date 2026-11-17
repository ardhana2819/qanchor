import { describe, expect, it } from 'vitest';
import { err, ok } from '../result.ts';
import { parseTxHash } from './hash.ts';

const HEX = '5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060';
const SIG =
	'56MKLzSffLE68rGkPbvchJ1T7DPbPdWbfgMAzm4XbgTzVr6AuMWn5svAdYvJdF1yqXz3tftdUu2gxWv1kxgNXAqJ';

describe('parseTxHash (FR-040 AC-4)', () => {
	it('gives EVM hashes a 0x prefix and lower case', () => {
		expect(parseTxHash('evm', `0x${HEX}`)).toEqual(ok(`0x${HEX}`));
		expect(parseTxHash('evm', ` ${HEX.toUpperCase()} `)).toEqual(ok(`0x${HEX}`));
	});

	it('gives Tron and Bitcoin ids no prefix', () => {
		expect(parseTxHash('tron', `0x${HEX}`)).toEqual(ok(HEX));
		expect(parseTxHash('bitcoin', HEX.toUpperCase())).toEqual(ok(HEX));
	});

	it('refuses the wrong length or non-hex characters', () => {
		for (const input of [HEX.slice(1), `${HEX}0`, `0x${HEX.slice(0, 63)}g`, `0X${HEX}x`, SIG]) {
			expect(parseTxHash('evm', input), input).toEqual(err('format'));
			expect(parseTxHash('bitcoin', input), input).toEqual(err('format'));
		}
	});

	it('accepts a Base58 signature of 64 bytes for Solana only', () => {
		expect(parseTxHash('solana', ` ${SIG} `)).toEqual(ok(SIG));
		expect(parseTxHash('solana', HEX)).toEqual(err('format'));
		expect(parseTxHash('solana', SIG.slice(0, 40))).toEqual(err('format'));
		expect(parseTxHash('solana', `${SIG.slice(0, -1)}0`)).toEqual(err('format'));
	});

	it('reports empty input', () => {
		for (const chain of ['evm', 'solana', 'tron', 'bitcoin'] as const) {
			expect(parseTxHash(chain, '  ')).toEqual(err('empty'));
		}
	});
});
