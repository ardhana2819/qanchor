import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	GENERATOR_VERSION,
	randomSeed,
	rowRng,
	seedKey,
	xoshiro128ss,
	type Rng
} from './random.ts';

const draws = (rng: Rng, count: number) => Array.from({ length: count }, () => rng.uint32());
const rowDraws = (seed: string, index: number, count = 8) =>
	draws(rowRng(seedKey(seed), index), count);

describe('xoshiro128ss', () => {
	// Expected values from the reference C implementation (prng.di.unimi.it), compiled and run on 2026-11-16.
	it('matches the reference implementation', () => {
		expect(draws(xoshiro128ss([1, 2, 3, 4]), 8)).toEqual([
			11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849
		]);
		expect(draws(xoshiro128ss([0xdeadbeef, 0x01234567, 0x89abcdef, 0xffffffff]), 8)).toEqual([
			2576977298, 1162350735, 2291329051, 732944927, 482780208, 3416574328, 2872943131, 1297184098
		]);
	});
});

describe('row generators (FR-082)', () => {
	it('derive each row state from SHA-256 of the seed key and the big-endian row index', () => {
		const key = createHash('sha256').update('qanchor/dummy\u0000Seed ✓').digest();
		const digest = createHash('sha256')
			.update(Buffer.concat([key, Buffer.from([0, 0, 1, 2])]))
			.digest();
		const state = [0, 4, 8, 12].map((offset) => digest.readUInt32BE(offset));
		expect(rowDraws('Seed ✓', 258)).toEqual(draws(xoshiro128ss(state), 8));
	});

	it('AC-1: the same seed and row give the same values', () => {
		expect(rowDraws('qa-run-1', 0)).toEqual(rowDraws('qa-run-1', 0));
	});

	it('AC-1: output for a fixed seed never changes without a GENERATOR_VERSION bump', () => {
		expect(GENERATOR_VERSION).toBe(1);
		expect(rowDraws('qanchor', 0, 4)).toMatchInlineSnapshot(`
			[
			  3932235632,
			  3358815817,
			  135237007,
			  3569073541,
			]
		`);
	});

	it('AC-3: different seeds, or seeds differing only in case or whitespace, give different values', () => {
		const seeds = ['a', 'b', 'A', 'a ', ' a', ''];
		const firsts = seeds.map((seed) => rowDraws(seed, 0).join());
		expect(new Set(firsts).size).toBe(seeds.length);
	});

	it('AC-4: each row has its own stream, so adding rows keeps the earlier ones', () => {
		const key = seedKey('grow');
		const run = (rows: number) => Array.from({ length: rows }, (_, i) => draws(rowRng(key, i), 3));
		const ten = run(10);
		expect(run(20).slice(0, 10)).toEqual(ten);
		expect(new Set(ten.map((row) => row.join())).size).toBe(10);
	});

	it('rejects a row index outside 0 to 2^32 - 1', () => {
		const key = seedKey('x');
		expect(() => rowRng(key, 2 ** 32 - 1)).not.toThrow();
		for (const index of [-1, 1.5, 2 ** 32, Number.NaN]) {
			expect(() => rowRng(key, index)).toThrow(RangeError);
		}
	});
});

describe('Rng helpers', () => {
	it('below(n) stays in [0, n) and covers every value', () => {
		const rng = rowRng(seedKey('below'), 0);
		const seen = new Set<number>();
		for (let i = 0; i < 2000; i++) {
			const value = rng.below(7);
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(7);
			seen.add(value);
		}
		expect(seen.size).toBe(7);
	});

	it('below(n) redraws values in the biased top block instead of folding them', () => {
		// For n = 2^31 + 1 every draw from n upwards is rejected. This state's reference outputs start
		// 2576977298 (rejected), 1162350735, 2291329051 (rejected), 732944927.
		const rng = xoshiro128ss([0xdeadbeef, 0x01234567, 0x89abcdef, 0xffffffff]);
		expect(rng.below(2 ** 31 + 1)).toBe(1162350735);
		expect(rng.below(2 ** 31 + 1)).toBe(732944927);
	});

	it('below accepts 1 and 2^32, and rejects anything else', () => {
		const rng = rowRng(seedKey('limits'), 0);
		expect(rng.below(1)).toBe(0);
		expect(rng.below(2 ** 32)).toBeLessThan(2 ** 32);
		for (const n of [0, -1, 1.5, 2 ** 32 + 1, Number.NaN]) {
			expect(() => rng.below(n)).toThrow(RangeError);
		}
	});

	it('between includes both ends and rejects min > max', () => {
		const rng = rowRng(seedKey('between'), 0);
		const seen = new Set<number>();
		for (let i = 0; i < 500; i++) seen.add(rng.between(-2, 2));
		expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
		expect(rng.between(5, 5)).toBe(5);
		expect(() => rng.between(3, 2)).toThrow(RangeError);
		expect(() => rng.between(0, 1.5)).toThrow(RangeError);
	});

	it('pick returns a list element and rejects an empty list', () => {
		const rng = rowRng(seedKey('pick'), 0);
		const items = ['a', 'b', 'c'] as const;
		expect(items).toContain(rng.pick(items));
		expect(() => rng.pick([])).toThrow(RangeError);
	});
});

describe('randomSeed (FR-082 AC-2)', () => {
	it('is 16 lowercase hex digits and differs between calls', () => {
		const seeds = Array.from({ length: 20 }, randomSeed);
		for (const seed of seeds) expect(seed).toMatch(/^[0-9a-f]{16}$/);
		expect(new Set(seeds).size).toBe(20);
	});
});
