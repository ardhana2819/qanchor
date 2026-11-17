// Solidity ABI types (FR-050, ADR-005). `fixed`/`ufixed` and the `function` type are not
// supported: Solidity cannot use fixed-point values and external function pointers are rare in
// calldata (T-041 decision).

export type AbiType =
	| { kind: 'uint' | 'int'; bits: number }
	| { kind: 'address' }
	| { kind: 'bool' }
	| { kind: 'fixed-bytes'; size: number }
	| { kind: 'bytes' }
	| { kind: 'string' }
	/** `length` null: a dynamic array `T[]`. */
	| { kind: 'array'; item: AbiType; length: number | null }
	| { kind: 'tuple'; components: AbiParam[] };

export interface AbiParam {
	/** Empty when the signature or ABI gives no name. */
	name: string;
	type: AbiType;
}

export interface AbiFunction {
	name: string;
	inputs: AbiParam[];
}

/** The canonical type name used in a function signature, e.g. `(address,uint256)[]`. */
export function canonicalType(type: AbiType): string {
	switch (type.kind) {
		case 'uint':
		case 'int':
			return `${type.kind}${type.bits}`;
		case 'fixed-bytes':
			return `bytes${type.size}`;
		case 'array':
			return `${canonicalType(type.item)}[${type.length ?? ''}]`;
		case 'tuple':
			return `(${type.components.map((c) => canonicalType(c.type)).join(',')})`;
		default:
			return type.kind;
	}
}

/** Dynamic types are encoded in the tail and referenced by an offset in the head. */
export function isDynamic(type: AbiType): boolean {
	switch (type.kind) {
		case 'bytes':
		case 'string':
			return true;
		case 'array':
			return type.length === null || isDynamic(type.item);
		case 'tuple':
			return type.components.some((c) => isDynamic(c.type));
		default:
			return false;
	}
}

/** Bytes a type takes in the head: 32 for a dynamic type (its offset), else its full size. */
export function headSize(type: AbiType): number {
	if (isDynamic(type)) return 32;
	if (type.kind === 'array') return (type.length as number) * headSize(type.item);
	if (type.kind === 'tuple') return type.components.reduce((sum, c) => sum + headSize(c.type), 0);
	return 32;
}

/**
 * An elementary type name, or null when it is not one. `uint`/`int` are aliases of the 256-bit
 * types; sizes outside the ABI's ranges are rejected, never rounded.
 */
export function elementaryType(name: string): AbiType | null {
	if (name === 'address' || name === 'bool' || name === 'string' || name === 'bytes') {
		return { kind: name };
	}
	const integer = /^(u?int)(0|[1-9]\d*)?$/.exec(name);
	if (integer) {
		const bits = integer[2] === undefined ? 256 : Number(integer[2]);
		if (bits < 8 || bits > 256 || bits % 8 !== 0) return null;
		return { kind: integer[1] as 'uint' | 'int', bits };
	}
	const fixed = /^bytes(0|[1-9]\d*)$/.exec(name);
	if (fixed) {
		const size = Number(fixed[1]);
		return size >= 1 && size <= 32 ? { kind: 'fixed-bytes', size } : null;
	}
	return null;
}
