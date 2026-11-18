import { describe, expect, it } from 'vitest';
import {
	parseEsploraBalance,
	parseEvmBalance,
	parseSolanaBalance,
	parseTronBalance
} from './parse.ts';

// Answers recorded from the default testnet endpoints on 2026-11-18 (trimmed).

describe('parseEvmBalance', () => {
	it('reads a hex quantity in wei', () => {
		expect(parseEvmBalance('0x717fb9c26b22cb9')).toEqual({ ok: true, value: 0x717fb9c26b22cb9n });
		expect(parseEvmBalance('0x0')).toEqual({ ok: true, value: 0n });
	});

	it('reads balances beyond 2^53 exactly', () => {
		const max = `0x${'f'.repeat(64)}`;
		expect(parseEvmBalance(max)).toEqual({ ok: true, value: 2n ** 256n - 1n });
	});

	it.each([[null], [12], ['12'], ['0x'], ['0xzz']])('rejects %j', (value) => {
		expect(parseEvmBalance(value)).toEqual({ ok: false, error: 'result is not a hex quantity' });
	});
});

describe('parseSolanaBalance', () => {
	it('reads lamports from value', () => {
		const answer = {
			context: { apiVersion: '4.5.0-beta.0', slot: 523598071 },
			value: 1510318951450
		};
		expect(parseSolanaBalance(answer)).toEqual({ ok: true, value: 1510318951450n });
		expect(parseSolanaBalance({ context: {}, value: 0 })).toEqual({ ok: true, value: 0n });
	});

	it.each([
		[null, 'result is not an object'],
		[{ context: {} }, 'result.value is not a non-negative integer'],
		[{ value: '5' }, 'result.value is not a non-negative integer'],
		[{ value: -1 }, 'result.value is not a non-negative integer'],
		[{ value: 1.5 }, 'result.value is not a non-negative integer']
	])('rejects %j', (value, error) => {
		expect(parseSolanaBalance(value)).toEqual({ ok: false, error });
	});
});

describe('parseTronBalance', () => {
	it('reads sun from balance', () => {
		const answer = { address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', balance: 169824650062 };
		expect(parseTronBalance(answer)).toEqual({ ok: true, value: 169824650062n });
	});

	it('reads an account that was never activated, or is empty, as 0', () => {
		expect(parseTronBalance({})).toEqual({ ok: true, value: 0n });
		expect(parseTronBalance({ address: 'T…', create_time: 1 })).toEqual({ ok: true, value: 0n });
	});

	it.each([
		[[], 'response is not an object'],
		[{ balance: '5' }, 'balance is not a non-negative integer'],
		[{ balance: null }, 'balance is not a non-negative integer']
	])('rejects %j', (value, error) => {
		expect(parseTronBalance(value)).toEqual({ ok: false, error });
	});
});

describe('parseEsploraBalance', () => {
	const stats = (funded: number, spent: number) => ({
		funded_txo_count: 1,
		funded_txo_sum: funded,
		spent_txo_count: 1,
		spent_txo_sum: spent,
		tx_count: 2
	});

	it('is funded minus spent, confirmed plus mempool', () => {
		const answer = {
			address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
			chain_stats: stats(10538941796, 10538306796),
			mempool_stats: stats(0, 0)
		};
		expect(parseEsploraBalance(answer)).toEqual({ ok: true, value: 635000n });
		const pending = { chain_stats: stats(1000, 0), mempool_stats: stats(500, 1000) };
		expect(parseEsploraBalance(pending)).toEqual({ ok: true, value: 500n });
	});

	it.each([
		['not an object', 'x', 'response is not an object'],
		['no chain stats', { mempool_stats: stats(0, 0) }, 'chain_stats is not an object'],
		['no mempool stats', { chain_stats: stats(0, 0) }, 'mempool_stats is not an object'],
		[
			'a missing sum',
			{ chain_stats: { funded_txo_sum: 1 }, mempool_stats: stats(0, 0) },
			'chain_stats.spent_txo_sum is not a non-negative integer'
		]
	])('rejects %s', (_name, value, error) => {
		expect(parseEsploraBalance(value)).toEqual({ ok: false, error });
	});
});
