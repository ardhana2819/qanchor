import { formatKey } from './keys.ts';
import { escapeInlineMarkdown, firstLine, oneLine } from './summary.ts';
import {
	PRIORITY_LABELS,
	type CaseSnapshot,
	type Priority,
	type Run,
	type TestResult
} from './types.ts';
import { TITLE_MAX } from './validation.ts';

// The bug report built from a failed result (FR-120) and rendered as Markdown or Jira wiki
// markup (FR-121), laid out as in the approved prototype (design 13.3 P2-05). The report is
// never stored: the dialog edits a BugReport and renders it on every change (FR-120 AC-5).

export const REPORT_FORMATS = ['markdown', 'jira'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** PRD 10.5 names no summary limit; the title limit is used, as in the prototype (T-058). */
export const SUMMARY_MAX = TITLE_MAX;

/** The dialog's fields, each editable text except priority (design 13.3 P2-05). */
export interface BugReport {
	summary: string;
	priority: Priority;
	/** Comma-separated, as the Labels field shows them. */
	labels: string;
	environment: string;
	preconditions: string;
	/** One textarea: a line starting `<n>.` starts a step, other lines continue it. */
	steps: string;
	expected: string;
	actual: string;
	notes: string;
}

/** Cuts text to `max` code units, ending with "…" when cut, without splitting a surrogate pair. */
export function shorten(text: string, max: number): string {
	if (text.length <= max) return text;
	let cut = text.slice(0, max - 1);
	if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
	return `${cut.trimEnd()}…`;
}

const lines = (text: string) => text.split(/\r?\n/).map((line) => line.trim());

/** Step actions as the Steps field shows them: `1. Open`, continuation lines indented under it. */
export function stepsText(actions: readonly string[]): string {
	return actions
		.map((action, i) => {
			const [first = '', ...rest] = lines(action.trim()).filter((line) => line !== '');
			const prefix = `${i + 1}.`;
			const indent = ' '.repeat(prefix.length + 1);
			return [first ? `${prefix} ${first}` : prefix, ...rest.map((line) => indent + line)].join(
				'\n'
			);
		})
		.join('\n');
}

/** A step starts on a line with no indent that begins with a number and `.` or `)`. */
const STEP_START = /^\d+[.)](?:\s+|$)/;

/** The Steps field read back: each step's lines, blank lines and empty steps dropped. */
export function parseSteps(text: string): string[][] {
	const steps: string[][] = [];
	for (const raw of text.split(/\r?\n/)) {
		const start = STEP_START.test(raw);
		const line = (start ? raw.replace(STEP_START, '') : raw).trim();
		if (start) steps.push([]);
		if (line === '') continue;
		if (steps.length === 0) steps.push([]);
		steps[steps.length - 1].push(line);
	}
	return steps.filter((step) => step.length > 0);
}

/**
 * The report pre-filled from a result (FR-120 AC-1 to AC-4, AC-6). A failed step n gives
 * steps 1 to n and step n's expected result, or the case's when step n has none; no step, "Not
 * step-specific" (0), or a step the case no longer has gives every step and the case's.
 */
export function buildBugReport(run: Run, item: CaseSnapshot, result: TestResult): BugReport {
	const n = result.failedStep;
	const failed = n !== null && n >= 1 && n <= item.steps.length ? n : null;
	const steps = failed === null ? item.steps : item.steps.slice(0, failed);
	const stepExpected = failed === null ? '' : item.steps[failed - 1].expected.trim();
	const actualLine = firstLine(result.actual);
	const release = run.release.trim();
	const reference = `Run: ${oneLine(run.name)}${release ? ` (${release})` : ''}, case ${formatKey(item.number)}.`;

	return {
		summary: shorten(
			actualLine ? `${item.title.trim()}: ${actualLine}` : item.title.trim(),
			SUMMARY_MAX
		),
		priority: item.priority,
		labels: item.tags.join(', '),
		environment: run.environment.trim(),
		preconditions: item.preconditions.trim(),
		steps: stepsText(steps.map((step) => step.action)),
		expected: stepExpected || item.expected.trim(),
		actual: result.actual.trim(),
		notes: [result.notes.trim(), reference].filter(Boolean).join('\n')
	};
}

/**
 * Markdown escape for a line of user text that starts a line: the inline escapes, plus the
 * characters that only format at the start of a line (headings, lists, setext underlines; a
 * quote's `>` is an inline escape already). Lines are trimmed, so indentation never makes a
 * code block.
 */
