// Builds src/lib/core/dummy/data/regions.json from the open region data by Cahya DSN (MIT),
// which follows Kepmendagri 300.2.2-2430 Tahun 2025 (T-027, FR-081 AC-3).
//
// Usage: node scripts/build-regions.mjs <wilayah.sql> <wilayah_kodepos.sql> <wilayah commit> <kodepos commit>
//   wilayah.sql          https://github.com/cahyadsn/wilayah/blob/<commit>/db/wilayah.sql
//   wilayah_kodepos.sql  https://github.com/cahyadsn/wilayah_kodepos/blob/<commit>/db/wilayah_kodepos.sql
//
// Keeps every province and kabupaten/kota, and a fixed sample below them: two kecamatan per
// kabupaten/kota and two desa/kelurahan per kecamatan (the first and the middle one by code), each
// village with its postal code. The sample is chosen by position, never at random, so a rebuild
// from the same sources gives the same file.
import { readFile, writeFile } from 'node:fs/promises';

const OUT = 'src/lib/core/dummy/data/regions.json';

const [wilayahPath, kodeposPath, wilayahCommit, kodeposCommit] = process.argv.slice(2);
if (!kodeposCommit) {
	console.error(
		'Usage: node scripts/build-regions.mjs <wilayah.sql> <wilayah_kodepos.sql> <wilayah commit> <kodepos commit>'
	);
	process.exit(1);
}

const QUOTED = /\('([\d.]+)',\s*'((?:[^']|'')*)'\)/g;

function parse(sql) {
	return [...sql.matchAll(QUOTED)].map(([, code, value]) => [
		code,
		value.replaceAll("''", "'").trim()
	]);
}

const byCode = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
const level = (code) => code.split('.').length;
const parentOf = (code) => code.slice(0, code.lastIndexOf('.'));

/** The first and the middle element, or the only one. */
function sample(items) {
	const picked = [items[0], items[Math.floor(items.length / 2)]];
	return [...new Set(picked)];
}

function childrenByParent(rows) {
	const map = new Map();
	for (const row of rows) {
		const parent = parentOf(row[0]);
		if (!map.has(parent)) map.set(parent, []);
		map.get(parent).push(row);
	}
	return map;
}

const regions = parse(await readFile(wilayahPath, 'utf8')).sort(byCode);
const postal = new Map(parse(await readFile(kodeposPath, 'utf8')));

const provinces = regions.filter((row) => level(row[0]) === 1);
const regencies = regions.filter((row) => level(row[0]) === 2);
const districts = childrenByParent(regions.filter((row) => level(row[0]) === 3));
const villages = childrenByParent(regions.filter((row) => level(row[0]) === 4));

let missingPostal = 0;
const out = {
	source: {
		regions: `https://github.com/cahyadsn/wilayah/blob/${wilayahCommit}/db/wilayah.sql`,
		postalCodes: `https://github.com/cahyadsn/wilayah_kodepos/blob/${kodeposCommit}/db/wilayah_kodepos.sql`,
		decree: 'Kepmendagri 300.2.2-2430 Tahun 2025',
		license: 'MIT, Copyright (c) 2017-2025 Cahya DSN; see src/lib/core/dummy/data/NOTICE.md'
	},
	provinces,
	regencies: regencies.map(([code, name]) => [
		code,
		name,
		sample(districts.get(code) ?? []).map(([districtCode, districtName]) => [
			districtCode,
			districtName,
			sample(villages.get(districtCode) ?? [])
				.filter(([villageCode]) => postal.has(villageCode) || (missingPostal++, false))
				.map(([villageCode, villageName]) => [villageCode, villageName, postal.get(villageCode)])
		])
	])
};

await writeFile(OUT, `${JSON.stringify(out)}\n`);
const villageCount = out.regencies.flatMap((r) => r[2]).flatMap((d) => d[2]).length;
console.log(
	`${OUT}: ${provinces.length} provinces, ${regencies.length} kabupaten/kota, ` +
		`${out.regencies.flatMap((r) => r[2]).length} kecamatan, ${villageCount} villages; ` +
		`${missingPostal} sampled villages skipped for lack of a postal code`
);
