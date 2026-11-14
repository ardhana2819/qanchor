import { afterEach, describe, expect, it, vi } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58, hex } from '@scure/base';
import { decodeBase58Check, encodeBase58Check } from '../encoding/base58check.ts';
import { evmRiskySamples, generateEvmAddress, validateEvmAddress } from './evm.ts';
import {
	generateSolanaAddress,
	isOnCurve,
	solanaRiskySamples,
	validateSolanaAddress
} from './solana.ts';
import { generateTronAddress, tronAddressFromBytes, validateTronAddress } from './tron.ts';

// Chain modules for EVM, Tron, and Solana (T-018): FR-010 AC-2, AC-4, AC-6; FR-011 AC-5;
// EC-004, EC-006; NFR-012, NFR-013.

const realRandom = crypto.getRandomValues.bind(crypto);

/**
 * Makes each 32-byte draw from crypto.getRandomValues return `values` in turn and records the
 * buffers it filled. Other draws (noble's 16-byte blinding while computing a public key) pass
 * through to the real CSPRNG.
 */
function scriptRandom(...values: Uint8Array[]): Uint8Array[] {
	const filled: Uint8Array[] = [];
	vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
		if (!(array instanceof Uint8Array) || array.length !== 32) return realRandom(array);
		const next = values.shift();
		if (!next) throw new Error('unexpected key draw');
		array.set(next);
		filled.push(array);
		return array;
	});
	return filled;
}

const KEY_ONE = hex.decode(`${'00'.repeat(31)}01`);

afterEach(() => {
	vi.restoreAllMocks();
});

describe('key material (NFR-012, NFR-013, FR-010 AC-6)', () => {
	it('EVM: the private key 1 gives its well-known address, from crypto.getRandomValues', () => {
		const filled = scriptRandom(KEY_ONE);

		expect(generateEvmAddress()).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
		expect(filled).toHaveLength(1);
	});

	it('Tron: the same key gives 0x41 + the EVM address bytes', () => {
		scriptRandom(KEY_ONE);
		const decoded = decodeBase58Check(generateTronAddress());

		expect(decoded.ok && hex.encode(decoded.value)).toBe(
			'417e5f4552091a69125d5dfcb7b8c2659029395bdf'
		);
	});

	it('Solana: the RFC 8032 test 1 secret key gives its public key as the address', () => {
		// RFC 8032 section 7.1, TEST 1.
		scriptRandom(hex.decode('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'));

		expect(hex.encode(base58.decode(generateSolanaAddress()))).toBe(
			'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'
		);
	});

	it.each([
		['EVM', generateEvmAddress],
		['Tron', generateTronAddress],
		['Solana', generateSolanaAddress]
	])('%s: the key buffer is zero-filled once the address is derived', (_chain, generate) => {
		const filled = scriptRandom(Uint8Array.from({ length: 32 }, (_, i) => i + 1));

		generate();

		expect(filled).toHaveLength(1);
		expect([...filled[0]]).toEqual(new Array(32).fill(0));
	});

	it('an out-of-range secp256k1 key is redrawn and zero-filled too', () => {
		// 0 is not a valid secp256k1 secret key.
		const filled = scriptRandom(new Uint8Array(32), KEY_ONE);

		expect(generateEvmAddress()).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
		expect(filled).toHaveLength(2);
		expect(filled.every((key) => key.every((byte) => byte === 0))).toBe(true);
	});

	it('never uses Math.random for keys', () => {
		const spy = vi.spyOn(Math, 'random');

		generateEvmAddress();
		generateTronAddress();
		generateSolanaAddress();

		expect(spy).not.toHaveBeenCalled();
	});

	it.each([
		['EVM', generateEvmAddress],
		['Tron', generateTronAddress],
		['Solana', generateSolanaAddress]
	])('%s: every generation gives a new address (FR-010 AC-4)', (_chain, generate) => {
		const addresses = new Set(Array.from({ length: 50 }, generate));
		expect(addresses.size).toBe(50);
	});
});

