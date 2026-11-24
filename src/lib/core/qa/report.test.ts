import { describe, expect, it } from 'vitest';
import {
	buildBugReport,
	escapeJira,
	escapeMarkdownLine,
	parseSteps,
	renderReport,
	shorten,
	stepsText,
	SUMMARY_MAX,
	type BugReport
} from './report.ts';
import type { CaseSnapshot, Run, TestResult } from './types.ts';

const item: CaseSnapshot = {
	id: 'case-12',
	number: 12,
	title: 'Withdraw USDT on Tron',
	preconditions: 'A funded testnet wallet',
	steps: [
		{ action: 'Open Withdraw', expected: 'The form shows' },
		{ action: 'Pick USDT_TRC20', expected: '' },
		{ action: 'Send 5 USDT', expected: 'The balance drops by 5 plus the fee' }
	],
	expected: 'The withdrawal settles',
	tags: ['withdrawal', 'regression'],
	priority: 'high'
};

const run: Run = {
	id: '1a2b3c4d-5e6f-4789-8abc-def012345678',
	name: 'Smoke',
	release: 'v2.3.0',
	environment: 'Android 14, build 2.3.0-rc2',
	status: 'in-progress',
	cases: [item],
	createdAt: 0,
	updatedAt: 0,
	completedAt: null
};

const failed = (part: Partial<TestResult>): TestResult => ({
	runId: run.id,
	caseNumber: 12,
	status: 'fail',
	failedStep: 0,
	actual: 'The balance does not change\nNo error is shown',
	reason: '',
	notes: '',
	linkedIssue: '',
	updatedAt: 0,
	...part
});

describe('buildBugReport (FR-120)', () => {
	it('pre-fills every field from the run, the case, and the result (AC-1, AC-6)', () => {
		expect(buildBugReport(run, item, failed({ notes: 'Seen twice' }))).toEqual({
			summary: 'Withdraw USDT on Tron: The balance does not change',
			priority: 'high',
			labels: 'withdrawal, regression',
			environment: 'Android 14, build 2.3.0-rc2',
			preconditions: 'A funded testnet wallet',
			steps: '1. Open Withdraw\n2. Pick USDT_TRC20\n3. Send 5 USDT',
			expected: 'The withdrawal settles',
			actual: 'The balance does not change\nNo error is shown',
			notes: 'Seen twice\nRun: Smoke (v2.3.0), case TC-12.'
		} satisfies BugReport);
	});

	it('failed step n gives steps 1 to n and step n expected result (AC-2)', () => {
		const report = buildBugReport(run, item, failed({ failedStep: 3 }));
		expect(report.steps).toBe('1. Open Withdraw\n2. Pick USDT_TRC20\n3. Send 5 USDT');
		expect(report.expected).toBe('The balance drops by 5 plus the fee');

		const first = buildBugReport(run, item, failed({ failedStep: 1 }));
		expect(first.steps).toBe('1. Open Withdraw');
		expect(first.expected).toBe('The form shows');
	});

	it('uses the case expected result when step n has none (AC-2)', () => {
		const report = buildBugReport(run, item, failed({ failedStep: 2 }));
		expect(report.steps).toBe('1. Open Withdraw\n2. Pick USDT_TRC20');
		expect(report.expected).toBe('The withdrawal settles');
	});

	it('Not step-specific, no step, or a step out of range lists every step (AC-3)', () => {
		for (const failedStep of [0, null, 4, -1]) {
			const report = buildBugReport(run, item, failed({ failedStep }));
			expect(report.steps).toBe('1. Open Withdraw\n2. Pick USDT_TRC20\n3. Send 5 USDT');
			expect(report.expected).toBe('The withdrawal settles');
		}
	});

	it('a case with no steps gives an empty Steps field', () => {
		const report = buildBugReport(run, { ...item, steps: [] }, failed({ failedStep: 1 }));
		expect(report.steps).toBe('');
		expect(report.expected).toBe('The withdrawal settles');
	});

	it('summary is "<title>: <first line of the actual result>", shortened (AC-4)', () => {
		const long = 'x'.repeat(300);
		const report = buildBugReport(run, item, failed({ actual: long }));
		expect(report.summary).toHaveLength(SUMMARY_MAX);
		expect(report.summary.startsWith('Withdraw USDT on Tron: xxx')).toBe(true);
		expect(report.summary.endsWith('x…')).toBe(true);

		// The first line with text, as in the run summary.
		expect(buildBugReport(run, item, failed({ actual: '  \n second line' })).summary).toBe(
			'Withdraw USDT on Tron: second line'
		);
		expect(buildBugReport(run, item, failed({ actual: '  ' })).summary).toBe(
			'Withdraw USDT on Tron'
		);
	});

	it('the run reference leaves out an empty release, and empty notes', () => {
		expect(buildBugReport({ ...run, release: ' ' }, item, failed({})).notes).toBe(
			'Run: Smoke, case TC-12.'
		);
	});

	it('a multi-line action is kept as continuation lines of its step', () => {
		const multi = { ...item, steps: [{ action: 'Open Withdraw\n\n  then wait', expected: 'x' }] };
		const report = buildBugReport(run, multi, failed({}));
		expect(report.steps).toBe('1. Open Withdraw\n   then wait');
		expect(parseSteps(report.steps)).toEqual([['Open Withdraw', 'then wait']]);
	});
});

