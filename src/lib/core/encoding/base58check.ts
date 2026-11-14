import { sha256 } from '@noble/hashes/sha2.js';
import { base58, createBase58check } from '@scure/base';
import { err, ok, type Result } from '../result.ts';

// Base58Check (Bitcoin P2PKH/P2SH, Tron): payload + first 4 bytes of sha256(sha256(payload)).

export type Base58CheckError = 'empty' | 'not-base58' | 'too-short' | 'bad-checksum';

const coder = createBase58check(sha256);
const CHECKSUM_BYTES = 4;

export function encodeBase58Check(payload: Uint8Array): string {
	return coder.encode(payload);
}

/** The payload without its checksum, or which rule the text breaks. */
export function decodeBase58Check(text: string): Result<Uint8Array, Base58CheckError> {
	if (text === '') return err('empty');
	let bytes: Uint8Array;
	try {
		bytes = base58.decode(text);
	} catch {
		// 0, O, I, l, and anything outside the alphabet.
		return err('not-base58');
	}
	if (bytes.length <= CHECKSUM_BYTES) return err('too-short');
	const payload = bytes.slice(0, -CHECKSUM_BYTES);
	const expected = sha256(sha256(payload)).slice(0, CHECKSUM_BYTES);
	const actual = bytes.slice(-CHECKSUM_BYTES);
	return expected.every((byte, i) => byte === actual[i]) ? ok(payload) : err('bad-checksum');
}
