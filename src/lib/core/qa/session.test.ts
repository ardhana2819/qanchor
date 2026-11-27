import { describe, expect, it } from 'vitest';
import {
	buildFindingReport,
	clockText,
	countFindings,
	durationText,
	elapsedMs,
	endSession,
	findingCountsText,
	findingTime,
	msUntilNextMinute,
	pauseSession,
	resumeSession,
	sessionMarkdown,
	sortFindings,
	timeboxReached
} from './session.ts';
import type { Finding, Session } from './types.ts';

const MIN = 60_000;
const T0 = 1_800_000_000_000;

const session = (part: Partial<Session> = {}): Session => ({
	id: 's1',
	charter: 'Explore withdraw limits',
	release: 'v2.3.0',
	environment: 'Android 14 · Sepolia',
	timeboxMinutes: 60,
	status: 'running',
	startedAt: T0,
	pausedAt: null,
	pausedMs: 0,
	endedAt: null,
	createdAt: T0,
	updatedAt: T0,
	...part
});

const finding = (id: string, part: Partial<Finding>): Finding => ({
	id,
	sessionId: 's1',
	type: 'note',
	text: '',
	at: 0,
	createdAt: T0,
	updatedAt: T0,
	...part
});

describe('session clock (FR-130 AC-2, AC-5, plan finding F-15)', () => {
	it('counts from the start time, so a reload or a sleep keeps it (EC-036)', () => {
		expect(elapsedMs(session(), T0)).toBe(0);
		expect(elapsedMs(session(), T0 + 23 * MIN + 59_999)).toBe(23 * MIN + 59_999);
		// Two hours asleep count as session time.
		expect(elapsedMs(session(), T0 + 2 * 60 * MIN)).toBe(120 * MIN);
	});

	it('is never negative when the clock is set back', () => {
		expect(elapsedMs(session(), T0 - MIN)).toBe(0);
	});

	it('does not count paused time', () => {
		const paused = pauseSession(session(), T0 + 10 * MIN);
		expect(paused.status).toBe('paused');
		expect(elapsedMs(paused, T0 + 70 * MIN)).toBe(10 * MIN);

		const resumed = resumeSession(paused, T0 + 70 * MIN);
		expect(resumed).toMatchObject({ status: 'running', pausedAt: null, pausedMs: 60 * MIN });
		expect(elapsedMs(resumed, T0 + 75 * MIN)).toBe(15 * MIN);
	});

	it('adds up several pauses', () => {
		let s = session();
		s = resumeSession(pauseSession(s, T0 + 5 * MIN), T0 + 15 * MIN);
		s = resumeSession(pauseSession(s, T0 + 20 * MIN), T0 + 50 * MIN);
		expect(s.pausedMs).toBe(40 * MIN);
		expect(elapsedMs(s, T0 + 60 * MIN)).toBe(20 * MIN);
	});

	it('keeps the total fixed after End, also when ended while paused (AC-6)', () => {
		const ended = endSession(session(), T0 + 45 * MIN);
		expect(ended).toMatchObject({ status: 'ended', endedAt: T0 + 45 * MIN });
		expect(elapsedMs(ended, T0 + 999 * MIN)).toBe(45 * MIN);

		const endedPaused = endSession(pauseSession(session(), T0 + 30 * MIN), T0 + 50 * MIN);
		expect(endedPaused).toMatchObject({ status: 'ended', pausedAt: null, pausedMs: 20 * MIN });
		expect(elapsedMs(endedPaused, T0 + 999 * MIN)).toBe(30 * MIN);
	});

	it('changes nothing for a state change that does not apply', () => {
		const ended = endSession(session(), T0 + MIN);
		expect(endSession(ended, T0 + 9 * MIN)).toBe(ended);
		expect(pauseSession(ended, T0 + 9 * MIN)).toBe(ended);
		expect(resumeSession(ended, T0 + 9 * MIN)).toBe(ended);
		const running = session();
		expect(resumeSession(running, T0 + MIN)).toBe(running);
	});

	it('reaches the timebox at exactly the timebox (AC-4)', () => {
		expect(timeboxReached(session(), T0 + 60 * MIN - 1)).toBe(false);
		expect(timeboxReached(session(), T0 + 60 * MIN)).toBe(true);
	});

	it('waits for the next shown minute only while running (AC-3, NFR-003)', () => {
		expect(msUntilNextMinute(session(), T0)).toBe(MIN);
		expect(msUntilNextMinute(session(), T0 + 23 * MIN + 45_000)).toBe(15_000);
		expect(msUntilNextMinute(pauseSession(session(), T0), T0 + MIN)).toBeNull();
		expect(msUntilNextMinute(endSession(session(), T0), T0 + MIN)).toBeNull();
	});
});

