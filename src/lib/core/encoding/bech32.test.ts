import { describe, expect, it } from 'vitest';
import { hex } from '@scure/base';
import { decodeBech32, decodeSegwitAddress, encodeSegwitAddress } from './bech32.ts';

// Test vectors copied verbatim from BIP-173 and BIP-350
// (https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki#test-vectors,
// https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki#test-vectors).

const VALID_BECH32 = [
	'A12UEL5L',
	'a12uel5l',
	'an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs',
	'abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw',
	'11qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqc8247j',
	'split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w',
	'?1ezyfcl'
];

const VALID_BECH32M = [
	'A1LQFN3A',
	'a1lqfn3a',
	'an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6',
	'abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx',
	'11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8',
	'split1checkupstagehandshakeupstreamerranterredcaperredlc445v',
	'?1v759aa'
];

const INVALID_BECH32: [string, string][] = [
	['\x201nwldj5', 'HRP character out of range'],
	['\x7f1axkwrx', 'HRP character out of range'],
	['\x801eym55h', 'HRP character out of range'],
	[
		'an84characterslonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1569pvx',
		'overall max length exceeded'
	],
	['pzry9x0s0muk', 'No separator character'],
	['1pzry9x0s0muk', 'Empty HRP'],
	['x1b4n0q5v', 'Invalid data character'],
	['li1dgmt3', 'Too short checksum'],
	['de1lg7wt\xff', 'Invalid character in checksum'],
	['A1G7SGD8', 'checksum calculated with uppercase form of HRP'],
	['10a06t8', 'empty HRP'],
	['1qzzfhee', 'empty HRP']
];

const INVALID_BECH32M: [string, string][] = [
	['\x201xj0phk', 'HRP character out of range'],
	['\x7f1g6xzxy', 'HRP character out of range'],
	['\x801vctc34', 'HRP character out of range'],
	[
		'an84characterslonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11d6pts4',
		'overall max length exceeded'
	],
	['qyrz8wqd2c9m', 'No separator character'],
	['1qyrz8wqd2c9m', 'Empty HRP'],
	['y1b0jsk6g', 'Invalid data character'],
	['lt1igcx5c0', 'Invalid data character'],
	['in1muywd', 'Too short checksum'],
	['mm1crxm3i', 'Invalid character in checksum'],
	['au1s5cgom', 'Invalid character in checksum'],
	['M1VUXWEZ', 'checksum calculated with uppercase form of HRP'],
	['16plkw9', 'empty HRP'],
	['1p2gdwpf', 'empty HRP']
];

// BIP-350 "v0-v16 native segregated witness addresses": address and scriptPubKey.
const VALID_SEGWIT: [string, string][] = [
	['BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4', '0014751e76e8199196d454941c45d1b3a323f1433bd6'],
	[
		'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
		'00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262'
	],
	[
		'bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y',
		'5128751e76e8199196d454941c45d1b3a323f1433bd6751e76e8199196d454941c45d1b3a323f1433bd6'
	],
	['BC1SW50QGDZ25J', '6002751e'],
	['bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs', '5210751e76e8199196d454941c45d1b3a323'],
	[
		'tb1qqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesrxh6hy',
		'0020000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433'
	],
	[
		'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c',
		'5120000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433'
	],
	[
		'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
		'512079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
	]
];

