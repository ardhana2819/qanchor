import { describe, expect, it } from 'vitest';
import { escapeInlineMarkdown, runSummaryMarkdown } from './summary.ts';
import type { CaseSnapshot, Run, TestResult } from './types.ts';

const snapshot = (number: number, title: string): CaseSnapshot => ({
	id: `id-${number}`,
	number,
	title,
	preconditions: '',
	steps: [],
	expected: 'x',
	tags: [],
	priority: 'medium'
});

const run: Run = {
	id: 'r1',
	name: 'Withdraw USDT multi-network',
	release: 'v2.3.0',
	environment: 'Android 14\nbuild 2.3.0-rc2 · Sepolia',
	status: 'in-progress',
	cases: [
		snapshot(1, 'Withdraw on Tron'),
		snapshot(2, 'Withdraw *all* to [ERC-20] address'),
		snapshot(3, 'Fee shown'),
		snapshot(4, 'Memo required'),
		snapshot(5, 'History')
	],
	createdAt: 0,
	updatedAt: 0,
	completedAt: null
};

const result = (caseNumber: number, part: Partial<TestResult>): TestResult => ({
	runId: 'r1',
	caseNumber,
	status: 'pass',
	failedStep: null,
	actual: '',
	reason: '',
	notes: '',
	linkedIssue: '',
	updatedAt: 0,
	...part
});

describe('runSummaryMarkdown (FR-113 AC-5)', () => {
	it('matches the golden summary', () => {
		const results = [
			result(1, { status: 'pass' }),
			result(2, {
				status: 'fail',
				actual: 'Balance shows `0` & no error\nSecond line is left out',
				// Kept from an earlier Blocked result (FR-111 AC-6); a failed case shows its actual.
				reason: 'old reason',
				linkedIssue: 'PAY-123'
			}),
			result(4, {
				status: 'blocked',
				reason: 'No testnet USDT_TRC20 in the faucet',
				linkedIssue: 'https://example.atlassian.net/browse/PAY-9?a=1&b=<2>'
			}),
			result(3, { status: 'pass', runId: 'other' }),
			result(9, { status: 'fail', actual: 'not in this run' })
		];
		expect(runSummaryMarkdown(run, results)).toBe(
			[
				'## Run: Withdraw USDT multi-network',
				'',
				'- Release: v2.3.0',
				'- Environment: Android 14 build 2.3.0-rc2 · Sepolia',
				'',
				'1 passed, 1 failed, 1 blocked, 2 untested (5 cases)',
				'',
				'### Failed and blocked',
				'- TC-2 Withdraw \\*all\\* to \\[ERC-20\\] address: Failed. Balance shows \\`0\\` \\& no error (PAY-123)',
				'- TC-4 Memo required: Blocked. No testnet USDT\\_TRC20 in the faucet (<https://example.atlassian.net/browse/PAY-9?a=1&b=%3C2%3E>)',
				''
			].join('\n')
		);
	});

	it('leaves out an empty release, environment, and the failed list', () => {
		const bare = {
			...run,
			name: 'Smoke',
			release: ' ',
			environment: '',
			cases: [snapshot(1, 'Only')]
		};
		expect(runSummaryMarkdown(bare, [result(1, { status: 'pass' })])).toBe(
			'## Run: Smoke\n\n1 passed, 0 failed, 0 blocked, 0 untested (1 case)\n'
		);
	});

	it('handles a failed result without actual text and an issue that is blank', () => {
		const one = { ...run, cases: [snapshot(7, 'Odd')] };
		expect(runSummaryMarkdown(one, [result(7, { status: 'fail', linkedIssue: '  ' })])).toContain(
			'\n- TC-7 Odd: Failed.\n'
		);
	});
});

describe('escapeInlineMarkdown', () => {
	it('escapes inline markup and leaves other text alone', () => {
		expect(escapeInlineMarkdown('a*b_c`d[e]f<g>h|i~j&k\\l')).toBe(
			'a\\*b\\_c\\`d\\[e\\]f\\<g\\>h\\|i\\~j\\&k\\\\l'
		);
		expect(escapeInlineMarkdown('v2.3.0 # - + 1. (ok) {x}')).toBe('v2.3.0 # - + 1. (ok) {x}');
	});
});
