import { parseAmount } from '#lib/core/amount/decimal.ts';
import type { AmountParams } from '#lib/core/amount/cases.ts';
import { parseDecimals } from '#lib/core/units/families.ts';
import { DECIMALS_ERROR, describeParameterError } from '#lib/ui/amount-errors.ts';

// The Amount edge cases form (FR-020): presets, field validation, and the parameters it produces.

/** Verified against primary sources in T-014 (docs/decisions.md, 2026-11-14). */
export const PRESETS = [
	{ value: 'eth', label: 'ETH', decimals: 18 },
	{ value: 'btc', label: 'BTC', decimals: 8 },
	{ value: 'sol', label: 'SOL', decimals: 9 },
	{ value: 'trx', label: 'TRX', decimals: 6 },
	{ value: 'usdt-ethereum', label: 'USDT on Ethereum', decimals: 6 },
	{ value: 'usdt-tron', label: 'USDT on Tron', decimals: 6 },
	{ value: 'usdt-bsc', label: 'USDT on BNB Smart Chain', decimals: 18 }
] as const;

export type PresetId = (typeof PRESETS)[number]['value'] | 'custom';

export const PRESET_OPTIONS: readonly { value: PresetId; label: string }[] = [
	{ value: 'custom', label: 'Custom' },
	...PRESETS.map(({ value, label, decimals }) => ({ value, label: `${label} (${decimals})` }))
];

export function presetDecimals(id: PresetId): number | null {
	return PRESETS.find((preset) => preset.value === id)?.decimals ?? null;
}

export const OPTIONAL_FIELDS = [
	{ key: 'balance', label: 'Balance' },
	{ key: 'fee', label: 'Network fee' },
	{ key: 'min', label: 'Minimum' },
	{ key: 'max', label: 'Maximum' }
] as const;

export type OptionalField = (typeof OPTIONAL_FIELDS)[number]['key'];
export type FormValues = { decimals: string } & Record<OptionalField, string>;
export type FormErrors = Partial<Record<'decimals' | OptionalField, string>>;

export type FormResult = { ok: true; params: AmountParams } | { ok: false; errors: FormErrors };

/**
 * Validates every field (FR-020 AC-1). An optional field left empty is omitted; one with more
 * decimal places than the token allows blocks generation (AC-5). Surrounding whitespace is
 * trimmed, as in the converter (EC-013). Empty decimals is not an error: nothing is entered yet.
 */
export function readForm(values: FormValues): FormResult {
	const errors: FormErrors = {};
	const decimals = values.decimals.trim() === '' ? null : parseDecimals(values.decimals);
	if (values.decimals.trim() !== '' && decimals === null) errors.decimals = DECIMALS_ERROR;

	const params: AmountParams = { decimals: decimals ?? 0 };
	for (const { key, label } of OPTIONAL_FIELDS) {
		if (values[key].trim() === '') continue;
		// Without valid decimals the amount cannot be checked yet; the decimals field says why.
		if (decimals === null) continue;
		const parsed = parseAmount(values[key], decimals, { trim: true });
		if (parsed.ok) params[key] = parsed.value;
		else errors[key] = describeParameterError(parsed.error, label);
	}

	if (decimals === null || Object.keys(errors).length > 0) return { ok: false, errors };
	return { ok: true, params };
}