describe('shorten', () => {
	it('keeps text up to the limit and cuts one more with an ellipsis', () => {
		expect(shorten('abcde', 5)).toBe('abcde');
		expect(shorten('abcdef', 5)).toBe('abcd…');
		expect(shorten('abc def', 5)).toBe('abc…');
	});

	it('never splits a surrogate pair', () => {
		expect(shorten('abc😀def', 5)).toBe('abc…');
		expect(shorten('ab😀def', 5)).toBe('ab😀…');
	});
});

describe('stepsText and parseSteps (design 13.3 P2-05)', () => {
	it('numbers the steps and reads them back', () => {
		const text = stepsText(['Open', 'Pick', 'Send']);
		expect(text).toBe('1. Open\n2. Pick\n3. Send');
		expect(parseSteps(text)).toEqual([['Open'], ['Pick'], ['Send']]);
	});

	it('indents continuation lines past the number, also from step 10', () => {
		const actions = Array.from({ length: 10 }, (_, i) => (i === 9 ? 'Ten\nmore' : `S${i + 1}`));
		expect(stepsText(actions).split('\n').slice(-2)).toEqual(['10. Ten', '    more']);
		expect(parseSteps(stepsText(actions))).toHaveLength(10);
	});

	it('an empty action keeps its number in the field', () => {
		expect(stepsText(['', 'Pick'])).toBe('1.\n2. Pick');
		expect(parseSteps('1.\n2. Pick')).toEqual([['Pick']]);
	});

	it('accepts edits: `1)` numbers, text before any number, blank lines, any numbering', () => {
		expect(parseSteps('Intro line\n\n1) Open\n  more\n7. Send\n\n')).toEqual([
			['Intro line'],
			['Open', 'more'],
			['Send']
		]);
	});

	it('an indented number, or a number with no space after the dot, continues the step', () => {
		expect(parseSteps('1. Send\n   2. not a step\n2.5 ETH')).toEqual([
			['Send', '2. not a step', '2.5 ETH']
		]);
	});
});

describe('escapeMarkdownLine (FR-121 AC-3)', () => {
	it('escapes every inline markup character', () => {
		for (const char of ['\\', '`', '*', '_', '[', ']', '<', '>', '|', '~', '&']) {
			expect(escapeMarkdownLine(`a${char}b`)).toBe(`a\\${char}b`);
		}
	});

	it('escapes what formats only at the start of a line', () => {
		expect(escapeMarkdownLine('# Not a heading')).toBe('\\# Not a heading');
		expect(escapeMarkdownLine('> not a quote')).toBe('\\> not a quote');
		expect(escapeMarkdownLine('- not a list')).toBe('\\- not a list');
		expect(escapeMarkdownLine('+ not a list')).toBe('\\+ not a list');
		expect(escapeMarkdownLine('===')).toBe('\\===');
		expect(escapeMarkdownLine('2. not a list')).toBe('2\\. not a list');
		expect(escapeMarkdownLine('10) not a list')).toBe('10\\) not a list');
	});

	it('leaves those characters alone inside a line', () => {
		expect(escapeMarkdownLine('a # b - c + d = e 2. f {code}')).toBe(
			'a # b - c + d = e 2. f {code}'
		);
	});
});

