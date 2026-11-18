import { toChecksumAddress } from '../encoding/eip55.ts';
import { decodeHex, encodeHex, type HexError } from '../encoding/hex.ts';
import { err, ok, type Result } from '../result.ts';
import { functionSelector } from './parse.ts';
import { headSize, isDynamic, type AbiFunction, type AbiParam, type AbiType } from './types.ts';

// ABI decoding of calldata (FR-050, FR-052, EC-014). Decoding is all or nothing: one bad offset,
// length, or padding fails the whole call, so no partly decoded value is ever shown as valid
// (FR-052 AC-4). Value types are checked as strictly as Solidity's ABI decoder: no dirty bits.

export type AbiValue =
	/** Exact; `int` values are signed. */
	| { kind: 'uint' | 'int'; value: bigint }
	/** EIP-55 checksum form (FR-050 AC-4). */
	| { kind: 'address'; value: string }
	| { kind: 'bool'; value: boolean }
	/** 0x hex. */
	| { kind: 'fixed-bytes' | 'bytes'; value: string }
	| { kind: 'string'; value: string }
	| { kind: 'array' | 'tuple'; items: AbiValue[] };

export interface DecodedCall {
	fn: AbiFunction;
	selector: string;
	/** One value per input, in order. */
	args: AbiValue[];
	/** Bytes after the encoded arguments: shown as a warning, not an error (EC-014). */
	extraBytes: number;
}

export interface Calldata {
	selector: string;
	/** Everything after the selector. */
	data: Uint8Array;
}

export type CalldataError = HexError | 'no-selector';

export type DecodeError =
	| { kind: 'selector-mismatch'; calldata: string; abi: string[] }
	| { kind: 'invalid'; message: string };

/** Splits calldata hex into its selector and argument data (FR-052 AC-1, AC-2). */
export function splitCalldata(text: string): Result<Calldata, CalldataError> {
	const trimmed = text.trim();
	if (trimmed === '') return err('empty');
	// "0x" alone is empty calldata, a plain transfer: no selector rather than nothing entered.
	const bytes = /^0x$/i.test(trimmed) ? ok(new Uint8Array(0)) : decodeHex(trimmed);
	if (!bytes.ok) return bytes;
	if (bytes.value.length < 4) return err('no-selector');
	return ok({ selector: encodeHex(bytes.value.subarray(0, 4)), data: bytes.value.subarray(4) });
}

/**
 * Decodes calldata with the function among `fns` whose selector matches (FR-050 AC-1, AC-2);
 * a selector found in none of them is a mismatch listing both sides (FR-052 AC-3).
 */
export function decodeCall(
	fns: AbiFunction[],
	calldata: Calldata
): Result<DecodedCall, DecodeError> {
	const fn = fns.find((f) => functionSelector(f) === calldata.selector);
	if (!fn) {
		const abi = [...new Set(fns.map(functionSelector))];
		return err({ kind: 'selector-mismatch', calldata: calldata.selector, abi });
	}
	const decoded = decodeParams(fn.inputs, calldata.data);
	if (!decoded.ok) return err({ kind: 'invalid', message: decoded.error });
	return ok({ fn, selector: calldata.selector, ...decoded.value });
}

class DecodeFailure extends Error {}

/** The argument values of `params` encoded in `data`, or the first inconsistency found. */
export function decodeParams(
	params: AbiParam[],
	data: Uint8Array
): Result<{ args: AbiValue[]; extraBytes: number }, string> {
	const reader = new Reader(data);
	try {
		const args = reader.tuple(params, 0, argument);
		return ok({ args, extraBytes: Math.max(0, data.length - reader.end) });
	} catch (error) {
		if (error instanceof DecodeFailure) return err(error.message);
		throw error;
	}
}

const WORD = 32;
const TWO_256 = 1n << 256n;
/** A well-formed encoding reads each byte once; aliased offsets that reread far more are refused. */
const READ_BUDGET_FACTOR = 4;

class Reader {
	/** One past the last byte any read covered, padding included: the encoding's end. */
	end = 0;
	private read = 0;

	private readonly data: Uint8Array;

	constructor(data: Uint8Array) {
		this.data = data;
	}

	/** `label` names each member in error messages, e.g. `Argument 2 (ids)[3]`. */
	tuple(params: AbiParam[], base: number, label: Label): AbiValue[] {
		let head = base;
		return params.map((param, i) => {
			const value = this.member(param.type, base, head, label(param, i));
			head += headSize(param.type);
			return value;
		});
	}

	/** A value whose head is at `head` inside an encoding that starts at `base`. */
	private member(type: AbiType, base: number, head: number, at: string): AbiValue {
		if (!isDynamic(type)) return this.value(type, head, at);
		const offset = this.uint(head, at);
		if (offset > BigInt(this.data.length - base)) {
			this.fail(at, `offset ${offset} points past the end of the data`);
		}
		return this.value(type, base + Number(offset), at);
	}

