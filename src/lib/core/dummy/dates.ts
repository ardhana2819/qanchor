import type { Rng } from './random.ts';

// Calendar dates as plain integers. No `Date` objects: their time zone handling would make a seed
// give different birth dates on machines in different zones (FR-082 AC-1).

export interface CivilDate {
	readonly year: number;
	/** 1 to 12. */
	readonly month: number;
	/** 1 to 31. */
	readonly day: number;
}

/** Days since 1970-01-01 in the proleptic Gregorian calendar (H. Hinnant, "days_from_civil"). */
export function daysFromCivil({ year, month, day }: CivilDate): number {
	const y = month <= 2 ? year - 1 : year;
	const era = Math.floor(y / 400);
	const yearOfEra = y - era * 400;
	const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
	const dayOfEra =
		yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
	return era * 146097 + dayOfEra - 719468;
}

/** Inverse of `daysFromCivil` (H. Hinnant, "civil_from_days"). */
export function civilFromDays(days: number): CivilDate {
	const z = days + 719468;
	const era = Math.floor(z / 146097);
	const dayOfEra = z - era * 146097;
	const yearOfEra = Math.floor(
		(dayOfEra -
			Math.floor(dayOfEra / 1460) +
			Math.floor(dayOfEra / 36524) -
			Math.floor(dayOfEra / 146096)) /
			365
	);
	const dayOfYear =
		dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
	const mp = Math.floor((5 * dayOfYear + 2) / 153);
	const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
	const month = mp < 10 ? mp + 3 : mp - 9;
	return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** Uniform date in [from, to], both inclusive. Every result is a real calendar date (EC-016). */
export function randomDate(rng: Rng, from: CivilDate, to: CivilDate): CivilDate {
	return civilFromDays(rng.between(daysFromCivil(from), daysFromCivil(to)));
}

/** `YYYY-MM-DD`. */
export function isoDate({ year, month, day }: CivilDate): string {
	return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

export function pad2(value: number): string {
	return String(value).padStart(2, '0');
}