describe('escapeJira (FR-121 AC-2, EC-035)', () => {
	it('escapes every link, macro, table, image, and effect character', () => {
		for (const char of ['{', '}', '[', ']', '|', '*', '_', '^', '~', '+', '!']) {
			expect(escapeJira(`a${char}b`)).toBe(`a\\${char}b`);
		}
	});

	it('writes a backslash as an entity, so it cannot make a line break or an escape', () => {
		expect(escapeJira('C:\\temp')).toBe('C:&#92;temp');
		expect(escapeJira('a\\\\b')).toBe('a&#92;&#92;b');
		expect(escapeJira('\\*')).toBe('&#92;\\*');
	});

	it('escapes a dash only where it could format', () => {
		expect(escapeJira('2026-11-24 multi-network')).toBe('2026-11-24 multi-network');
		expect(escapeJira('-strike-')).toBe('\\-strike\\-');
		expect(escapeJira('a - b')).toBe('a \\- b');
		expect(escapeJira('a--b')).toBe('a\\-\\-b');
		expect(escapeJira('----')).toBe('\\-\\-\\-\\-');
		expect(escapeJira('café-ünï')).toBe('café-ünï');
	});

	it('escapes a question mark only in pairs', () => {
		expect(escapeJira('Why?')).toBe('Why?');
		expect(escapeJira('??cite??')).toBe('\\?\\?cite\\?\\?');
		expect(escapeJira('a ? b')).toBe('a ? b');
	});

	it('at the start of a line escapes a numbered list and the block markers', () => {
		expect(escapeJira('# one', true)).toBe('\\# one');
		expect(escapeJira('h3. Heading', true)).toBe('h3\\. Heading');
		expect(escapeJira('bq. Quote', true)).toBe('bq\\. Quote');
		expect(escapeJira('a # b h3. c', true)).toBe('a # b h3. c');
		expect(escapeJira('# one')).toBe('# one');
	});

	it('turns a macro into plain text', () => {
		expect(escapeJira('{code}x{code} {panel:title=a}')).toBe(
			'\\{code\\}x\\{code\\} \\{panel:title=a\\}'
		);
	});
});

