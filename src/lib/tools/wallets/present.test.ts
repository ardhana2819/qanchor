import { describe, expect, it } from 'vitest';
import type { ChainId } from '#lib/core/chains/types.ts';
import { addressProblemText, CHAIN_OPTIONS, networkName, networkOptions } from './present.ts';

describe('wallet form options', () => {
	it('offers the four chains', () => {
		expect(CHAIN_OPTIONS.map((o) => o.label)).toEqual(['EVM', 'Bitcoin', 'Solana', 'Tron']);
	});

	it('offers only the testnets of the chosen chain', () => {
		expect(networkOptions('evm').map((o) => o.value)).toEqual([
			'eth-sepolia',
			'bsc-testnet',
			'polygon-amoy',
			'arbitrum-sepolia',
			'base-sepolia'
		]);
		expect(networkOptions('bitcoin').map((o) => o.value)).toEqual(['bitcoin-testnet4']);
		expect(networkOptions('solana').map((o) => o.value)).toEqual(['solana-devnet']);
		expect(networkOptions('tron').map((o) => o.value)).toEqual(['tron-nile']);
	});

	it('names a network, or shows the stored id of one this version does not know', () => {
		expect(networkName('eth-sepolia')).toBe('Ethereum Sepolia');
		expect(networkName('dogecoin-testnet')).toBe('dogecoin-testnet');
	});
});

describe('addressProblemText', () => {
	it.each([
		[{ kind: 'empty' } as const, 'evm', 'Paste the wallet address.'],
		[
			{ kind: 'mainnet' } as const,
			'bitcoin',
			'This is a mainnet address. Only testnet Bitcoin addresses can be saved.'
		],
		[
			{ kind: 'other-chain', chain: 'evm' } as const,
			'solana',
			'This is a valid EVM address, not Solana. Pick the matching chain.'
		],
		[
			{ kind: 'invalid', defect: 'bad-checksum' } as const,
			'tron',
			'Not a valid Tron address. Checksum does not match.'
		],
		[{ kind: 'invalid', defect: null } as const, 'bitcoin', 'Not a valid Bitcoin address.']
	])('%j on %s', (problem, chain, text) => {
		expect(addressProblemText(problem, chain as ChainId)).toBe(text);
	});
});
