import { hex } from '@scure/base';
import { err, ok, type Result } from '../result.ts';

// Hex as written in addresses, keys, and calldata: optional 0x prefix, either case.

export type HexError = 'empty' | 'odd-length' | 'not-hex';

export function encodeHex(bytes: Uint8Array, prefix = true): string {
	return `${prefix ? '0x' : ''}${hex.encode(bytes)}`;
}

export function decodeHex(text: string): Result<Uint8Array, HexError> {
	const digits = /^0x/i.test(text) ? text.slice(2) : text;
	if (digits === '') return err('empty');
	if (!/^[0-9a-f]*$/i.test(digits)) return err('not-hex');
	if (digits.length % 2 !== 0) return err('odd-length');
	return ok(hex.decode(digits.toLowerCase()));
}