describe('renderReport (FR-121, FR-122 AC-1)', () => {
	const plain = buildBugReport(run, item, failed({ failedStep: 3 }));
	const files = ['TC-12-1a2b3c4d-1.webp', 'TC-12-1a2b3c4d-2.jpg'];

	it('renders Markdown with ### headings, a numbered list, and the file names (AC-3)', () => {
		expect(renderReport(plain, files, 'markdown')).toBe(
			[
				'**Summary:** Withdraw USDT on Tron: The balance does not change',
				'**Priority:** High · **Labels:** withdrawal, regression',
				'',
				'### Environment',
				'Android 14, build 2.3.0-rc2',
				'',
				'### Preconditions',
				'A funded testnet wallet',
				'',
				'### Steps to reproduce',
				'1. Open Withdraw',
				'2. Pick USDT\\_TRC20',
				'3. Send 5 USDT',
				'',
				'### Expected result',
				'The balance drops by 5 plus the fee',
				'',
				'### Actual result',
				'The balance does not change\\',
				'No error is shown',
				'',
				'### Notes',
				'Run: Smoke (v2.3.0), case TC-12.',
				'',
				'### Attachments',
				'- TC-12-1a2b3c4d-1.webp',
				'- TC-12-1a2b3c4d-2.jpg',
				''
			].join('\n')
		);
	});

	it('renders Jira with h3. headings, # steps, and *bold* labels (AC-2)', () => {
		expect(renderReport(plain, files, 'jira')).toBe(
			[
				'*Summary:* Withdraw USDT on Tron: The balance does not change',
				'*Priority:* High · *Labels:* withdrawal, regression',
				'',
				'h3. Environment',
				'Android 14, build 2.3.0-rc2',
				'',
				'h3. Preconditions',
				'A funded testnet wallet',
				'',
				'h3. Steps to reproduce',
				'# Open Withdraw',
				'# Pick USDT\\_TRC20',
				'# Send 5 USDT',
				'',
				'h3. Expected result',
				'The balance drops by 5 plus the fee',
				'',
				'h3. Actual result',
				'The balance does not change',
				'No error is shown',
				'',
				'h3. Notes',
				'Run: Smoke (v2.3.0), case TC-12.',
				'',
				'h3. Attachments',
				'* TC-12-1a2b3c4d-1.webp',
				'* TC-12-1a2b3c4d-2.jpg',
				''
			].join('\n')
		);
	});

	it('leaves out empty fields, labels, and attachments', () => {
		const empty: BugReport = {
			summary: 'Only a summary',
			priority: 'low',
			labels: ' ',
			environment: '',
			preconditions: '\n  \n',
			steps: '',
			expected: '',
			actual: '',
			notes: ''
		};
		expect(renderReport(empty, [], 'markdown')).toBe(
			'**Summary:** Only a summary\n**Priority:** Low\n'
		);
		expect(renderReport(empty, [], 'jira')).toBe('*Summary:* Only a summary\n*Priority:* Low\n');
	});

	it('uses the edits (FR-120 AC-5)', () => {
		const edited = { ...plain, summary: 'Edited', priority: 'critical' as const, steps: '1. Only' };
		const text = renderReport(edited, [], 'markdown');
		expect(text).toContain('**Summary:** Edited\n**Priority:** Critical');
		expect(text).toContain('### Steps to reproduce\n1. Only\n');
	});

	it('a multi-line summary or labels field is made one line', () => {
		const text = renderReport({ ...plain, summary: 'a\nb', labels: 'x,\ny' }, [], 'jira');
		expect(text.split('\n').slice(0, 2)).toEqual([
			'*Summary:* a b',
			'*Priority:* High · *Labels:* x, y'
		]);
	});
});

describe('golden reports with awkward text (FR-121 AC-4, EC-035)', () => {
	const awkwardCase: CaseSnapshot = {
		...item,
		title: 'Withdraw *all* to [ERC-20] address | `max`',
		preconditions: '# Funded wallet\n{code}seed{code} stays offline\n\n\n- one *bold* line',
		steps: [
			{ action: 'Open `Withdraw` > USDT_TRC20', expected: 'The form shows' },
			{ action: 'Enter 1.5\n2. this line is not a step\n- nor this one', expected: '' },
			{ action: 'Press {panel}Send{panel}', expected: 'Sent' }
		],
		expected: 'Balance drops by 1.5 + fee {color:red}',
		tags: ['withdrawal', 'edge_case']
	};
	const awkwardRun: Run = {
		...run,
		name: 'Smoke [rc] *2*',
		release: 'v2.3.0',
		environment: 'Android 14 · build 2.3.0-rc2\nSepolia | chain id 11155111'
	};
	const awkward = buildBugReport(
		awkwardRun,
		awkwardCase,
		failed({
			failedStep: 2,
			actual:
				'Balance shows ~0~ ^1^ +5+ -- error -- ??\nh3. Not a heading\n## Not one either\n\\ backslash & <b>bold</b> !img.png!',
			notes: 'See https://example.com/a_b?x=1-2 and C:\\temp\n1. not a list'
		})
	);
	const files = ['TC-12-1a2b3c4d-1.webp'];

	it('Markdown matches its golden file', async () => {
		await expect(renderReport(awkward, files, 'markdown')).toMatchFileSnapshot(
			'./fixtures/bug-report.markdown.txt'
		);
	});

	it('Jira wiki markup matches its golden file', async () => {
		await expect(renderReport(awkward, files, 'jira')).toMatchFileSnapshot(
			'./fixtures/bug-report.jira.txt'
		);
	});
});
