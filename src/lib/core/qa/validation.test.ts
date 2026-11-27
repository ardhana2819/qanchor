import { describe, expect, it } from 'vitest';
import {
	CASES_PER_RUN_MAX,
	caseErrors,
	findingErrors,
	ISSUE_MAX,
	RELEASE_MAX,
	resultErrors,
	runErrors,
	sessionErrors,
	STEPS_MAX,
	TEXT_MAX,
	TIMEBOX_MAX,
	TIMEBOX_MIN,
	TITLE_MAX,
	type CaseDraft,
	type ResultDraft,
	type SessionDraft
} from './validation.ts';

const valid: CaseDraft = {
	title: 'Deposit USDT on Tron',
	preconditions: '',
	steps: [{ action: 'Open Deposit', expected: '' }],
	expected: 'The address is shown',
	tags: ['deposit']
};

const fields = (errors: { field: string }[]) => errors.map((e) => e.field);

describe('caseErrors (FR-100 AC-2, AC-3)', () => {
	it('accepts a valid case', () => {
		expect(caseErrors(valid)).toEqual([]);
	});

	it('accepts a case with no steps and a case-level expected result', () => {
		expect(caseErrors({ ...valid, steps: [] })).toEqual([]);
	});

	it('accepts an expected result on a step only', () => {
		expect(
			caseErrors({ ...valid, expected: '', steps: [{ action: 'Open', expected: 'Opens' }] })
		).toEqual([]);
	});

	it.each(['', '   ', '\n'])('requires a title (%j)', (title) => {
		expect(caseErrors({ ...valid, title })).toEqual([
			{ field: 'title', problem: { kind: 'required' } }
		]);
	});

	it('requires an expected result somewhere', () => {
		expect(
			caseErrors({ ...valid, expected: ' ', steps: [{ action: 'Open', expected: '  ' }] })
		).toEqual([{ field: 'expected', problem: { kind: 'no-expected' } }]);
	});

	it('requires an action on every step', () => {
		const steps = [
			{ action: 'Open', expected: '' },
			{ action: ' ', expected: 'x' }
		];
		expect(caseErrors({ ...valid, steps })).toEqual([
			{ field: 'steps.1.action', problem: { kind: 'required' } }
		]);
	});

	it.each([
		['title', TITLE_MAX],
		['preconditions', TEXT_MAX],
		['expected', TEXT_MAX]
	] as const)('%s allows %i characters and refuses one more', (field, max) => {
		expect(caseErrors({ ...valid, [field]: 'a'.repeat(max) })).toEqual([]);
		expect(caseErrors({ ...valid, [field]: 'a'.repeat(max + 1) })).toEqual([
			{ field, problem: { kind: 'too-long', max } }
		]);
	});

	it('limits step action and step expected to 5,000 characters', () => {
		const at = 'a'.repeat(TEXT_MAX);
		const over = 'a'.repeat(TEXT_MAX + 1);
		expect(caseErrors({ ...valid, steps: [{ action: at, expected: at }] })).toEqual([]);
		expect(fields(caseErrors({ ...valid, steps: [{ action: over, expected: over }] }))).toEqual([
			'steps.0.action',
			'steps.0.expected'
		]);
	});

	it('allows 50 steps and refuses 51', () => {
		const step = { action: 'a', expected: '' };
		expect(caseErrors({ ...valid, steps: Array(STEPS_MAX).fill(step) })).toEqual([]);
		expect(caseErrors({ ...valid, steps: Array(STEPS_MAX + 1).fill(step) })).toEqual([
			{ field: 'steps', problem: { kind: 'too-many', max: STEPS_MAX } }
		]);
	});

	it('allows 10 tags and refuses 11', () => {
		const tags = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
		expect(caseErrors({ ...valid, tags: tags(10) })).toEqual([]);
		expect(caseErrors({ ...valid, tags: tags(11) })).toEqual([
			{ field: 'tags', problem: { kind: 'too-many', max: 10 } }
		]);
	});

	it('names the first invalid tag', () => {
		expect(caseErrors({ ...valid, tags: ['ok', 'a b', 'c/d'] })).toEqual([
			{ field: 'tags', problem: { kind: 'invalid-tag', tag: 'a b' } }
		]);
	});

	it('lists every problem in form order, so focus goes to the first', () => {
		const draft: CaseDraft = {
			title: '',
			preconditions: 'a'.repeat(TEXT_MAX + 1),
			steps: [{ action: '', expected: '' }],
			expected: '',
			tags: ['a b']
		};
		expect(fields(caseErrors(draft))).toEqual([
			'title',
			'preconditions',
			'steps.0.action',
			'expected',
			'tags'
		]);
	});
});

