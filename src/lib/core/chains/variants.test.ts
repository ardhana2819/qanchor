import { describe, expect, it } from 'vitest';
import { TARGETS, validateAddress, type AddressTarget } from './targets.ts';
import type { AddressDefect } from './types.ts';
import {
	buildVariant,
	invalidVariantsFor,
	lookAlikeSource,
	riskySamplesFor,
	type VariantId
} from './variants.ts';

// Invalid variants and risky samples (T-020): FR-011 AC-2 to AC-5, EC-007. Every variant is built
// for every target it applies to, many times, and must fail that target's validator.

const RUNS = 25;

const name = (t: AddressTarget) =>
	t.chain === 'bitcoin' ? `bitcoin ${t.type} ${t.network}` : t.chain;

/** The defect each variant must be reported as; look-alikes depend on the pair of chains. */
const EXPECTED_DEFECT: Partial<Record<VariantId, AddressDefect>> = {
	'wrong-checksum': 'bad-checksum',
	'invalid-character': 'invalid-character',
	'wrong-length': 'wrong-length',
	'bad-checksum': 'bad-checksum',
	'wrong-network': 'wrong-network',
	'wrong-encoding': 'wrong-encoding',
	'mixed-case': 'mixed-case',
	'missing-prefix': 'missing-prefix',
	whitespace: 'invalid-character',
	'zero-width': 'invalid-character',
	empty: 'empty'
};

describe('which variants are offered (FR-011 AC-4)', () => {
	const ids = (t: AddressTarget) => invalidVariantsFor(t).map((v) => v.id);
	const common = [
		'invalid-character',
		'wrong-length',
		'look-alike',
		'whitespace',
		'zero-width',
		'empty'
	];

	it('EVM: checksum and 0x prefix variants, no Base58 or Bech32 ones', () => {
		expect(ids({ chain: 'evm' }).sort()).toEqual(
			[...common, 'wrong-checksum', 'missing-prefix'].sort()
		);
	});

	it('Tron: a corrupted Base58Check checksum, no network variant', () => {
		expect(ids({ chain: 'tron' }).sort()).toEqual([...common, 'bad-checksum'].sort());
	});

	it('Solana: no checksum to corrupt, so only the common variants', () => {
		expect(ids({ chain: 'solana' }).sort()).toEqual([...common].sort());
	});

	it('Bitcoin Base58 types: checksum and network variants', () => {
		for (const type of ['p2pkh', 'p2sh'] as const) {
			expect(ids({ chain: 'bitcoin', type, network: 'mainnet' }).sort()).toEqual(
				[...common, 'bad-checksum', 'wrong-network'].sort()
			);
		}
	});

	it('Bitcoin segwit types: also the Bech32/Bech32m mix-up and mixed case (EC-007)', () => {
		for (const type of ['p2wpkh', 'p2tr'] as const) {
			expect(ids({ chain: 'bitcoin', type, network: 'testnet' }).sort()).toEqual(
				[...common, 'bad-checksum', 'wrong-network', 'wrong-encoding', 'mixed-case'].sort()
			);
		}
	});

	it('every variant has a label', () => {
		for (const target of TARGETS) {
			for (const v of invalidVariantsFor(target)) expect(v.label).toMatch(/^[A-Z0-9]/);
		}
	});

	it('refuses to build a variant that does not apply', () => {
		expect(() => buildVariant({ chain: 'solana' }, 'wrong-checksum')).toThrow(RangeError);
		expect(() => buildVariant({ chain: 'evm' }, 'off-curve')).toThrow(RangeError);
	});
});

describe('every variant fails the selected validator (FR-011 AC-2)', () => {
	for (const target of TARGETS) {
		for (const { id } of invalidVariantsFor(target)) {
			it(`${name(target)}: ${id}`, () => {
				for (let i = 0; i < RUNS; i++) {
					const row = buildVariant(target, id);
					const check = validateAddress(target, row.address);
					expect(check.ok, JSON.stringify(row.address)).toBe(false);
					const defect = EXPECTED_DEFECT[id];
					if (defect)
						expect(check, JSON.stringify(row.address)).toEqual({ ok: false, error: defect });
					expect(row).toMatchObject({ validity: 'invalid', variantId: `${target.chain}.${id}` });
					expect(row.reason).toMatch(/\.$/);
				}
			});
		}
	}
});

