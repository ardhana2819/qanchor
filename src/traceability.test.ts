import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Phase 1 completion check (T-046): every functional requirement in docs/prd.md section 5.2 is
// named by at least one unit or E2E test, so a requirement cannot ship, or stay shipped, without
// one. Retired requirements are skipped. Whether each test passes is CI's job.

const root = join(import.meta.dirname, '..');

function testFiles(dir: string): string[] {
	return readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
		.filter((file) => /\.(test|spec)\.ts$/.test(file))
		.map((file) => join(dir, file));
}

function phase1Requirements(): { id: string; title: string }[] {
	const prd = readFileSync(join(root, 'docs/prd.md'), 'utf8');
	const section = prd.slice(
		prd.indexOf('### 5.2 Functional requirements'),
		prd.indexOf('## 6. Non-functional requirements')
	);
	return [...section.matchAll(/^\*\*(FR-\d{3}): ([^*]+)\*\*/gm)]
		.map(([, id, title]) => ({ id, title: title.trim() }))
		.filter(({ title }) => !/^retired/i.test(title));
}

describe('Phase 1 traceability', () => {
	const requirements = phase1Requirements();
	const files = [...testFiles('src'), ...testFiles('tests')].filter(
		(file) => !file.endsWith('traceability.test.ts')
	);
	const sources = files.map((file) => readFileSync(join(root, file), 'utf8'));

	it('reads the requirement list from the PRD', () => {
		expect(requirements.length).toBe(33);
		expect(requirements[0]).toEqual({ id: 'FR-001', title: 'Navigation and routes' });
		expect(requirements.map((r) => r.id)).not.toContain('FR-013');
	});

	it('names every Phase 1 functional requirement in at least one test', () => {
		const untested = requirements
			.filter(({ id }) => !sources.some((source) => new RegExp(`\\b${id}\\b`).test(source)))
			.map(({ id, title }) => `${id}: ${title}`);
		expect(untested).toEqual([]);
	});
});
