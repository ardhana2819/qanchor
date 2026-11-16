import type { CivilDate } from '#lib/core/dummy/dates.ts';
import type { NpwpFormat, PhoneFormat, Realism } from '#lib/core/dummy/fields.ts';
import type { DummyRow } from '#lib/core/dummy/rows.ts';
import {
	FIELD_IDS,
	MAX_AGE,
	MAX_ROWS,
	type FieldId,
	type Settings,
	type SettingsError
} from '#lib/core/dummy/settings.ts';

// The dummy data form (FR-080, FR-084, design S-09): what the controls offer, how typed text
// becomes settings, and the message for each settings error.

export const FIELD_LABELS: Readonly<Record<FieldId, string>> = {
	name: 'Full name',
	gender: 'Gender',
	birthDate: 'Birth date',
	nik: 'NIK',
	npwp: 'NPWP',
	phone: 'Phone',
	address: 'Address',
	bank: 'Bank account'
};

export const FIELD_OPTIONS = FIELD_IDS.map((id) => ({ value: id, label: FIELD_LABELS[id] }));

export const PHONE_FORMATS: readonly { value: PhoneFormat; label: string }[] = [
	{ value: 'national', label: '08…' },
	{ value: 'plus62', label: '+62 8…' },
	{ value: 'sixtwo', label: '62 8…' }
];

export const NPWP_FORMATS: readonly { value: NpwpFormat; label: string }[] = [
	{ value: 'legacy', label: '15-digit (XX.XXX.XXX.X-XXX.000)' },
	{ value: 'nik', label: '16-digit (same as NIK)' }
];

export const REALISM_OPTIONS: readonly { value: Realism; label: string }[] = [
	{ value: 'realistic', label: 'Realistic' },
	{ value: 'non-colliding', label: 'Non-colliding' }
];

/** A whole number as typed (digits only, so "1e3" and "1.0" are rejected), or NaN. */
export function parseWhole(text: string): number {
	const trimmed = text.trim();
	return /^\d{1,9}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** `YYYY-MM-DD` as typed; whether the date exists is checked with the other settings. */
export function parseIsoDate(text: string): CivilDate {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
	if (!match) return { year: Number.NaN, month: Number.NaN, day: Number.NaN };
	return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Today in the user's time zone: ages are counted from the date on the user's calendar. */
export function today(now = new Date()): CivilDate {
	return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export interface FormErrors {
	count?: string;
	fields?: string;
	ages?: string;
	asOf?: string;
}

const COUNT_ERROR = `Enter a whole number from 1 to ${MAX_ROWS.toLocaleString('en-US')}.`;

/** One message per form control, in the words of design S-09. */
export function formErrors(errors: readonly SettingsError[]): FormErrors {
	const messages: FormErrors = {};
	for (const error of errors) {
		switch (error.code) {
			case 'count':
				messages.count = COUNT_ERROR;
				break;
			case 'needs-two-rows':
				messages.count ??= 'This preset needs at least 2 rows.';
				break;
			case 'no-fields':
				messages.fields = 'Select at least one field.';
				break;
			case 'needs-field':
				messages.fields ??= `This preset needs ${error.fields.map((f) => FIELD_LABELS[f]).join(' or ')}.`;
				break;
			case 'ages':
				messages.ages = `Enter whole ages from 0 to ${MAX_AGE}, the first no more than the second.`;
				break;
			case 'as-of':
				messages.asOf = 'Enter a real date as YYYY-MM-DD.';
				break;
		}
	}
	return messages;
}

/** One finished run: the rows and exactly what produced them. */
export interface DummyResult {
	readonly rows: readonly DummyRow[];
	readonly seed: string;
	readonly settings: Settings;
}
