import { shorten, SUMMARY_MAX, type BugReport } from './report.ts';
import { escapeInlineMarkdown, firstLine, oneLine } from './summary.ts';
import {
	DEFAULT_PRIORITY,
	FINDING_TYPE_LABELS,
	FINDING_TYPES,
	type Finding,
	type FindingType,
	type Session
} from './types.ts';

// Rules of an exploratory session (FR-130 to FR-132): the clock, its state changes, the text
// shown for times and findings, the session copied as Markdown, and the bug report of a finding.

const MINUTE = 60_000;

type Clock = Pick<Session, 'startedAt' | 'pausedAt' | 'pausedMs' | 'endedAt'>;

/**
 * Session time in ms at `now` (FR-130 AC-2, AC-5, plan finding F-15). It is computed from the
 * stored timestamps, so a reload, a closed tab, or a sleeping laptop cannot lose time (EC-036);
 * time asleep counts unless the session was paused. Never negative, also with a clock set back.
 */
export function elapsedMs(session: Clock, now: number): number {
	const end = session.endedAt ?? session.pausedAt ?? now;
	return Math.max(0, end - session.startedAt - session.pausedMs);
}

/** Whole minutes, as the clock shows them (design 13.9 decision 2). */
export const wholeMinutes = (ms: number) => Math.floor(ms / MINUTE);

/** The timebox is reached once the elapsed time equals it (FR-130 AC-4). */
export function timeboxReached(
	session: Clock & Pick<Session, 'timeboxMinutes'>,
	now: number
): boolean {
	return elapsedMs(session, now) >= session.timeboxMinutes * MINUTE;
}

/**
 * The page's next update: when the shown minute changes. Null while paused or ended, when the
 * clock stands still. The page only waits for it while visible (FR-130 AC-3, NFR-003).
 */
export function msUntilNextMinute(session: Session, now: number): number | null {
	if (session.status !== 'running') return null;
	return MINUTE - (elapsedMs(session, now) % MINUTE);
}

/** "23 min elapsed · 37 min left", or "65 min elapsed · 5 min over" past the timebox. */
export function clockText(session: Clock & Pick<Session, 'timeboxMinutes'>, now: number): string {
	const elapsed = wholeMinutes(elapsedMs(session, now));
	const left = session.timeboxMinutes - elapsed;
	return `${elapsed} min elapsed · ${left >= 0 ? `${left} min left` : `${-left} min over`}`;
}

/** A duration in whole minutes: "45 min", "1 h", "1 h 5 min". */
export function durationText(ms: number): string {
	const minutes = wholeMinutes(Math.max(0, ms));
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest} min`;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "at 12 min": when a finding was added, in session time (FR-131 AC-1). */
export const findingTime = (finding: Pick<Finding, 'at'>) => `at ${wholeMinutes(finding.at)} min`;

/** The clock fields after Pause; unchanged unless running. */
export function pauseSession(session: Session, now: number): Session {
	if (session.status !== 'running') return session;
	return { ...session, status: 'paused', pausedAt: now, updatedAt: now };
}

/** The clock fields after Resume: the pause is added to the paused time (FR-130 AC-5). */
export function resumeSession(session: Session, now: number): Session {
	if (session.status !== 'paused' || session.pausedAt === null) return session;
	return {
		...session,
		status: 'running',
		pausedMs: session.pausedMs + Math.max(0, now - session.pausedAt),
		pausedAt: null,
		updatedAt: now
	};
}

/**
 * The session after End (FR-130 AC-6): a pause in progress is counted as paused, and the total
 * time stays fixed. An ended session cannot run again, so End on it changes nothing.
 */
export function endSession(session: Session, now: number): Session {
	if (session.status === 'ended') return session;
	const resumed = resumeSession(session, now);
	return { ...resumed, status: 'ended', endedAt: now, updatedAt: now };
}

export type FindingCounts = Record<FindingType, number>;

export function countFindings(findings: readonly Pick<Finding, 'type'>[]): FindingCounts {
	const counts: FindingCounts = { bug: 0, question: 0, idea: 0, note: 0 };
	for (const { type } of findings) counts[type] += 1;
	return counts;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "3 bugs · 2 questions" with zero counts left out; "No findings" when there are none. */
export function findingCountsText(counts: FindingCounts): string {
	const parts = FINDING_TYPES.filter((type) => counts[type] > 0).map((type) =>
		plural(counts[type], FINDING_TYPE_LABELS[type].toLowerCase())
	);
	return parts.length > 0 ? parts.join(' · ') : 'No findings';
}

/** Findings in time order, then in the order they were stored (FR-131 AC-2). */
export function sortFindings<T extends Pick<Finding, 'at' | 'createdAt'>>(
	findings: readonly T[]
): T[] {
	return [...findings].sort((a, b) => a.at - b.at || a.createdAt - b.createdAt);
}

const STATUS_WORDS: Record<Session['status'], string> = {
	running: 'running',
	paused: 'paused',
	ended: 'ended'
};

/**
 * The session as Markdown (FR-132 AC-1): charter, release and environment when set, timebox,
 * total time, then the findings grouped by type in time order with their session time. A
 * finding's text is joined onto one line. Ends with one newline.
 */
export function sessionMarkdown(
	session: Session,
	findings: readonly Finding[],
	now: number
): string {
	const md = (text: string) => escapeInlineMarkdown(oneLine(text));
	const lines = [`## Session: ${md(session.charter)}`, ''];
	if (session.release.trim() !== '') lines.push(`- Release: ${md(session.release)}`);
	if (session.environment.trim() !== '') lines.push(`- Environment: ${md(session.environment)}`);
	lines.push(
		`- Timebox: ${durationText(session.timeboxMinutes * MINUTE)}`,
		`- Time: ${durationText(elapsedMs(session, now))} (${STATUS_WORDS[session.status]})`
	);

	const sorted = sortFindings(findings.filter((finding) => finding.sessionId === session.id));
	if (sorted.length === 0) lines.push('', 'No findings.');
	for (const type of FINDING_TYPES) {
		const ofType = sorted.filter((finding) => finding.type === type);
		if (ofType.length === 0) continue;
		lines.push('', `### ${FINDING_TYPE_LABELS[type]}s (${ofType.length})`);
		for (const finding of ofType) lines.push(`- ${findingTime(finding)}: ${md(finding.text)}`);
	}
	return `${lines.join('\n')}\n`;
}

/**
 * The bug report of a Bug finding (FR-131 AC-3, plan finding F-17). The finding's text is the
 * actual result and its first line the summary; the environment is the session's; steps,
 * expected result, preconditions, and labels start empty for the tester to fill in. Priority
 * starts at Medium, as a new case does. Notes name the session and the finding's time.
 */
export function buildFindingReport(session: Session, finding: Finding): BugReport {
	const release = session.release.trim();
	return {
		summary: shorten(firstLine(finding.text), SUMMARY_MAX),
		priority: DEFAULT_PRIORITY,
		labels: '',
		environment: session.environment.trim(),
		preconditions: '',
		steps: '',
		expected: '',
		actual: finding.text.trim(),
		notes: `Session: ${oneLine(session.charter)}${release ? ` (${release})` : ''}, ${findingTime(finding)}.`
	};
}