describe('runErrors (FR-110 AC-1)', () => {
	const run = { name: 'Run 2026-11-20', release: '', environment: '', caseCount: 1 };

	it('accepts a run with one case and no release or environment', () => {
		expect(runErrors(run)).toEqual([]);
	});

	it('requires a name of at most 200 characters', () => {
		expect(fields(runErrors({ ...run, name: ' ' }))).toEqual(['name']);
		expect(runErrors({ ...run, name: 'a'.repeat(TITLE_MAX) })).toEqual([]);
		expect(fields(runErrors({ ...run, name: 'a'.repeat(TITLE_MAX + 1) }))).toEqual(['name']);
	});

	it('limits release and environment', () => {
		expect(runErrors({ ...run, release: 'a'.repeat(RELEASE_MAX) })).toEqual([]);
		expect(fields(runErrors({ ...run, release: 'a'.repeat(RELEASE_MAX + 1) }))).toEqual([
			'release'
		]);
		expect(runErrors({ ...run, environment: 'a'.repeat(TEXT_MAX) })).toEqual([]);
		expect(fields(runErrors({ ...run, environment: 'a'.repeat(TEXT_MAX + 1) }))).toEqual([
			'environment'
		]);
	});

	it.each([
		[0, false],
		[1, true],
		[CASES_PER_RUN_MAX, true],
		[CASES_PER_RUN_MAX + 1, false]
	])('%i cases: allowed %s', (caseCount, allowed) => {
		const errors = runErrors({ ...run, caseCount });
		expect(errors).toEqual(
			allowed ? [] : [{ field: 'cases', problem: { kind: 'out-of-range', min: 1, max: 500 } }]
		);
	});
});

describe('resultErrors (FR-111 AC-3, AC-4, AC-6)', () => {
	const blank: ResultDraft = {
		status: 'pass',
		failedStep: null,
		actual: '',
		reason: '',
		notes: '',
		linkedIssue: ''
	};

	it('accepts Pass with nothing filled in', () => {
		expect(resultErrors(blank, 3)).toEqual([]);
	});

	it('Fail requires the actual result', () => {
		expect(resultErrors({ ...blank, status: 'fail', actual: '  ' }, 3)).toEqual([
			{ field: 'actual', problem: { kind: 'required' } }
		]);
		expect(resultErrors({ ...blank, status: 'fail', actual: 'Shows 0 USDT' }, 3)).toEqual([]);
	});

	it.each([
		[null, true],
		[0, true],
		[1, true],
		[3, true],
		[4, false],
		[-1, false],
		[1.5, false]
	])('Fail with failed step %j of 3: allowed %s', (failedStep, allowed) => {
		const errors = resultErrors({ ...blank, status: 'fail', actual: 'x', failedStep }, 3);
		expect(fields(errors)).toEqual(allowed ? [] : ['failedStep']);
	});

	it('a case without steps only allows "not step-specific"', () => {
		const fail = { ...blank, status: 'fail' as const, actual: 'x' };
		expect(resultErrors({ ...fail, failedStep: 0 }, 0)).toEqual([]);
		expect(fields(resultErrors({ ...fail, failedStep: 1 }, 0))).toEqual(['failedStep']);
	});

	it('Blocked requires the reason', () => {
		expect(fields(resultErrors({ ...blank, status: 'blocked' }, 3))).toEqual(['reason']);
		expect(resultErrors({ ...blank, status: 'blocked', reason: 'No testnet USDT' }, 3)).toEqual([]);
	});

	it("keeps another status's fields without requiring them (AC-6)", () => {
		const kept = { ...blank, failedStep: 9, actual: 'old', reason: '' };
		expect(resultErrors({ ...kept, status: 'pass' }, 3)).toEqual([]);
		expect(resultErrors({ ...kept, status: 'blocked', reason: 'r' }, 3)).toEqual([]);
	});

	it('limits every text field', () => {
		const over = 'a'.repeat(TEXT_MAX + 1);
		const draft = { ...blank, actual: over, reason: over, notes: over };
		expect(fields(resultErrors(draft, 0))).toEqual(['actual', 'reason', 'notes']);
		expect(resultErrors({ ...blank, notes: 'a'.repeat(TEXT_MAX) }, 0)).toEqual([]);
	});

	it('limits the linked issue', () => {
		expect(resultErrors({ ...blank, linkedIssue: 'a'.repeat(ISSUE_MAX) }, 0)).toEqual([]);
		expect(fields(resultErrors({ ...blank, linkedIssue: 'a'.repeat(ISSUE_MAX + 1) }, 0))).toEqual([
			'linkedIssue'
		]);
	});
});