describe('generated addresses pass their own validator (FR-010 AC-2)', () => {
	it.each([
		['EVM', generateEvmAddress, validateEvmAddress],
		['Tron', generateTronAddress, validateTronAddress],
		['Solana', generateSolanaAddress, validateSolanaAddress]
	])('%s: 200 of 200', (_chain, generate, validate) => {
		for (let i = 0; i < 200; i++) {
			const address = generate();
			expect(validate(address), address).toEqual({ ok: true, value: {} });
		}
	});

	it('EVM addresses are 0x + 40 hex digits with the EIP-55 checksum', () => {
		expect(generateEvmAddress()).toMatch(/^0x[0-9a-fA-F]{40}$/);
	});

	it('Tron addresses start with T and are 34 characters', () => {
		expect(generateTronAddress()).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
	});

	it('Solana addresses decode to exactly 32 bytes on the curve', () => {
		const bytes = base58.decode(generateSolanaAddress());
		expect(bytes).toHaveLength(32);
		expect(isOnCurve(bytes)).toBe(true);
	});
});

describe('validateEvmAddress', () => {
	const address = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

	it.each([
		['', 'empty'],
		['5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', 'missing-prefix'],
		['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe', 'wrong-length'],
		['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed00', 'wrong-length'],
		['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeg', 'invalid-character'],
		['0X5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', 'invalid-character'],
		[` ${address}`, 'invalid-character'],
		['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD', 'bad-checksum']
	] as const)('%j fails as %s', (text, defect) => {
		expect(validateEvmAddress(text)).toEqual({ ok: false, error: defect });
	});

	it('all-lowercase and all-uppercase are valid but risky (EC-004)', () => {
		expect(validateEvmAddress(address.toLowerCase())).toEqual({
			ok: true,
			value: { risk: 'no-checksum' }
		});
		expect(validateEvmAddress(`0x${address.slice(2).toUpperCase()}`)).toEqual({
			ok: true,
			value: { risk: 'no-checksum' }
		});
	});

	it('the zero address is valid but risky', () => {
		expect(validateEvmAddress(`0x${'0'.repeat(40)}`)).toEqual({
			ok: true,
			value: { risk: 'zero-address' }
		});
	});

	it('the risky samples are the zero address and an all-lowercase address (FR-011 AC-5)', () => {
		const samples = evmRiskySamples();
		expect(samples.map((s) => s.risk)).toEqual(['zero-address', 'no-checksum']);
		for (const sample of samples) {
			expect(validateEvmAddress(sample.address)).toEqual({
				ok: true,
				value: { risk: sample.risk }
			});
		}
		expect(samples[1].address).toBe(samples[1].address.toLowerCase());
	});
});

describe('validateTronAddress', () => {
	const usdt = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

	it('accepts USDT on Tron', () => {
		expect(validateTronAddress(usdt)).toEqual({ ok: true, value: {} });
	});

	it('rejects an EVM-style payload with the wrong prefix byte', () => {
		// 0x00 + 20 bytes is a Bitcoin P2PKH payload, not a Tron one.
		expect(validateTronAddress('1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs')).toEqual({
			ok: false,
			error: 'wrong-prefix'
		});
	});

	it.each([
		['', 'empty'],
		['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u', 'bad-checksum'],
		['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj60', 'invalid-character'],
		['2g', 'wrong-length']
	] as const)('%j fails as %s', (text, defect) => {
		expect(validateTronAddress(text)).toEqual({ ok: false, error: defect });
	});

	it('rejects a valid Base58Check payload of the wrong length', () => {
		// 0x41 + 21 bytes: the checksum is right, the payload one byte too long.
		const long = encodeBase58Check(Uint8Array.from([0x41, ...new Uint8Array(21).fill(9)]));
		expect(validateTronAddress(long)).toEqual({ ok: false, error: 'wrong-length' });
	});

	it('only builds from 20 bytes', () => {
		expect(() => tronAddressFromBytes(new Uint8Array(21))).toThrow(RangeError);
	});
});

describe('validateSolanaAddress', () => {
	it.each([
		['', 'empty'],
		['0OIl', 'invalid-character'],
		[base58.encode(new Uint8Array(31).fill(7)), 'wrong-length'],
		[base58.encode(new Uint8Array(33).fill(7)), 'wrong-length']
	] as const)('%j fails as %s', (text, defect) => {
		expect(validateSolanaAddress(text)).toEqual({ ok: false, error: defect });
	});

	it('an off-curve address is valid but risky (EC-006)', () => {
		const [sample] = solanaRiskySamples();
		expect(sample.risk).toBe('off-curve');
		expect(validateSolanaAddress(sample.address)).toEqual({
			ok: true,
			value: { risk: 'off-curve' }
		});
		expect(() => ed25519.Point.fromBytes(base58.decode(sample.address))).toThrow();
	});

	it('the system program address (32 zero bytes) is on the curve', () => {
		expect(validateSolanaAddress('11111111111111111111111111111111')).toEqual({
			ok: true,
			value: {}
		});
	});
});
