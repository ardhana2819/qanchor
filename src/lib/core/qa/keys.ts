// Test case keys: `TC-<n>` with n a positive integer (FR-100 AC-2).

const PREFIX = 'TC-';

export function formatKey(number: number): string {
	return `${PREFIX}${number}`;
}

/**
 * The number in a case key, or null when the text is not one. Accepts surrounding spaces and any
 * letter case (`tc-12`), because keys are typed and pasted; rejects `TC-0`, leading zeros
 * (`TC-012`, which would make two spellings of one key), and numbers past the safe integer range.
 */
export function parseKey(text: string): number | null {
	const match = /^tc-([1-9]\d*)$/i.exec(text.trim());
	if (!match) return null;
	const number = Number(match[1]);
	return Number.isSafeInteger(number) ? number : null;
}