describe('time text (design 13.3 P2-06, 13.9 decision 2)', () => {
	it('shows whole minutes elapsed and left, then over', () => {
		expect(clockText(session(), T0)).toBe('0 min elapsed · 60 min left');
		expect(clockText(session(), T0 + 23 * MIN + 59_999)).toBe('23 min elapsed · 37 min left');
		expect(clockText(session(), T0 + 60 * MIN)).toBe('60 min elapsed · 0 min left');
		expect(clockText(session(), T0 + 65 * MIN)).toBe('65 min elapsed · 5 min over');
	});

	it('writes durations in hours and minutes', () => {
		expect(durationText(0)).toBe('0 min');
		expect(durationText(59 * MIN + 59_999)).toBe('59 min');
		expect(durationText(60 * MIN)).toBe('1 h');
		expect(durationText(65 * MIN)).toBe('1 h 5 min');
		expect(durationText(-MIN)).toBe('0 min');
	});

	it('gives a finding its session time (FR-131 AC-1)', () => {
		expect(findingTime({ at: 12 * MIN + 30_000 })).toBe('at 12 min');
	});
});

describe('findings (FR-131 AC-2)', () => {
	it('counts by type and leaves out zero counts', () => {
		const counts = countFindings([
			{ type: 'bug' },
			{ type: 'bug' },
			{ type: 'bug' },
			{ type: 'question' },
			{ type: 'question' },
			{ type: 'idea' }
		]);
		expect(counts).toEqual({ bug: 3, question: 2, idea: 1, note: 0 });
		expect(findingCountsText(counts)).toBe('3 bugs · 2 questions · 1 idea');
		expect(findingCountsText(countFindings([]))).toBe('No findings');
	});

	it('sorts in session time, then in stored order', () => {
		const list = [
			finding('c', { at: 5 * MIN, createdAt: T0 + 2 }),
			finding('a', { at: MIN }),
			finding('b', { at: 5 * MIN, createdAt: T0 + 1 })
		];
		expect(sortFindings(list).map((f) => f.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('sessionMarkdown (FR-132 AC-1)', () => {
	it('lists the session and its findings grouped by type in time order', () => {
		const ended = endSession(session({ charter: 'Explore *withdraw* | limits' }), T0 + 65 * MIN);
		const findings = [
			finding('f3', { type: 'bug', text: 'Fee shown as 0\nafter switching network', at: 30 * MIN }),
			finding('f1', { type: 'note', text: 'Memo field is optional', at: 2 * MIN }),
			finding('f2', { type: 'bug', text: 'Max button ignores [fee]', at: 12 * MIN }),
			finding('f4', { type: 'question', text: 'Is TRC-20 limit 10k?', at: 40 * MIN }),
			finding('x', { sessionId: 'other', type: 'idea', text: 'Not this session' })
		];

		expect(sessionMarkdown(ended, findings, T0 + 999 * MIN)).toBe(
			[
				'## Session: Explore \\*withdraw\\* \\| limits',
				'',
				'- Release: v2.3.0',
				'- Environment: Android 14 · Sepolia',
				'- Timebox: 1 h',
				'- Time: 1 h 5 min (ended)',
				'',
				'### Bugs (2)',
				'- at 12 min: Max button ignores \\[fee\\]',
				'- at 30 min: Fee shown as 0 after switching network',
				'',
				'### Questions (1)',
				'- at 40 min: Is TRC-20 limit 10k?',
				'',
				'### Notes (1)',
				'- at 2 min: Memo field is optional',
				''
			].join('\n')
		);
	});

	it('says so when there are no findings and leaves out an empty release', () => {
		const text = sessionMarkdown(session({ release: ' ', environment: '' }), [], T0 + 3 * MIN);
		expect(text).toBe(
			'## Session: Explore withdraw limits\n\n- Timebox: 1 h\n- Time: 3 min (running)\n\nNo findings.\n'
		);
	});
});

describe('buildFindingReport (FR-131 AC-3, plan finding F-17)', () => {
	it('uses the finding as the actual result and leaves the steps empty', () => {
		const bug = finding('f2', {
			type: 'bug',
			text: '  Max button ignores the fee\nSeen on USDT_TRC20  ',
			at: 12 * MIN
		});
		expect(buildFindingReport(session(), bug)).toEqual({
			summary: 'Max button ignores the fee',
			priority: 'medium',
			labels: '',
			environment: 'Android 14 · Sepolia',
			preconditions: '',
			steps: '',
			expected: '',
			actual: 'Max button ignores the fee\nSeen on USDT_TRC20',
			notes: 'Session: Explore withdraw limits (v2.3.0), at 12 min.'
		});
	});

	it('shortens a long first line to the summary limit and leaves out an empty release', () => {
		const report = buildFindingReport(
			session({ release: '' }),
			finding('f', { type: 'bug', text: 'x'.repeat(300) })
		);
		expect(report.summary).toHaveLength(200);
		expect(report.summary.endsWith('…')).toBe(true);
		expect(report.notes).toBe('Session: Explore withdraw limits, at 0 min.');
	});
});