describe('look-alike from another chain (FR-011 AC-3)', () => {
	for (const target of TARGETS) {
		it(`${name(target)}: valid on its source chain, which the row names`, () => {
			const source = lookAlikeSource(target);
			expect(source.chain).not.toBe(target.chain);
			for (let i = 0; i < RUNS; i++) {
				const row = buildVariant(target, 'look-alike');
				expect(row.sourceChain).toBe(source.chain);
				expect(validateAddress(source, row.address).ok).toBe(true);
				expect(validateAddress(target, row.address).ok).toBe(false);
			}
		});
	}

	it('says why in the reason', () => {
		expect(buildVariant({ chain: 'evm' }, 'look-alike').reason).toBe(
			'Source chain: Tron. Valid there, not an EVM address.'
		);
		expect(
			buildVariant({ chain: 'bitcoin', type: 'p2tr', network: 'mainnet' }, 'look-alike').reason
		).toBe('Source chain: EVM. Valid there, not a Bitcoin P2TR mainnet address.');
	});
});

describe('valid but risky samples (FR-011 AC-5, EC-004, EC-006)', () => {
	it('are offered for EVM and Solana only, in their own group', () => {
		expect(riskySamplesFor({ chain: 'evm' }).map((r) => r.id)).toEqual([
			'all-lowercase',
			'zero-address'
		]);
		expect(riskySamplesFor({ chain: 'solana' }).map((r) => r.id)).toEqual(['off-curve']);
		expect(riskySamplesFor({ chain: 'tron' })).toEqual([]);
		expect(riskySamplesFor({ chain: 'bitcoin', type: 'p2tr', network: 'mainnet' })).toEqual([]);
	});

	for (const [target, id, risk] of [
		[{ chain: 'evm' }, 'all-lowercase', 'no-checksum'],
		[{ chain: 'evm' }, 'zero-address', 'zero-address'],
		[{ chain: 'solana' }, 'off-curve', 'off-curve']
	] as const) {
		it(`${target.chain} ${id}: valid with risk ${risk}, never labelled invalid`, () => {
			for (let i = 0; i < 10; i++) {
				const row = buildVariant(target, id);
				expect(row.validity).toBe('risky');
				expect(row.variantId).toBe(`${target.chain}.${id}`);
				expect(validateAddress(target, row.address)).toEqual({ ok: true, value: { risk } });
			}
		});
	}
});

describe('variant details', () => {
	it('wrong EIP-55 checksum names the character and its correct case', () => {
		const row = buildVariant({ chain: 'evm' }, 'wrong-checksum');
		const [, position, expectedCase] = /^Character (\d+) should be (lowercase|uppercase)/.exec(
			row.reason
		)!;
		const c = row.address[Number(position) + 1];
		const fixed = expectedCase === 'lowercase' ? c.toLowerCase() : c.toUpperCase();
		const repaired = `${row.address.slice(0, Number(position) + 1)}${fixed}${row.address.slice(Number(position) + 2)}`;
		expect(validateAddress({ chain: 'evm' }, repaired)).toEqual({ ok: true, value: {} });
	});

	it('wrong network: a testnet prefix for mainnet and the reverse', () => {
		const forMainnet = buildVariant(
			{ chain: 'bitcoin', type: 'p2wpkh', network: 'mainnet' },
			'wrong-network'
		);
		expect(forMainnet.address.startsWith('tb1q')).toBe(true);
		expect(forMainnet.reason).toBe('A testnet address where mainnet is selected.');
		const forTestnet = buildVariant(
			{ chain: 'bitcoin', type: 'p2pkh', network: 'testnet' },
			'wrong-network'
		);
		expect(forTestnet.address.startsWith('1')).toBe(true);
	});

	it('the Bech32/Bech32m mix-up names the required encoding (EC-007)', () => {
		expect(
			buildVariant({ chain: 'bitcoin', type: 'p2tr', network: 'mainnet' }, 'wrong-encoding').reason
		).toBe('Witness v1 encoded with Bech32 instead of Bech32m (BIP-350).');
		expect(
			buildVariant({ chain: 'bitcoin', type: 'p2wpkh', network: 'mainnet' }, 'wrong-encoding')
				.reason
		).toBe('Witness v0 encoded with Bech32m instead of Bech32 (BIP-350).');
	});

	it('whitespace and zero-width variants keep the valid address inside', () => {
		const target = { chain: 'tron' } as const;
		const spaced = buildVariant(target, 'whitespace').address;
		expect(spaced).toMatch(/^ \S+ $/);
		expect(validateAddress(target, spaced.trim()).ok).toBe(true);
		const hidden = buildVariant(target, 'zero-width').address;
		expect(hidden).toContain('\u200b');
		expect(validateAddress(target, hidden.replace('\u200b', '')).ok).toBe(true);
	});

	it('every invalid variant differs from a valid address only as its reason says', () => {
		const row = buildVariant({ chain: 'evm' }, 'missing-prefix');
		expect(validateAddress({ chain: 'evm' }, `0x${row.address}`).ok).toBe(true);
		expect(buildVariant({ chain: 'evm' }, 'empty').address).toBe('');
	});
});
