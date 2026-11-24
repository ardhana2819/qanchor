import { formatKey } from './keys.ts';
import { countStatuses, countsInWords, issueHref, resultsByCase } from './run.ts';
import type { Run, TestResult } from './types.ts';

// The run summary copied as Markdown (FR-113 AC-5), laid out as in the approved prototype.

/**
 * Escapes characters that change inline Markdown, so user text shows as typed. Each line of the
 * summary starts with fixed text, so characters that only format at the start of a line (`#`,
 * `-`, `1.`) need no escape. A backslash before ASCII punctuation is a CommonMark escape.
 */
export function escapeInlineMarkdown(text: string): string {
	return text.replace(/[\\`*_[\]<>|~&]/g, '\\$&');
}

/** One line of user text: line breaks and the spaces around them become one space. */
export function oneLine(text: string): string {
	return text.trim().replace(/\s*[\r\n]+\s*/g, ' ');
}

/** The first line of user text, trimmed. */
export function firstLine(text: string): string {
	return text.trim().split(/\r?\n/, 1)[0]?.trim() ?? '';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The run as Markdown: name, release and environment when set, counts per status, then each
 * failed and blocked case in key order with the first line of its actual result or reason and
 * its linked issue. Ends with one newline.
 */
export function runSummaryMarkdown(run: Run, results: readonly TestResult[]): string {
	const md = (text: string) => escapeInlineMarkdown(oneLine(text));
	const counts = countStatuses(run.id, run.cases, results);
	const lines = [`## Run: ${md(run.name)}`, ''];

	const meta: string[] = [];
	if (run.release.trim() !== '') meta.push(`- Release: ${md(run.release)}`);
	if (run.environment.trim() !== '') meta.push(`- Environment: ${md(run.environment)}`);
	if (meta.length > 0) lines.push(...meta, '');

	lines.push(`${countsInWords(counts)} (${plural(counts.total, 'case')})`);

	const byCase = resultsByCase(run.id, results);
	const open = run.cases.flatMap((item) => {
		const result = byCase.get(item.number);
		return result && result.status !== 'pass' ? [{ item, result }] : [];
	});
	if (open.length > 0) {
		lines.push('', '### Failed and blocked');
		for (const { item, result } of open) {
			const failed = result.status === 'fail';
			const detail = escapeInlineMarkdown(firstLine(failed ? result.actual : result.reason));
			// A URL becomes an autolink, where escapes would show; its href has `<` and `>` encoded.
			const href = issueHref(result.linkedIssue);
			const issue = href ? `<${href}>` : md(result.linkedIssue);
			lines.push(
				`- ${formatKey(item.number)} ${md(item.title)}: ${failed ? 'Failed' : 'Blocked'}.` +
					(detail ? ` ${detail}` : '') +
					(issue ? ` (${issue})` : '')
			);
		}
	}
	return `${lines.join('\n')}\n`;
}
