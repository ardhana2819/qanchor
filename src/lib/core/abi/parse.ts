import { keccak_256 } from '@noble/hashes/sha3.js';
import { encodeHex } from '../encoding/hex.ts';
import { err, ok, type Result } from '../result.ts';
import {
	canonicalType,
	elementaryType,
	type AbiFunction,
	type AbiParam,
	type AbiType
} from './types.ts';

// Reads a function signature or a JSON ABI into `AbiFunction`s (FR-050 AC-1, AC-2). A problem is
// one message for a field error on that input (FR-052 AC-5).

class ParseError extends Error {}

const IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const LOCATIONS = new Set(['memory', 'calldata', 'storage']);

/** `transfer(address,uint256)`; a `function` keyword and parameter names are also accepted. */
export function parseSignature(text: string): Result<AbiFunction, string> {
	try {
		return ok(new SignatureReader(text).read());
	} catch (error) {
		if (error instanceof ParseError) return err(error.message);
		throw error;
	}
}

class SignatureReader {
	private pos = 0;

	private readonly text: string;

	constructor(text: string) {
		this.text = text;
	}

	read(): AbiFunction {
		this.space();
		if (this.text.trim() === '')
			this.fail('Enter a function signature, e.g. transfer(address,uint256).');
		let name = this.ident('a function name');
		if (name === 'function') {
			this.space();
			name = this.ident('a function name');
		}
		this.space();
		const inputs = this.params();
		this.space();
		if (this.pos < this.text.length) this.unexpected();
		return { name, inputs };
	}

	private params(): AbiParam[] {
		this.expect('(');
		const params: AbiParam[] = [];
		this.space();
		if (this.peek() === ')') {
			this.pos++;
			return params;
		}
		for (;;) {
			params.push(this.param());
			if (this.peek() === ')') {
				this.pos++;
				return params;
			}
			this.expect(',');
		}
	}

	private param(): AbiParam {
		this.space();
		const type = this.type();
		this.space();
		let name = '';
		if (this.atIdent()) {
			name = this.ident('a parameter name');
			// Solidity source words that are not part of the ABI type: `address payable`, locations.
			if (name === 'payable' && type.kind === 'address' && this.atNextIdent()) {
				this.space();
				name = this.ident('a parameter name');
			}
			if (LOCATIONS.has(name)) {
				this.space();
				name = this.atIdent() ? this.ident('a parameter name') : '';
			}
			this.space();
		}
		return { name, type };
	}

	private type(): AbiType {
		let type: AbiType;
		if (this.peek() === '(') {
			type = this.tuple();
		} else {
			const start = this.pos;
			const name = this.ident('a type');
			if (name === 'tuple' && this.peek() === '(') {
				type = this.tuple();
			} else {
				const elementary = elementaryType(name);
				if (elementary === null) {
					this.pos = start;
					this.fail(`Unknown type "${name}".`);
				}
				type = elementary;
			}
		}
		while (this.peek() === '[') type = { kind: 'array', item: type, length: this.arrayLength() };
		return type;
	}

	private tuple(): AbiType {
		const components = this.params();
		if (components.length === 0) this.fail('A tuple needs at least one component.');
		return { kind: 'tuple', components };
	}

	private arrayLength(): number | null {
		this.pos++;
		const digits = /\d*/y;
		digits.lastIndex = this.pos;
		const text = (digits.exec(this.text) as RegExpExecArray)[0];
		this.pos += text.length;
		this.expect(']');
		return text === '' ? null : checkLength(text);
	}

	private ident(what: string): string {
		IDENT.lastIndex = this.pos;
		const match = IDENT.exec(this.text);
		if (!match) this.fail(`Expected ${what} at character ${this.pos + 1}.`);
		this.pos += match[0].length;
		return match[0];
	}

	/** After whitespace, another identifier follows. */
	private atNextIdent(): boolean {
		const start = this.pos;
		this.space();
		const next = this.atIdent();
		this.pos = start;
		return next;
	}

	private atIdent(): boolean {
		IDENT.lastIndex = this.pos;
		return IDENT.test(this.text);
	}

