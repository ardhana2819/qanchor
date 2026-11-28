import type { AddressRow } from '#lib/core/chains/catalog.ts';
import type { Person } from '#lib/core/dummy/fields.ts';
import type { FieldId } from '#lib/core/dummy/settings.ts';

// Insert test data into a step (FR-151): what the dialog offers and the text it inserts. Types
// only from the generators here, so the editor carries none of their code (AC-3, NFR-015).

export type DataKind = 'address' | 'amount' | 'dummy';

export const KIND_OPTIONS: readonly { value: DataKind; label: string }[] = [
	{ value: 'address', label: 'Address' },
	{ value: 'amount', label: 'Amount' },
	{ value: 'dummy', label: 'Dummy data' }
];

/** The step field a value goes into, and the selection it replaces. */
export interface Caret {
	field: 'action' | 'expected';
	start: number;
	end: number;
}

/** Where a value goes when the step has not been focused yet: the end of its action. */
export function defaultCaret(action: string): Caret {
	return { field: 'action', start: action.length, end: action.length };
}

/**
 * The field's text with `text` in place of the selection (FR-151 AC-2), and the caret after it.
 * A selection outside the text, as after the field was edited elsewhere, is clamped to it.
 */
export function spliceText(
	value: string,
	caret: Pick<Caret, 'start' | 'end'>,
	text: string
): { value: string; caret: number } {
	const start = Math.min(Math.max(0, caret.start), value.length);
	const end = Math.min(Math.max(start, caret.end), value.length);
	return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}

/** An address as inserted: an invalid sample is followed by its reason (FR-151 AC-2). */
export function addressText(row: Pick<AddressRow, 'address' | 'validity' | 'reason'>): string {
	if (row.validity === 'valid') return row.address;
	// The empty-string sample is the reason alone, not a stray leading space.
	return row.address === '' ? `(${row.reason})` : `${row.address} (${row.reason})`;
}

/** One dummy-data field of a person as inserted (FR-151 AC-1, FR-080). */
export function dummyText(person: Person, field: FieldId): string {
	switch (field) {
		case 'name':
			return person.name;
		case 'gender':
			return person.gender;
		case 'birthDate':
			return person.birthDate;
		case 'nik':
			return person.nik;
		case 'npwp':
			return person.npwp;
		case 'phone':
			return person.phone;
		case 'address':
			return person.address.full;
		case 'bank':
			return `${person.bank.name} ${person.bank.account}`;
	}
}

/** A fresh dummy-data seed, as `randomSeed` makes one, without loading its hashing code. */
export function freshSeed(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
		b.toString(16).padStart(2, '0')
	).join('');
}

/** Where the dialog will insert: "Into step 2, Expected result, at the cursor." */
export const targetText = (step: number, field: Caret['field']) =>
	`Into step ${step}, ${field === 'action' ? 'Action' : 'Expected result'}, at the cursor.`;

export const insertedText = (step: number) => `Test data inserted into step ${step}.`;

export const GENERATE_ERROR = 'The value could not be generated. Try again.';
