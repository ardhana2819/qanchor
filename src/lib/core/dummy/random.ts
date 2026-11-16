import { sha256 } from '@noble/hashes/sha2.js';
import { encodeHex } from '../encoding/hex.ts';

// Seeded randomness for dummy data (FR-082). Never used for key material: addresses draw from the
// Web Crypto CSPRNG only (chains/random.ts, decisions 2026-11-12).

/**
 * Recorded in every export. Bump it whenever a change to this file, a dataset, or a field
 * generator changes the output for an existing seed, so a mismatch can be explained (FR-082).
 */
export const GENERATOR_VERSION = 1;

/** Integer source for one row. Only 32-bit integer arithmetic, so every engine gives the same values. */
export interface Rng {
	/** Uniform integer in [0, 2^32). */
	uint32(): number;
	/** Uniform integer in [0, n), for 1 <= n <= 2^32, without modulo bias. */
	below(n: number): number;
	/** Uniform integer in [min, max], both inclusive. */
	between(min: number, max: number): number;
	/** Uniform element of a non-empty list. */
	pick<T>(items: readonly T[]): T;
}

const TWO_32 = 2 ** 32;
const encoder = new TextEncoder();

/** A fresh seed for a run without one: 64 bits from the CSPRNG as 16 hex digits (FR-082 AC-2). */
export function randomSeed(): string {
	return encodeHex(crypto.getRandomValues(new Uint8Array(8)), false);
}

/** Hashes the seed once per run; `rowRng` then needs one more hash per row. */
export function seedKey(seed: string): Uint8Array {
	return sha256(encoder.encode(`qanchor/dummy\u0000${seed}`));
}

/**
 * The generator for row `index` of a run. Each row has its own stream, derived from the seed and
 * the row index alone, so generating more rows never changes the earlier ones (FR-082 AC-4).
 */
export function rowRng(key: Uint8Array, index: number): Rng {
	if (!Number.isInteger(index) || index < 0 || index >= TWO_32) {
		throw new RangeError(`row index must be an integer from 0 to 2^32 - 1, got ${index}`);
	}
	const input = new Uint8Array(key.length + 4);
	input.set(key);
	new DataView(input.buffer).setUint32(key.length, index);
	const digest = sha256(input);
	const words = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
	return xoshiro128ss([0, 1, 2, 3].map((i) => words.getUint32(i * 4)));
}

/** xoshiro128** 1.1 (Blackman and Vigna). The state must not be all zero; a SHA-256 output never is in practice. */
export function xoshiro128ss(state: readonly number[]): Rng {
	let [s0, s1, s2, s3] = state.map((word) => word >>> 0);

	function uint32(): number {
		const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
		const t = s1 << 9;
		s2 ^= s0;
		s3 ^= s1;
		s1 ^= s2;
		s0 ^= s3;
		s2 ^= t;
		s3 = rotl(s3, 11);
		return result;
	}

	function below(n: number): number {
		if (!Number.isInteger(n) || n < 1 || n > TWO_32) {
			throw new RangeError(`n must be an integer from 1 to 2^32, got ${n}`);
		}
		// Reject the top partial block of the 2^32 range so every residue is equally likely.
		const limit = TWO_32 - (TWO_32 % n);
		for (;;) {
			const value = uint32();
			if (value < limit) return value % n;
		}
	}

	return {
		uint32,
		below,
		between(min, max) {
			if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
				throw new RangeError(`expected integers with min <= max, got ${min} and ${max}`);
			}
			return min + below(max - min + 1);
		},
		pick(items) {
			if (items.length === 0) throw new RangeError('cannot pick from an empty list');
			return items[below(items.length)];
		}
	};
}

function rotl(x: number, k: number): number {
	return (x << k) | (x >>> (32 - k));
}