	private expect(char: string): void {
		this.space();
		if (this.peek() !== char) {
			if (this.pos >= this.text.length) this.fail(`Expected "${char}" at the end.`);
			this.fail(`Expected "${char}" at character ${this.pos + 1}, found "${this.peek()}".`);
		}
		this.pos++;
		this.space();
	}

	private unexpected(): never {
		this.fail(`Unexpected "${this.peek()}" at character ${this.pos + 1}.`);
	}

	private peek(): string {
		return this.text[this.pos] ?? '';
	}

	private space(): void {
		while (/\s/.test(this.peek())) this.pos++;
	}

	private fail(message: string): never {
		throw new ParseError(message);
	}
}

function checkLength(text: string): number {
	const length = Number(text);
	if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(length)) {
		throw new ParseError(`Array length "${text}" must be a whole number from 1.`);
	}
	return length;
}

/**
 * The functions of a JSON ABI: an array of entries, or a build artifact with an `abi` array.
 * Events, errors, and constructors are skipped; an entry without `type` is a function (ABI spec).
 */
export function parseAbiJson(text: string): Result<AbiFunction[], string> {
	if (text.trim() === '') return err('Paste a JSON ABI.');
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return err('The ABI is not valid JSON.');
	}
	const entries = isObject(json) && Array.isArray(json.abi) ? json.abi : json;
	if (!Array.isArray(entries)) return err('The ABI must be a JSON array of entries.');
	const functions: AbiFunction[] = [];
	try {
		entries.forEach((entry, i) => {
			if (!isObject(entry)) throw new ParseError(`Entry ${i + 1} is not an object.`);
			if (entry.type !== undefined && entry.type !== 'function') return;
			functions.push(jsonFunction(entry, `Entry ${i + 1}`));
		});
	} catch (error) {
		if (error instanceof ParseError) return err(error.message);
		throw error;
	}
	if (functions.length === 0) return err('The ABI has no functions.');
	return ok(functions);
}

function jsonFunction(entry: Record<string, unknown>, where: string): AbiFunction {
	const name = entry.name;
	if (typeof name !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
		throw new ParseError(`${where} has no valid function name.`);
	}
	const at = `${where} (${name})`;
	const inputs = entry.inputs ?? [];
	if (!Array.isArray(inputs)) throw new ParseError(`${at}: "inputs" is not an array.`);
	return { name, inputs: jsonParams(inputs, at) };
}

function jsonParams(params: unknown[], where: string): AbiParam[] {
	return params.map((param, i) => {
		const at = `${where}, input ${i + 1}`;
		if (!isObject(param)) throw new ParseError(`${at} is not an object.`);
		const name = param.name ?? '';
		if (typeof name !== 'string') throw new ParseError(`${at}: "name" is not a string.`);
		return { name, type: jsonType(param, name ? `${where}, input "${name}"` : at) };
	});
}

function jsonType(param: Record<string, unknown>, where: string): AbiType {
	const text = param.type;
	if (typeof text !== 'string') throw new ParseError(`${where} has no "type".`);
	const match = /^([a-z0-9]+)((?:\[\d*\])*)$/.exec(text);
	if (!match) throw new ParseError(`${where} has an unknown type "${text}".`);
	let type: AbiType | null;
	if (match[1] === 'tuple') {
		if (!Array.isArray(param.components) || param.components.length === 0) {
			throw new ParseError(`${where} is a tuple without "components".`);
		}
		type = { kind: 'tuple', components: jsonParams(param.components, where) };
	} else {
		type = elementaryType(match[1]);
		if (type === null) throw new ParseError(`${where} has an unknown type "${text}".`);
	}
	for (const [, length] of match[2].matchAll(/\[(\d*)\]/g)) {
		type = { kind: 'array', item: type, length: length === '' ? null : checkLength(length) };
	}
	return type;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The canonical signature the selector is hashed from, e.g. `transfer(address,uint256)`. */
export function functionSignature(fn: AbiFunction): string {
	return `${fn.name}(${fn.inputs.map((p) => canonicalType(p.type)).join(',')})`;
}

/** The 4-byte selector: the first 4 bytes of keccak-256 of the canonical signature, as 0x hex. */
export function functionSelector(fn: AbiFunction): string {
	return encodeHex(keccak_256(new TextEncoder().encode(functionSignature(fn))).subarray(0, 4));
}