describe('sessionErrors (FR-130 AC-1, PRD 10.5)', () => {
	const session: SessionDraft = {
		charter: 'Explore withdraw limits',
		timeboxMinutes: 60,
		release: '',
		environment: ''
	};
	const fields = (draft: Partial<SessionDraft>) =>
		sessionErrors({ ...session, ...draft }).map((e) => [e.field, e.problem.kind]);

	it('accepts a charter and a timebox', () => {
		expect(sessionErrors(session)).toEqual([]);
	});

	it('needs a charter of at most 200 characters', () => {
		expect(fields({ charter: '  ' })).toEqual([['charter', 'required']]);
		expect(fields({ charter: 'x'.repeat(TITLE_MAX) })).toEqual([]);
		expect(fields({ charter: 'x'.repeat(TITLE_MAX + 1) })).toEqual([['charter', 'too-long']]);
	});

	it('takes a timebox of 5 to 480 whole minutes', () => {
		expect(TIMEBOX_MIN).toBe(5);
		expect(TIMEBOX_MAX).toBe(480);
		expect(fields({ timeboxMinutes: TIMEBOX_MIN })).toEqual([]);
		expect(fields({ timeboxMinutes: TIMEBOX_MAX })).toEqual([]);
		for (const minutes of [TIMEBOX_MIN - 1, TIMEBOX_MAX + 1, 30.5, Number.NaN]) {
			expect(fields({ timeboxMinutes: minutes })).toEqual([['timebox', 'out-of-range']]);
		}
	});

	it('limits release and environment as a run does, in form order', () => {
		expect(
			fields({
				charter: '',
				timeboxMinutes: 0,
				release: 'x'.repeat(RELEASE_MAX + 1),
				environment: 'x'.repeat(TEXT_MAX + 1)
			})
		).toEqual([
			['charter', 'required'],
			['timebox', 'out-of-range'],
			['release', 'too-long'],
			['environment', 'too-long']
		]);
		expect(fields({ release: 'x'.repeat(RELEASE_MAX), environment: 'x'.repeat(TEXT_MAX) })).toEqual(
			[]
		);
	});
});

describe('findingErrors (FR-131 AC-1, PRD 10.5)', () => {
	it('needs text of at most 5,000 characters', () => {
		expect(findingErrors('Fee shown as 0')).toEqual([]);
		expect(findingErrors(' \n ')).toEqual([{ field: 'text', problem: { kind: 'required' } }]);
		expect(findingErrors('x'.repeat(TEXT_MAX))).toEqual([]);
		expect(findingErrors('x'.repeat(TEXT_MAX + 1))).toEqual([
			{ field: 'text', problem: { kind: 'too-long', max: TEXT_MAX } }
		]);
	});
});
