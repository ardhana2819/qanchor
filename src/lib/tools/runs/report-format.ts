import { REPORT_FORMATS, type ReportFormat } from '#lib/core/qa/report.ts';

// The bug report's format control (design 13.3 P2-05; FR-121 AC-1). The last choice is a
// preference of this browser, like a collapsed panel, so it lives in localStorage and is not
// part of the backup (plan finding F-10).

export const REPORT_FORMAT_KEY = 'qanchor.reportFormat';

export const REPORT_FORMAT_OPTIONS: readonly { value: ReportFormat; label: string }[] = [
	{ value: 'markdown', label: 'Markdown' },
	{ value: 'jira', label: 'Jira' }
];

const isFormat = (value: string | null): value is ReportFormat =>
	REPORT_FORMATS.some((format) => format === value);

/** The format chosen last, or Markdown when there is none (as in the approved prototype). */
export function readReportFormat(storage?: Pick<Storage, 'getItem'>): ReportFormat {
	try {
		// Inside the try: reading `localStorage` itself throws where storage is blocked.
		const stored = (storage ?? localStorage).getItem(REPORT_FORMAT_KEY);
		return isFormat(stored) ? stored : 'markdown';
	} catch {
		// Storage blocked by browser settings: the default applies.
		return 'markdown';
	}
}

/** Remembers the choice; false when the browser refuses (it then holds for this dialog only). */
export function storeReportFormat(
	format: ReportFormat,
	storage?: Pick<Storage, 'setItem'>
): boolean {
	try {
		(storage ?? localStorage).setItem(REPORT_FORMAT_KEY, format);
		return true;
	} catch {
		return false;
	}
}

/** The toast after a copy (design 13.7). */
export const copiedText = (format: ReportFormat) =>
	format === 'markdown' ? 'Copied as Markdown' : 'Copied as Jira markup';

/** The dialog's title (design 13.3 P2-05): "Bug report: TC-12". */
export const reportTitle = (key: string) => `Bug report: ${key}`;
