import { describe, expect, it } from 'vitest';
import { networkById, type Network } from '#lib/config/networks.ts';
import { resolveEndpoint } from '#lib/net/endpoint.ts';
import { amount, errorCopy, utc } from './present.ts';

const net = (id: string) => networkById(id) as Network;

describe('amount (FR-040 AC-2)', () => {
	it('shows the display unit and the smallest unit, exactly', () => {
		expect(amount(5_100_000_000_000_000n, net('eth'))).toEqual({
			display: '0.0051 ETH',
			base: '5100000000000000 wei'
		});
		expect(amount(2_068_605n, net('solana'))).toEqual({
			display: '0.002068605 SOL',
			base: '2068605 lamports'
		});
		expect(amount(7_000_000n, net('tron-nile')).display).toBe('7 TRX');
		expect(amount(0n, net('bitcoin'))).toEqual({ display: '0 BTC', base: '0 sats' });
		expect(amount(1n, net('polygon')).display).toBe('0.000000000000000001 POL');
	});
});

describe('utc', () => {
	it('formats milliseconds as a UTC date and time', () => {
		expect(utc(1794915336000)).toBe('2026-11-17 11:35:36 UTC');
	});
});

describe('errorCopy (design section 7, FR-042)', () => {
	const solana = net('solana');
	const host = 'rpc.example.dev';

	it('not found names the network and hints at the selection (EC-005)', () => {
		const eth = net('eth');
		expect(errorCopy({ code: 'not-found', host }, eth, resolveEndpoint(eth, []))).toEqual({
			text: 'Transaction not found on Ethereum. Check that the selected network is the one the transaction was sent on.',
			hint: undefined
		});
	});

	it('adds the short-history hint for Solana mainnet on the default endpoint only', () => {
		const onDefault = errorCopy({ code: 'not-found', host }, solana, resolveEndpoint(solana, []));
		expect(onDefault.hint).toMatch(/keeps only the last few days/);
		const custom = resolveEndpoint(solana, [
			{ networkId: 'solana', url: 'https://sol.example.dev' }
		]);
		expect(errorCopy({ code: 'not-found', host }, solana, custom).hint).toBeUndefined();
		const devnet = net('solana-devnet');
		expect(
			errorCopy({ code: 'not-found', host }, devnet, resolveEndpoint(devnet, [])).hint
		).toBeUndefined();
	});

	it('words every other code with the host', () => {
		const eth = net('eth');
		const endpoint = resolveEndpoint(eth, []);
		const text = (error: Parameters<typeof errorCopy>[0]) => errorCopy(error, eth, endpoint).text;
		expect(text({ code: 'rate-limited', host })).toBe(
			'rpc.example.dev is rate-limiting requests. Try again later or set your own endpoint in Settings.'
		);
		expect(text({ code: 'network', host })).toBe(
			'Could not reach rpc.example.dev. The request did not complete, so this says nothing about whether the transaction exists.'
		);
		expect(text({ code: 'timeout', host })).toBe(
			'No response from rpc.example.dev within 10 seconds.'
		);
		expect(text({ code: 'bad-response', host, detail: 'x' })).toBe(
			'rpc.example.dev returned a response QAnchor could not read.'
		);
		expect(text({ code: 'chain-mismatch', host, expected: 1n, actual: 137n })).toBe(
			'This endpoint serves chain ID 137, but Ethereum is chain ID 1.'
		);
	});
});
