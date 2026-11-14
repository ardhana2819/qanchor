import { describe, expect, it } from 'vitest';
import { TARGETS, invalidVariantsFor, type AddressTarget } from './catalog.ts';
import { generateAddress } from './dispatch.ts';
import { buildVariant } from './variants.ts';
import { checkAddress, verdictFor } from './verdict.ts';

// The address validator (T-022): FR-014 AC-1 to AC-5, EC-007.

const name = (t: AddressTarget) =>
	t.chain === 'bitcoin' ? `bitcoin ${t.type} ${t.network}` : t.chain;

describe('valid addresses (FR-014 AC-1)', () => {
	it.each(TARGETS.map((t) => [name(t), t] as const))(
		'%s: a generated address matches exactly its own format',
		(_name, target) => {
			for (let i = 0; i < 10; i++) {
				expect(verdictFor(generateAddress(target))).toEqual({
					kind: 'valid',
					matches: [{ target }]
				});
			}
		}
	);

	it('published addresses', () => {
		expect(verdictFor('2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2')).toEqual({
			kind: 'valid',
			matches: [{ target: { chain: 'bitcoin', type: 'p2sh', network: 'testnet' } }]
		});
		expect(verdictFor('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toEqual({
			kind: 'valid',
			matches: [{ target: { chain: 'tron' } }]
		});
	});

	it('valid but risky addresses carry their risk (EC-004, EC-006)', () => {
		expect(verdictFor('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toEqual({
			kind: 'valid',
			matches: [{ target: { chain: 'evm' }, risk: 'no-checksum' }]
		});
		expect(verdictFor(`0x${'0'.repeat(40)}`)).toEqual({
			kind: 'valid',
			matches: [{ target: { chain: 'evm' }, risk: 'zero-address' }]
		});
	});
});

describe('invalid addresses name the defect and the closest format (FR-014 AC-3)', () => {
	it.each([
		['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD', 'bad-checksum', { chain: 'evm' }],
		['5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', 'missing-prefix', { chain: 'evm' }],
		['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe', 'wrong-length', { chain: 'evm' }],
		['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u', 'bad-checksum', { chain: 'tron' }],
		[
			'1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt',
			'bad-checksum',
			{ chain: 'bitcoin', type: 'p2pkh', network: 'mainnet' }
		],
		[
			'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyv',
			'bad-checksum',
			{ chain: 'bitcoin', type: 'p2wpkh', network: 'mainnet' }
		],
		// BIP-350: a v1 program encoded with Bech32 (EC-007).
		[
			'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
			'wrong-encoding',
			{ chain: 'bitcoin', type: 'p2tr', network: 'mainnet' }
		],
		// BIP-350: a v0 program encoded with Bech32m.
		[
			'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh',
			'wrong-encoding',
			{ chain: 'bitcoin', type: 'p2wpkh', network: 'mainnet' }
		],
		[
			'tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47Zagq',
			'mixed-case',
			{ chain: 'bitcoin', type: 'p2tr', network: 'testnet' }
		]
	] as const)('%s: %s, closest %j', (text, defect, closest) => {
		expect(verdictFor(text)).toEqual({ kind: 'invalid', defect, closest });
	});

	it('text shaped like no address names no closest format', () => {
		expect(verdictFor('hello')).toEqual({
			kind: 'invalid',
			defect: 'invalid-character',
			closest: null
		});
	});

	it('every invalid variant of every target is invalid for that target', () => {
		for (const target of TARGETS) {
			for (const { id } of invalidVariantsFor(target)) {
				if (id === 'look-alike') continue;
				const { address } = buildVariant(target, id);
				const verdict = verdictFor(address);
				const matchesTarget =
					verdict.kind === 'valid' &&
					verdict.matches.some((m) => JSON.stringify(m.target) === JSON.stringify(target));
				expect(matchesTarget, `${name(target)} ${id}: ${JSON.stringify(address)}`).toBe(false);
			}
		}
	});

	it('a look-alike is reported valid for its source chain', () => {
		const { address, sourceChain } = buildVariant({ chain: 'evm' }, 'look-alike');
		const verdict = verdictFor(address);
		expect(verdict.kind === 'valid' && verdict.matches[0].target.chain).toBe(sourceChain);
	});
});

describe('checkAddress: whitespace and invisible characters (FR-014 AC-4, AC-5)', () => {
	const tron = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

	it('empty input has no verdict', () => {
		expect(checkAddress('')).toBeNull();
	});

	it('a clean address has no issues and no cleaned verdict', () => {
		expect(checkAddress(tron)).toEqual({
			verdict: { kind: 'valid', matches: [{ target: { chain: 'tron' } }] },
			issues: []
		});
	});

	it('reports surrounding whitespace instead of trimming it, then the trimmed verdict', () => {
		const check = checkAddress(`  ${tron}\n`)!;
		expect(check.issues).toEqual([{ kind: 'whitespace' }]);
		expect(check.verdict.kind).toBe('invalid');
		expect(check.cleaned).toEqual({
			text: tron,
			verdict: { kind: 'valid', matches: [{ target: { chain: 'tron' } }] }
		});
	});

	it('reports each invisible character with its code point and position', () => {
		const text = `${tron.slice(0, 5)}\u200b${tron.slice(5, 10)}\ufeff${tron.slice(10)}`;
		const check = checkAddress(text)!;
		expect(check.issues).toEqual([
			{ kind: 'invisible', codePoint: 0x200b, position: 6 },
			{ kind: 'invisible', codePoint: 0xfeff, position: 12 }
		]);
		expect(check.cleaned?.verdict.kind).toBe('valid');
	});

	it.each([0x200c, 0x200d, 0x2060, 0x00ad])('treats U+%s as invisible', (codePoint) => {
		const check = checkAddress(`${tron}${String.fromCodePoint(codePoint)}`)!;
		expect(check.issues).toEqual([{ kind: 'invisible', codePoint, position: tron.length + 1 }]);
	});

	it('a cleaned value can still be invalid, with its own defect', () => {
		const check = checkAddress(' 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD ')!;
		expect(check.cleaned?.verdict).toEqual({
			kind: 'invalid',
			defect: 'bad-checksum',
			closest: { chain: 'evm' }
		});
	});
});
