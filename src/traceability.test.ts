import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Completion checks: every shipped functional requirement is named by at least one unit or E2E
// test, so a requirement cannot ship, or stay shipped, without one. Phase 1 (T-046) reads
// docs/prd.md section 5.2, retired requirements skipped; Phase 2 (T-056) reads section 10.3 and
// checks the slices shipped so far. Whether each test passes is CI's job.

const root = join(import.meta.dirname, '..');

function testFiles(dir: string): string[] {
	return readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
		.filter((file) => /\.(test|spec)\.ts$/.test(file))
		.map((file) => join(dir, file));
}

const prd = readFileSync(join(root, 'docs/prd.md'), 'utf8');

/** The `**FR-nnn: Title**` headings between two PRD headings. */
function requirementsBetween(start: string, end: string): { id: string; title: string }[] {
	const section = prd.slice(prd.indexOf(start), prd.indexOf(end));
	return [...section.matchAll(/^\*\*(FR-\d{3}): ([^*]+)\*\*/gm)].map(([, id, title]) => ({
		id,
		title: title.trim()
	}));
}

function phase1Requirements(): { id: string; title: string }[] {
	return requirementsBetween(
		'### 5.2 Functional requirements',
		'## 6. Non-functional requirements'
	).filter(({ title }) => !/^retired/i.test(title));
}

/**
 * The Phase 2 requirements of the shipped slices (PRD 10.1): 2a, then 2b (T-066), which also adds
 * screenshots to FR-091. Extend this list as each slice ships.
 */
const SHIPPED_PHASE_2 = [
	'FR-090',
	'FR-091',
	'FR-092',
	'FR-100',
	'FR-101',
	'FR-102',
	'FR-110',
	'FR-111',
	'FR-112',
	'FR-113',
	'FR-120',
	'FR-121',
	'FR-122',
	'FR-123'
];

function phase2Requirements(): { id: string; title: string }[] {
	return requirementsBetween(
		'### 10.3 Functional requirements',
		'### 10.4 Non-functional requirements (Phase 2)'
	);
}

const files = [...testFiles('src'), ...testFiles('tests')].filter(
	(file) => !file.endsWith('traceability.test.ts')
);
const sources = files.map((file) => readFileSync(join(root, file), 'utf8'));

/** "FR-nnn: Title" for each requirement no test names. */
const untested = (requirements: { id: string; title: string }[]) =>
	requirements
		.filter(({ id }) => !sources.some((source) => new RegExp(`\\b${id}\\b`).test(source)))
		.map(({ id, title }) => `${id}: ${title}`);

describe('Phase 1 traceability', () => {
	const requirements = phase1Requirements();

	it('reads the requirement list from the PRD', () => {
		expect(requirements.length).toBe(33);
		expect(requirements[0]).toEqual({ id: 'FR-001', title: 'Navigation and routes' });
		expect(requirements.map((r) => r.id)).not.toContain('FR-013');
	});

	it('names every Phase 1 functional requirement in at least one test', () => {
		expect(untested(requirements)).toEqual([]);
	});
});

describe('Phase 2 traceability', () => {
	const requirements = phase2Requirements();
	const shipped = requirements.filter(({ id }) => SHIPPED_PHASE_2.includes(id));

	it('reads the requirement list from the PRD', () => {
		expect(requirements.length).toBe(21);
		expect(requirements[0]).toEqual({ id: 'FR-090', title: 'QA navigation and record routes' });
		// Every shipped ID is a Phase 2 requirement, so a typo cannot hide one.
		expect(shipped.map((r) => r.id)).toEqual(SHIPPED_PHASE_2);
	});

	it('names every shipped Phase 2 functional requirement in at least one test', () => {
		expect(untested(shipped)).toEqual([]);
	});
});
