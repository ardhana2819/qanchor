import { describe, expect, it } from 'vitest';
import { base58, hex } from '@scure/base';
import { decodeBase58Check, encodeBase58Check } from './base58check.ts';

// Bitcoin Core src/test/data/base58_encode_decode.json, copied verbatim
// (https://github.com/bitcoin/bitcoin/blob/master/src/test/data/base58_encode_decode.json).
// These test the Base58 layer under Base58Check.
const BASE58: [string, string][] = [
	['', ''],
	['61', '2g'],
	['626262', 'a3gV'],
	['636363', 'aPEr'],
	['73696d706c792061206c6f6e6720737472696e67', '2cFupjhnEsSn59qHXstmK2ffpLv2'],
	['00eb15231dfceb60925886b67d065299925915aeb172c06647', '1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L'],
	['516b6fcd0f', 'ABnLTmg'],
	['bf4f89001e670274dd', '3SEo3LWLoPntC'],
	['572e4794', '3EFU7m'],
	['ecac89cad93923c02321', 'EJDM8drfXA6uyA'],
	['10c8511e', 'Rt5zm'],
	['00000000000000000000', '1111111111'],
	[
		'00000000000000000000000000000000000000000000000000000000000000000000000000000000',
		'1111111111111111111111111111111111111111'
	],
	[
		'00000000000000000000000000000000000000000000000000000000000000000000000000000001',
		'1111111111111111111111111111111111111112'
	],
	[
		'000111d38e5fc9071ffcd20b4a763cc9ae4f252bb4e48fd66a835e252ada93ff480d6dd43dc62a641155a5',
		'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
	],
	['271F359E', 'zzzzy'],
	['271F359F', 'zzzzz'],
	['271F35A0', '211111'],
	['271F35A1', '211112']
];

// Base58Check addresses with independently published payloads:
// - 1PMycac… is the worked example in "Technical background of version 1 Bitcoin addresses"
//   (https://en.bitcoin.it/wiki/Technical_background_of_version_1_Bitcoin_addresses): version 0x00
//   + RIPEMD-160 f54a…6e31, checksum c7f18fe8.
// - TR7NHq… is USDT on Tron; TronGrid returns 41a614f8…ded13c for it (checked 2026-11-14).
const BASE58CHECK: [string, string][] = [
	['1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs', '00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31'],
	['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', '41a614f803b6fd780986a42c78ec9c7f77e6ded13c']
];

describe('Base58 (Bitcoin Core vectors)', () => {
	it.each(BASE58)('%s ⇄ %s', (bytes, text) => {
		expect(base58.encode(hex.decode(bytes.toLowerCase()))).toBe(text);
		expect(hex.encode(base58.decode(text))).toBe(bytes.toLowerCase());
	});
});

describe('Base58Check', () => {
	it.each(BASE58CHECK)('decodes %s to payload %s and encodes it back', (text, payload) => {
		const decoded = decodeBase58Check(text);
		expect(decoded.ok && hex.encode(decoded.value)).toBe(payload);
		expect(encodeBase58Check(hex.decode(payload))).toBe(text);
	});

	it('rejects the Bitcoin Core vector 1NS17iag…, which is Base58 but not Base58Check', () => {
		expect(decodeBase58Check('1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L')).toEqual({
			ok: false,
			error: 'bad-checksum'
		});
	});

	it('reports a changed character as a bad checksum', () => {
		// Last character changed: still Base58, the checksum no longer matches.
		expect(decodeBase58Check('1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt')).toEqual({
			ok: false,
			error: 'bad-checksum'
		});
		expect(decodeBase58Check('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u')).toEqual({
			ok: false,
			error: 'bad-checksum'
		});
	});

	it.each(['0', 'O', 'I', 'l', '+', ' '])('reports %j as not Base58', (c) => {
		expect(decodeBase58Check(`1PMycacnJaSqwwJqjawXBErnLsZ7RkXUA${c}`)).toEqual({
			ok: false,
			error: 'not-base58'
		});
	});

	it('reports empty and too-short input', () => {
		expect(decodeBase58Check('')).toEqual({ ok: false, error: 'empty' });
		expect(decodeBase58Check('2g')).toEqual({ ok: false, error: 'too-short' });
		expect(decodeBase58Check('3EFU7m')).toEqual({ ok: false, error: 'too-short' });
	});
});
