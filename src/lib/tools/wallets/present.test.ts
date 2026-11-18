import { describe, expect, it } from 'vitest';
import type { ChainId } from '#lib/core/chains/types.ts';
import {
	addressProblemText,
	CHAIN_OPTIONS,
	networkName,
	networkOptions,
	shortAddress
} from './present.ts';

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

describe('shortAddress', () => {
	it('keeps the first six and last four characters of a long address', () => {
		expect(shortAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe('0x5aAe…eAed');
		expect(shortAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBe('tb1qw5…jzsx');
		expect(shortAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe('TR7NHq…Lj6t');
	});

	it('leaves an address of 13 characters or fewer as it is', () => {
		expect(shortAddress('1234567890123')).toBe('1234567890123');
		expect(shortAddress('12345678901234')).toBe('123456…1234');
	});
});