export function escapeMarkdownLine(line: string): string {
	return escapeInlineMarkdown(line)
		.replace(/^[#+=-]/, '\\$&')
		.replace(/^(\d+)([.)])/, '$1\\$2');
}

/**
 * Jira wiki markup escape (FR-121 AC-2). A backslash is written as an entity, because `\\` is
 * Jira's line break and a backslash before a markup character escapes it. Always escaped: the
 * characters that open links, macros, tables, images, and text effects. `-` only where it
 * could format (not inside `2026-11-24` or `multi-network`), `?` only in pairs (`??cite??`), and
 * at the start of a line `#` (numbered list) and the dot of `h1.` to `h6.` and `bq.`.
 * [VERIFY] checked by the owner pasting the golden output into Jira (docs/plan.md).
 */
export function escapeJira(text: string, lineStart = false): string {
	const escaped = text
		.replace(/\\/g, '&#92;')
		.replace(/[{}[\]|*_^~+!]/g, '\\$&')
		.replace(/(?<![\p{L}\p{N}])-|-(?![\p{L}\p{N}])/gu, '\\-')
		.replace(/\?(?=\?)|(?<=\?)\?/g, '\\?');
	return lineStart ? escaped.replace(/^#/, '\\#').replace(/^(h[1-6]|bq)\./, '$1\\.') : escaped;
}

/** Lines of a field: trimmed, blank lines at the ends dropped, runs of blank lines made one. */
function blockLines(text: string): string[] {
	if (text.trim() === '') return [];
	return lines(text.trim()).filter((line, i, all) => line !== '' || all[i - 1] !== '');
}

interface Syntax {
	bold: (label: string) => string;
	heading: (title: string) => string;
	inline: (text: string) => string;
	/** A field's lines as they appear under its heading. */
	block: (lines: string[]) => string[];
	steps: (steps: string[][]) => string[];
	bullet: (text: string) => string;
}

/** A hard line break (`\` at the end of a line) keeps each typed line on its own line. */
const withBreaks = (texts: string[]) =>
	texts.map((text, i) => (text !== '' && texts[i + 1] ? `${text}\\` : text));

const MARKDOWN: Syntax = {
	bold: (label) => `**${label}:**`,
	heading: (title) => `### ${title}`,
	inline: escapeInlineMarkdown,
	block: (texts) => withBreaks(texts.map((line) => (line === '' ? '' : escapeMarkdownLine(line)))),
	steps: (steps) =>
		steps.flatMap((step, i) => {
			const prefix = `${i + 1}. `;
			const indent = ' '.repeat(prefix.length);
			return withBreaks(step.map(escapeMarkdownLine)).map(
				(text, j) => (j === 0 ? prefix : indent) + text
			);
		}),
	bullet: (text) => `- ${escapeInlineMarkdown(text)}`
};

const JIRA: Syntax = {
	bold: (label) => `*${label}:*`,
	heading: (title) => `h3. ${title}`,
	inline: (text) => escapeJira(text),
	block: (texts) => texts.map((line) => escapeJira(line, true)),
	// A list item ends at a line break, so a step's lines are joined by Jira's `\\` line break.
	steps: (steps) => steps.map((step) => `# ${step.map((line) => escapeJira(line)).join(' \\\\ ')}`),
	bullet: (text) => `* ${escapeJira(text)}`
};

/**
 * The report text to copy (FR-121 AC-2, AC-3, FR-122 AC-1): summary, priority and labels, then
 * a heading per field that has text, then the attachments' file names. Ends with one newline.
 */
export function renderReport(
	report: BugReport,
	attachments: readonly string[],
	format: ReportFormat
): string {
	const syntax = format === 'markdown' ? MARKDOWN : JIRA;
	const labels = oneLine(report.labels);
	const out = [
		`${syntax.bold('Summary')} ${syntax.inline(oneLine(report.summary))}`,
		`${syntax.bold('Priority')} ${PRIORITY_LABELS[report.priority]}` +
			(labels ? ` · ${syntax.bold('Labels')} ${syntax.inline(labels)}` : '')
	];
	const section = (title: string, body: string[]) => {
		if (body.length > 0) out.push('', syntax.heading(title), ...body);
	};
	const field = (title: string, text: string) => {
		const texts = blockLines(text);
		section(title, texts.length > 0 ? syntax.block(texts) : []);
	};

	field('Environment', report.environment);
	field('Preconditions', report.preconditions);
	section('Steps to reproduce', syntax.steps(parseSteps(report.steps)));
	field('Expected result', report.expected);
	field('Actual result', report.actual);
	field('Notes', report.notes);
	section('Attachments', attachments.map(syntax.bullet));
	return `${out.join('\n')}\n`;
}
