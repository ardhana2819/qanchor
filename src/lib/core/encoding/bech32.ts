import { bech32, bech32m } from '@scure/base';
import { err, ok, type Result } from '../result.ts';

// Bech32 (BIP-173) and Bech32m (BIP-350), and native segwit addresses on top of them (NFR-014).

export type Bech32Encoding = 'bech32' | 'bech32m';

export interface Bech32Decoded {
	encoding: Bech32Encoding;
	prefix: string;
	words: number[];
}

export type Bech32Error =
	| 'mixed-case'
	| 'too-long'
	| 'no-separator'
	| 'invalid-prefix'
	| 'invalid-character'
	| 'too-short'
	| 'bad-checksum';

const CHARSET = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
const MAX_LENGTH = 90;
const CHECKSUM_LENGTH = 6;

/** Decodes either encoding; a string can only ever be valid in one of them. */
export function decodeBech32(text: string): Result<Bech32Decoded, Bech32Error> {
	if (text !== text.toLowerCase() && text !== text.toUpperCase()) return err('mixed-case');
	if (text.length > MAX_LENGTH) return err('too-long');
	const lower = text.toLowerCase();
	const separator = lower.lastIndexOf('1');
	if (separator === -1) return err('no-separator');
	const prefix = lower.slice(0, separator);
	const data = lower.slice(separator + 1);
	if (prefix === '' || [...prefix].some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126)) {
		return err('invalid-prefix');
	}
	if (data.length < CHECKSUM_LENGTH) return err('too-short');
	if (!CHARSET.test(data)) return err('invalid-character');
	for (const [encoding, coder] of [
		['bech32', bech32],
		['bech32m', bech32m]
	] as const) {
		const decoded = coder.decodeUnsafe(lower, MAX_LENGTH);
		if (decoded) return ok({ encoding, prefix: decoded.prefix, words: decoded.words });
	}
	return err('bad-checksum');
}

export interface SegwitAddress {
	prefix: string;
	version: number;
	program: Uint8Array;
}

export type SegwitError =
	| Bech32Error
	| 'unknown-prefix'
	| 'empty-data'
	| 'invalid-version'
	/** Version 0 must use Bech32, versions 1 to 16 Bech32m (BIP-350). */
	| 'wrong-encoding'
	| 'invalid-padding'
	| 'invalid-program-length';

const MAX_VERSION = 16;

export function encodeSegwitAddress(prefix: string, version: number, program: Uint8Array): string {
	if (!Number.isInteger(version) || version < 0 || version > MAX_VERSION) {
		throw new RangeError(`witness version must be 0 to ${MAX_VERSION}, got ${version}`);
	}
	if (!programLengthOk(version, program.length)) {
		throw new RangeError(`invalid program length ${program.length} for version ${version}`);
	}
	const coder = version === 0 ? bech32 : bech32m;
	return coder.encode(prefix, [version, ...coder.toWords(program)]);
}

function programLengthOk(version: number, length: number): boolean {
	if (length < 2 || length > 40) return false;
	return version !== 0 || length === 20 || length === 32;
}

/** A native segwit address for one of `prefixes` (e.g. "bc", "tb"), or which rule it breaks. */
export function decodeSegwitAddress(
	text: string,
	prefixes: readonly string[]
): Result<SegwitAddress, SegwitError> {
	const decoded = decodeBech32(text);
	if (!decoded.ok) return decoded;
	const { encoding, prefix, words } = decoded.value;
	if (!prefixes.includes(prefix)) return err('unknown-prefix');
	if (words.length === 0) return err('empty-data');
	const [version, ...rest] = words;
	if (version > MAX_VERSION) return err('invalid-version');
	if ((version === 0) !== (encoding === 'bech32')) return err('wrong-encoding');
	const program = bech32.fromWordsUnsafe(rest);
	if (!program) return err('invalid-padding');
	if (!programLengthOk(version, program.length)) return err('invalid-program-length');
	return ok({ prefix, version, program });
}
