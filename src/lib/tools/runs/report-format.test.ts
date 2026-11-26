import { describe, expect, it } from 'vitest';
import {
	copiedText,
	readReportFormat,
	REPORT_FORMAT_KEY,
	reportTitle,
	storeReportFormat
} from './report-format.ts';

// The bug report's remembered format (FR-121 AC-1, plan finding F-10) and its copy (design 13.7).

function memory(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value)
	};
}

const blocked = {
	getItem(): string | null {
		throw new DOMException('Blocked', 'SecurityError');
	},
	setItem(): void {
		throw new DOMException('Blocked', 'SecurityError');
	}
};

describe('report format (FR-121 AC-1)', () => {
	it('is Markdown until a format is chosen', () => {
		expect(readReportFormat(memory())).toBe('markdown');
	});

	it('remembers the last choice', () => {
		const storage = memory();
		expect(storeReportFormat('jira', storage)).toBe(true);
		expect(storage.values.get(REPORT_FORMAT_KEY)).toBe('jira');
		expect(readReportFormat(storage)).toBe('jira');
	});

	it('ignores a stored value that is not a format', () => {
		expect(readReportFormat(memory({ [REPORT_FORMAT_KEY]: 'html' }))).toBe('markdown');
		expect(readReportFormat(memory({ [REPORT_FORMAT_KEY]: '' }))).toBe('markdown');
	});

	it('falls back to Markdown where storage is blocked', () => {
		expect(readReportFormat(blocked)).toBe('markdown');
		expect(storeReportFormat('jira', blocked)).toBe(false);
	});
});

describe('copy (design 13.3 P2-05, 13.7)', () => {
	it('names the format in the toast and the case in the title', () => {
		expect(copiedText('markdown')).toBe('Copied as Markdown');
		expect(copiedText('jira')).toBe('Copied as Jira wiki markup');
		expect(reportTitle('TC-12')).toBe('Bug report: TC-12');
	});
});
