// Fails when the JavaScript the default route loads at startup exceeds the gzip budget (NFR-001, ADR-009).
// "Loads at startup" = every script the prerendered build/index.html preloads or imports.
// Chunks imported later with dynamic import() (tool code, crypto, datasets) are not counted.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT_BYTES = 80 * 1024;
const BUILD_DIR = 'build';
const ENTRY_HTML = path.join(BUILD_DIR, 'index.html');

function scriptUrls(html) {
	const preloads = [...html.matchAll(/<link\s+href="([^"]+\.js)"\s+rel="modulepreload"/g)];
	const imports = [...html.matchAll(/import\("([^"]+\.js)"\)/g)];
	return [...new Set([...preloads, ...imports].map((match) => match[1]))];
}

function formatKb(bytes) {
	return `${(bytes / 1024).toFixed(2)} KB`;
}

async function main() {
	let html;
	try {
		html = await readFile(ENTRY_HTML, 'utf8');
	} catch {
		console.error(`Cannot read ${ENTRY_HTML}. Run "npm run build" first.`);
		return 1;
	}

	const urls = scriptUrls(html);
	if (urls.length === 0) {
		// An empty list means the HTML format changed, not that the bundle is empty.
		console.error(`No scripts found in ${ENTRY_HTML}; update scripts/check-bundle-size.mjs.`);
		return 1;
	}

	let total = 0;
	const rows = [];
	for (const url of urls) {
		const file = path.join(BUILD_DIR, url);
		const gzipped = gzipSync(await readFile(file), { level: 9 }).length;
		total += gzipped;
		rows.push({ file: path.relative(BUILD_DIR, file), gzip: formatKb(gzipped) });
	}

	console.table(rows);
	const summary = `Initial JS for "/": ${formatKb(total)} gzip (limit ${formatKb(LIMIT_BYTES)}).`;
	if (total > LIMIT_BYTES) {
		console.error(`${summary} Over budget by ${formatKb(total - LIMIT_BYTES)}.`);
		return 1;
	}
	console.info(summary);
	return 0;
}

process.exitCode = await main();
