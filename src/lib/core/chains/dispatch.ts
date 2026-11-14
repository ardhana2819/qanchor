import { generateBitcoinAddress, validateBitcoinAddress } from './bitcoin.ts';
import { generateEvmAddress, validateEvmAddress } from './evm.ts';
import { generateSolanaAddress, validateSolanaAddress } from './solana.ts';
import { generateTronAddress, validateTronAddress } from './tron.ts';
import type { AddressTarget } from './catalog.ts';
import type { AddressCheck } from './types.ts';

// Generate or validate an address for a target by dispatching to its chain module.

export function generateAddress(target: AddressTarget): string {
	switch (target.chain) {
		case 'evm':
			return generateEvmAddress();
		case 'tron':
			return generateTronAddress();
		case 'solana':
			return generateSolanaAddress();
		case 'bitcoin':
			return generateBitcoinAddress(target.type, target.network);
	}
}

export function validateAddress(target: AddressTarget, text: string): AddressCheck {
	switch (target.chain) {
		case 'evm':
			return validateEvmAddress(text);
		case 'tron':
			return validateTronAddress(text);
		case 'solana':
			return validateSolanaAddress(text);
		case 'bitcoin':
			return validateBitcoinAddress(text, target.type, target.network);
	}
}
