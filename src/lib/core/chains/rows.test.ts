import { describe, expect, it } from 'vitest';
import { MAX_COUNT, TARGETS } from './catalog.ts';
import { validateAddress } from './dispatch.ts';
import { generateRows } from './rows.ts';

// One generation (T-021): FR-010 AC-1, AC-2; FR-011 AC-1; FR-012 AC-1.

describe('generateRows', () => {
	it('gives exactly N valid addresses, then one row per variant, in order (FR-010 AC-1)', () => {
		const rows = generateRows({
			target: { chain: 'evm' },
			count: 3,
			variants: ['wrong-checksum', 'zero-address']
		});

		expect(rows.map((r) => r.validity)).toEqual(['valid', 'valid', 'valid', 'invalid', 'risky']);
		expect(rows.map((r) => r.variantId)).toEqual([
			'evm.valid',
			'evm.valid',
			'evm.valid',
			'evm.wrong-checksum',
			'evm.zero-address'
		]);
	});

	it('every row carries the export fields (FR-012 AC-1)', () => {
		const [row] = generateRows({
			target: { chain: 'bitcoin', type: 'p2tr', network: 'testnet' },
			count: 1,
			variants: []
		});
		expect(row).toMatchObject({
			chain: 'bitcoin',
			type: 'p2tr',
			network: 'testnet',
			validity: 'valid',
			label: 'P2TR',
			reason: 'Bech32m, witness v1, 32-byte tweaked key (BIP-86).'
		});
		expect(row.address.startsWith('tb1p')).toBe(true);
	});

	it.each(TARGETS)('valid rows pass their validator: %j', (target) => {
		for (const row of generateRows({ target, count: 20, variants: [] })) {
			expect(validateAddress(target, row.address)).toEqual({ ok: true, value: {} });
			expect(row.reason).toMatch(/\.$/);
		}
	});

	it('names the version byte for Base58 Bitcoin types', () => {
		const reason = (type: 'p2pkh' | 'p2sh', network: 'mainnet' | 'testnet') =>
			generateRows({ target: { chain: 'bitcoin', type, network }, count: 1, variants: [] })[0]
				.reason;
		expect(reason('p2pkh', 'mainnet')).toBe('Base58Check with version byte 0x00.');
		expect(reason('p2pkh', 'testnet')).toBe('Base58Check with version byte 0x6f.');
		expect(reason('p2sh', 'mainnet')).toBe(
			'Base58Check with version byte 0x05, a P2SH-wrapped P2WPKH script.'
		);
	});

	it('generates the maximum of 500', () => {
		expect(
			generateRows({ target: { chain: 'solana' }, count: MAX_COUNT, variants: [] })
		).toHaveLength(500);
	});

	it.each([0, -1, 501, 1.5, Number.NaN])('rejects a count of %s (FR-010 AC-3)', (count) => {
		expect(() => generateRows({ target: { chain: 'evm' }, count, variants: [] })).toThrow(
			RangeError
		);
	});

	it('rejects a variant that does not apply to the target', () => {
		expect(() =>
			generateRows({ target: { chain: 'tron' }, count: 1, variants: ['missing-prefix'] })
		).toThrow(RangeError);
	});
});
