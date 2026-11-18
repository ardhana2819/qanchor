import type { AbiValue, DecodeError } from '#lib/core/abi/decode.ts';
import { canonicalType, type AbiParam, type AbiType } from '#lib/core/abi/types.ts';

// Turns decoded arguments into table rows and errors into copy (design S-06, section 7).

export interface ArgumentRow {
	key: string;
	/** 1-based argument number; nested values keep their argument's number. */
	index: number;
	/** Path inside the argument, e.g. `orders[0].maker`; empty for an unnamed top-level value. */
	name: string;
	type: string;
	value: string;
}

/** One row per value; arrays and tuples become one row per item, named by their path. */
export function argumentRows(params: AbiParam[], args: AbiValue[]): ArgumentRow[] {
	const rows: ArgumentRow[] = [];
	params.forEach((param, i) => flatten(rows, i + 1, param.name, param.type, args[i]));
	return rows;
}

function flatten(rows: ArgumentRow[], index: number, name: string, type: AbiType, value: AbiValue) {
	const add = (text: string) =>
		rows.push({ key: `${index}:${name}`, index, name, type: canonicalType(type), value: text });
	if (value.kind === 'array' && type.kind === 'array') {
		if (value.items.length === 0) return add('Empty array');
		value.items.forEach((item, i) => flatten(rows, index, `${name}[${i}]`, type.item, item));
		return;
	}
	if (value.kind === 'tuple' && type.kind === 'tuple') {
		value.items.forEach((item, i) => {
			const component = type.components[i];
			const part = component.name || String(i);
			flatten(rows, index, name ? `${name}.${part}` : part, component.type, item);
		});
		return;
	}
	add(scalar(value));
}

function scalar(value: AbiValue): string {
	switch (value.kind) {
		case 'uint':
		case 'int':
			// Exact decimal, never rounded (FR-050 AC-4).
			return value.value.toString();
		case 'bool':
			return String(value.value);
		case 'array':
		case 'tuple':
			throw new Error('a nested value does not match its type');
		default:
			return value.value;
	}
}

export const CALLDATA_COPY = {
	empty: 'Paste calldata to decode.',
	format: 'Calldata must be hex with an even number of digits.',
	noSelector: 'No function selector (plain transfer or empty data).'
} as const;

/** Title and text for a decode that produced nothing (FR-052 AC-3, AC-4). */
export function decodeErrorCopy(error: DecodeError): { title: string; text: string } {
	if (error.kind === 'selector-mismatch') {
		return {
			title: 'Selector mismatch',
			text: `Selector mismatch: calldata ${error.calldata}, ABI ${error.abi.join(', ')}.`
		};
	}
	return {
		title: 'Decoding failed',
		text: `${error.message} Nothing was decoded: the data does not match these argument types.`
	};
}

export function extraBytesCopy(count: number): string {
	return `${count} extra ${count === 1 ? 'byte' : 'bytes'} after the arguments. They are not part of the call as decoded.`;
}