	private value(type: AbiType, pos: number, at: string): AbiValue {
		switch (type.kind) {
			case 'uint': {
				const value = this.uint(pos, at);
				if (value >> BigInt(type.bits) !== 0n)
					this.fail(at, `value does not fit in uint${type.bits}`);
				return { kind: 'uint', value };
			}
			case 'int': {
				const word = this.uint(pos, at);
				const value = word >= TWO_256 / 2n ? word - TWO_256 : word;
				const limit = 1n << BigInt(type.bits - 1);
				if (value < -limit || value >= limit)
					this.fail(at, `value does not fit in int${type.bits}`);
				return { kind: 'int', value };
			}
			case 'address': {
				const word = this.word(pos, at);
				if (word.subarray(0, 12).some((b) => b !== 0))
					this.fail(at, 'address has non-zero padding');
				return { kind: 'address', value: toChecksumAddress(word.subarray(12)) };
			}
			case 'bool': {
				const value = this.uint(pos, at);
				if (value > 1n) this.fail(at, `bool is ${value}, not 0 or 1`);
				return { kind: 'bool', value: value === 1n };
			}
			case 'fixed-bytes': {
				const word = this.word(pos, at);
				if (word.subarray(type.size).some((b) => b !== 0)) {
					this.fail(at, `bytes${type.size} has non-zero padding`);
				}
				return { kind: 'fixed-bytes', value: encodeHex(word.subarray(0, type.size)) };
			}
			case 'bytes':
				return { kind: 'bytes', value: encodeHex(this.dynamicBytes(pos, at)) };
			case 'string':
				return { kind: 'string', value: this.utf8(this.dynamicBytes(pos, at), at) };
			case 'array': {
				let start = pos;
				let length = type.length;
				if (length === null) {
					const count = this.uint(pos, at);
					start = pos + WORD;
					// Checked before anything is allocated: a huge length must not hang the page.
					if (count > BigInt(this.data.length))
						this.fail(at, `array length ${count} exceeds the data`);
					length = Number(count);
				}
				if (start + length * headSize(type.item) > this.data.length) {
					this.fail(at, `array of ${length} items runs past the end of the data`);
				}
				const items = Array.from({ length }, () => ({ name: '', type: type.item }));
				return { kind: 'array', items: this.tuple(items, start, (_, i) => `${at}[${i}]`) };
			}
			case 'tuple':
				return { kind: 'tuple', items: this.tuple(type.components, pos, member(at)) };
		}
	}

	private utf8(bytes: Uint8Array, at: string): string {
		try {
			return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			this.fail(at, 'string is not valid UTF-8');
		}
	}

	private dynamicBytes(pos: number, at: string): Uint8Array {
		const length = this.uint(pos, at);
		const start = pos + WORD;
		if (length > BigInt(this.data.length - start)) {
			this.fail(at, `length ${length} runs past the end of the data`);
		}
		const size = Number(length);
		this.cover(start, Math.ceil(size / WORD) * WORD, at);
		return this.data.slice(start, start + size);
	}

	private uint(pos: number, at: string): bigint {
		return BigInt(encodeHex(this.word(pos, at)));
	}

	private word(pos: number, at: string): Uint8Array {
		if (pos + WORD > this.data.length) this.fail(at, 'data ends before this value');
		this.cover(pos, WORD, at);
		return this.data.subarray(pos, pos + WORD);
	}

	private cover(pos: number, size: number, at: string): void {
		this.end = Math.max(this.end, pos + size);
		this.read += size;
		if (this.read > READ_BUDGET_FACTOR * this.data.length + WORD) {
			this.fail(at, 'offsets point to the same data many times over');
		}
	}

	private fail(at: string, problem: string): never {
		throw new DecodeFailure(`${at}: ${problem}.`);
	}
}

type Label = (param: AbiParam, index: number) => string;

const argument: Label = (param, i) => `Argument ${i + 1}${param.name ? ` (${param.name})` : ''}`;

const member =
	(at: string): Label =>
	(param, i) =>
		`${at}.${param.name || i}`;

export interface DataWord {
	/** Byte offset from the start of the argument data. */
	offset: number;
	/** 0x hex; the last word is shorter when the data is not a whole number of words. */
	hex: string;
}

/** Argument data split into 32-byte words, for a selector nothing can decode (FR-051 AC-2). */
export function dataWords(data: Uint8Array): DataWord[] {
	const words: DataWord[] = [];
	for (let offset = 0; offset < data.length; offset += WORD) {
		words.push({ offset, hex: encodeHex(data.subarray(offset, offset + WORD)) });
	}
	return words;
}
