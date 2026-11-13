import { describe, expect, it } from 'vitest';
import { MIGRATIONS, runMigrations, type Migration } from './migrations.ts';
import { DB_VERSION } from './schema.ts';

// The steps only receive opaque handles here; the real database behaviour is in db.test.ts.
const db = {} as Parameters<Migration>[0];
const tx = {} as Parameters<Migration>[1];

function recorder() {
	const ran: number[] = [];
	const steps: Record<number, Migration> = {
		1: () => ran.push(1),
		2: () => ran.push(2),
		3: () => ran.push(3)
	};
	return { ran, steps };
}

describe('runMigrations', () => {
	it('runs every step after the old version, in order', () => {
		const { ran, steps } = recorder();
		runMigrations(db, tx, 0, 3, steps);
		expect(ran).toEqual([1, 2, 3]);
	});

	it('runs only the missing steps for an existing database', () => {
		const { ran, steps } = recorder();
		runMigrations(db, tx, 1, 3, steps);
		expect(ran).toEqual([2, 3]);
	});

	it('runs nothing when the database is current', () => {
		const { ran, steps } = recorder();
		runMigrations(db, tx, 3, 3, steps);
		expect(ran).toEqual([]);
	});

	it('fails before running anything past a missing step', () => {
		const { ran, steps } = recorder();
		delete steps[2];
		expect(() => runMigrations(db, tx, 0, 3, steps)).toThrow('No migration to schema version 2.');
		expect(ran).toEqual([1]);
	});
});

describe('MIGRATIONS', () => {
	it('has one step for every version up to DB_VERSION', () => {
		const versions = Object.keys(MIGRATIONS).map(Number);
		expect(versions).toEqual(Array.from({ length: DB_VERSION }, (_, i) => i + 1));
	});
});