// BIP-350 invalid segwit addresses, with the defect each one must be reported as.
const INVALID_SEGWIT: [string, string, string][] = [
	[
		'tc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq5zuyut',
		'Invalid human-readable part',
		'unknown-prefix'
	],
	[
		'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
		'Bech32 instead of Bech32m',
		'wrong-encoding'
	],
	[
		'tb1z0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqglt7rf',
		'Bech32 instead of Bech32m',
		'wrong-encoding'
	],
	[
		'BC1S0XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ54WELL',
		'Bech32 instead of Bech32m',
		'wrong-encoding'
	],
	['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh', 'Bech32m instead of Bech32', 'wrong-encoding'],
	[
		'tb1q0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq24jc47',
		'Bech32m instead of Bech32',
		'wrong-encoding'
	],
	[
		'bc1p38j9r5y49hruaue7wxjce0updqjuyyx0kh56v8s25huc6995vvpql3jow4',
		'Invalid character in checksum',
		'invalid-character'
	],
	[
		'BC130XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ7ZWS8R',
		'Invalid witness version',
		'invalid-version'
	],
	['bc1pw5dgrnzv', 'Invalid program length (1 byte)', 'invalid-program-length'],
	[
		'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v8n0nx0muaewav253zgeav',
		'Invalid program length (41 bytes)',
		'invalid-program-length'
	],
	[
		'BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P',
		'Invalid program length for witness version 0',
		'invalid-program-length'
	],
	['tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47Zagq', 'Mixed case', 'mixed-case'],
	[
		'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v07qwwzcrf',
		'zero padding of more than 4 bits',
		'invalid-padding'
	],
	[
		'tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vpggkg4j',
		'Non-zero padding in 8-to-5 conversion',
		'invalid-padding'
	],
	['bc1gmk9yu', 'Empty data section', 'empty-data']
];

const PREFIXES = ['bc', 'tb'];

/** scriptPubKey for a witness program: OP_n, push length, program (BIP-141). */
function scriptPubKey(version: number, program: Uint8Array): string {
	const op = version === 0 ? 0 : 0x50 + version;
	return hex.encode(Uint8Array.from([op, program.length, ...program]));
}

describe('decodeBech32 (BIP-173, BIP-350)', () => {
	it.each(VALID_BECH32)('accepts %s as Bech32', (text) => {
		const result = decodeBech32(text);
		expect(result.ok && result.value.encoding).toBe('bech32');
	});

	it.each(VALID_BECH32M)('accepts %s as Bech32m', (text) => {
		const result = decodeBech32(text);
		expect(result.ok && result.value.encoding).toBe('bech32m');
	});

	it.each([...INVALID_BECH32, ...INVALID_BECH32M])('rejects %j (%s)', (text) => {
		expect(decodeBech32(text).ok).toBe(false);
	});

	it('names the defect for each kind of invalid string', () => {
		const code = (text: string) => {
			const result = decodeBech32(text);
			return result.ok ? null : result.error;
		};
		expect(code('pzry9x0s0muk')).toBe('no-separator');
		expect(code('1pzry9x0s0muk')).toBe('invalid-prefix');
		expect(code('\x201nwldj5')).toBe('invalid-prefix');
		expect(code('x1b4n0q5v')).toBe('invalid-character');
		expect(code('li1dgmt3')).toBe('too-short');
		expect(code('A1G7SGD8')).toBe('bad-checksum');
		expect(code('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sL5k7')).toBe(
			'mixed-case'
		);
		expect(code(`${'a'.repeat(84)}1qqqqqq`)).toBe('too-long');
	});
});

describe('decodeSegwitAddress (BIP-350)', () => {
	it.each(VALID_SEGWIT)('decodes %s to scriptPubKey %s', (address, script) => {
		const result = decodeSegwitAddress(address, PREFIXES);
		if (!result.ok) throw new Error(`rejected: ${result.error}`);
		expect(scriptPubKey(result.value.version, result.value.program)).toBe(script);
	});

	it.each(INVALID_SEGWIT)('rejects %s (%s) as %s', (address, _reason, code) => {
		expect(decodeSegwitAddress(address, PREFIXES)).toEqual({ ok: false, error: code });
	});
});

describe('encodeSegwitAddress', () => {
	it.each(VALID_SEGWIT)('re-encodes %s from its scriptPubKey', (address, script) => {
		const bytes = hex.decode(script);
		const version = bytes[0] === 0 ? 0 : bytes[0] - 0x50;
		const prefix = address.slice(0, 2).toLowerCase();
		expect(encodeSegwitAddress(prefix, version, bytes.slice(2))).toBe(address.toLowerCase());
	});

	it('rejects a witness version or program length no address can have', () => {
		expect(() => encodeSegwitAddress('bc', 17, new Uint8Array(32))).toThrow(RangeError);
		expect(() => encodeSegwitAddress('bc', 0, new Uint8Array(21))).toThrow(RangeError);
		expect(() => encodeSegwitAddress('bc', 1, new Uint8Array(41))).toThrow(RangeError);
	});
});
