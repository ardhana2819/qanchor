import { err, ok, type Result } from '../result.ts';

// Small readers for untrusted JSON. Each throws a `FieldError` naming the field, so a parser can
// read a response top to bottom and turn the first problem into one `bad-response` detail. The
// throw never leaves this module's callers: `reading` returns it as a value (ADR-013).

export class FieldError extends Error {}

export type Json = Record<string, unknown>;

export function object(value: unknown, field: string): Json {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new FieldError(`${field} is not an object`);
	}
	return value as Json;
}

export function array(value: unknown, field: string): unknown[] {
	if (!Array.isArray(value)) throw new FieldError(`${field} is not an array`);
	return value;
}

export function string(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new FieldError(`${field} is not a string`);
	return value;
}

/** A JSON number that is a whole, exactly representable value (fees, slots, balances). */
export function integer(value: unknown, field: string): bigint {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw new FieldError(`${field} is not a non-negative integer`);
	}
	return BigInt(value);
}

/** An EVM JSON-RPC quantity: 0x-prefixed hex with no leading zeros (EIP-1474), read leniently. */
export function quantity(value: unknown, field: string): bigint {
	if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
		throw new FieldError(`${field} is not a hex quantity`);
	}
	return BigInt(value);
}

/** Runs a parser and turns a FieldError into its message; anything else is a bug and rethrown. */
export function reading<T>(parse: () => T): Result<T, string> {
	try {
		return ok(parse());
	} catch (error) {
		if (error instanceof FieldError) return err(error.message);
		throw error;
	}
}
