import { describe, expect, it } from 'vitest';
import { checkWalletAddress, findDuplicate, type WalletKey } from './wallets.ts';

// Vectors: EIP-55 and BIP-173 examples, and addresses already used by the validator tests.
const EVM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const BTC_TESTNET_P2WPKH = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const BTC_TESTNET_P2SH = '2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2';
const BTC_MAINNET_P2PKH = '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs';
const BTC_MAINNET_P2WPKH = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const SOLANA = 'So11111111111111111111111111111111111111112';
const TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

describe('checkWalletAddress (FR-070 AC-3, AC-4)', () => {
	it.each([
		['evm', EVM],
		['evm', EVM.toLowerCase()],
		['bitcoin', BTC_TESTNET_P2WPKH],
		['bitcoin', BTC_TESTNET_P2WPKH.toUpperCase()],
		['bitcoin', BTC_TESTNET_P2SH],
		['solana', SOLANA],
		['tron', TRON]
	] as const)('%s accepts %s', (chain, address) => {
		expect(checkWalletAddress(chain, address)).toEqual({ ok: true, value: address });
	});

	it('returns the address without surrounding whitespace', () => {
		expect(checkWalletAddress('evm', `  ${EVM}\n`)).toEqual({ ok: true, value: EVM });
	});

	it.each(['', '   ', '\n'])('an empty address (%j) is its own problem', (text) => {
		expect(checkWalletAddress('evm', text)).toEqual({ ok: false, error: { kind: 'empty' } });
	});

	it.each([BTC_MAINNET_P2PKH, BTC_MAINNET_P2WPKH])(
		'a Bitcoin mainnet address is blocked as mainnet: %s',
		(address) => {
			expect(checkWalletAddress('bitcoin', address)).toEqual({
				ok: false,
				error: { kind: 'mainnet' }
			});
		}
	);

	it('EVM, Solana, and Tron cannot be held to testnet (EC-025)', () => {
		// The same strings are mainnet addresses too; they are accepted.
		expect(checkWalletAddress('evm', EVM).ok).toBe(true);
		expect(checkWalletAddress('tron', TRON).ok).toBe(true);
	});

	it.each([
		['solana', EVM, 'evm'],
		['evm', TRON, 'tron'],
		['tron', BTC_TESTNET_P2WPKH, 'bitcoin'],
		['evm', SOLANA, 'solana']
	] as const)(
		'on %s, a valid address of another chain names that chain',
		(chain, address, other) => {
			expect(checkWalletAddress(chain, address)).toEqual({
				ok: false,
				error: { kind: 'other-chain', chain: other }
			});
		}
	);

	it.each([
		['evm', `${EVM.slice(0, -1)}D`, 'bad-checksum'],
		['evm', EVM.slice(0, -2), 'wrong-length'],
		['tron', `${TRON.slice(0, -1)}u`, 'bad-checksum'],
		['bitcoin', `${BTC_TESTNET_P2WPKH.slice(0, -1)}y`, 'bad-checksum']
	] as const)('on %s, %s is invalid with its defect (%s)', (chain, address, defect) => {
		expect(checkWalletAddress(chain, address)).toEqual({
			ok: false,
			error: { kind: 'invalid', defect }
		});
	});

	it('names no defect when the input is closest to another chain', () => {
		expect(checkWalletAddress('solana', `${EVM.slice(0, -1)}D`)).toEqual({
			ok: false,
			error: { kind: 'invalid', defect: null }
		});
		expect(checkWalletAddress('evm', 'hello')).toEqual({
			ok: false,
			error: { kind: 'invalid', defect: null }
		});
	});

	it('does not trim invisible characters inside the address', () => {
		expect(checkWalletAddress('evm', `${EVM.slice(0, 10)}\u200b${EVM.slice(10)}`).ok).toBe(false);
	});
});

describe('findDuplicate (FR-070 AC-6)', () => {
	const stored: (WalletKey & { id: string; label: string })[] = [
		{ id: 'a', label: 'QA main', chain: 'evm', networkId: 'eth-sepolia', address: EVM },
		{
			id: 'b',
			label: 'BTC',
			chain: 'bitcoin',
			networkId: 'bitcoin-testnet4',
			address: BTC_TESTNET_P2WPKH
		},
		{ id: 'c', label: 'Tron', chain: 'tron', networkId: 'tron-nile', address: TRON }
	];

	it('finds the entry with the same chain, network, and address', () => {
		expect(
			findDuplicate(stored, { chain: 'evm', networkId: 'eth-sepolia', address: EVM })?.id
		).toBe('a');
	});

	it('compares EVM and Bech32 addresses without case; Base58 with case', () => {
		expect(
			findDuplicate(stored, { chain: 'evm', networkId: 'eth-sepolia', address: EVM.toLowerCase() })
				?.id
		).toBe('a');
		expect(
			findDuplicate(stored, {
				chain: 'bitcoin',
				networkId: 'bitcoin-testnet4',
				address: BTC_TESTNET_P2WPKH.toUpperCase()
			})?.id
		).toBe('b');
		expect(
			findDuplicate(stored, { chain: 'tron', networkId: 'tron-nile', address: TRON.toLowerCase() })
		).toBeUndefined();
	});

	it('another network or chain is not a duplicate', () => {
		expect(
			findDuplicate(stored, { chain: 'evm', networkId: 'base-sepolia', address: EVM })
		).toBeUndefined();
		expect(
			findDuplicate(stored, { chain: 'tron', networkId: 'eth-sepolia', address: EVM })
		).toBeUndefined();
	});

	it('an entry being edited is not its own duplicate', () => {
		expect(
			findDuplicate(stored, { id: 'a', chain: 'evm', networkId: 'eth-sepolia', address: EVM })
		).toBeUndefined();
		expect(
			findDuplicate([...stored, { ...stored[0], id: 'd', label: 'Copy' }], {
				id: 'a',
				chain: 'evm',
				networkId: 'eth-sepolia',
				address: EVM
			})?.id
		).toBe('d');
	});
});
