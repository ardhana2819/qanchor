import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// SvelteKit hashes only the inline scripts it generates itself. The theme script in
// src/app.html is ours, so its hash is computed here from that file (ADR-007, T-004).
function appHtmlScriptHash(): `sha256-${string}` {
	const html = readFileSync('src/app.html', 'utf8');
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
	if (scripts.length !== 1) {
		throw new Error(
			`Expected exactly one inline <script> in src/app.html, found ${scripts.length}.`
		);
	}
	return `sha256-${createHash('sha256').update(scripts[0][1]).digest('base64')}`;
}

// Shown in the footer so the deployed commit is identifiable (NFR-021). Cloudflare Pages sets
// CF_PAGES_COMMIT_SHA during its build; every other build is labelled "dev".
const commitId = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) || 'dev';

export default defineConfig({
	define: { __COMMIT_ID__: JSON.stringify(commitId) },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes mode everywhere except dependencies (ADR-002).
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Every route is prerendered; 404.html is the client-rendered fallback
			// that Cloudflare Pages serves for unknown paths (ADR-011, NFR-022).
			adapter: adapter({ fallback: '404.html' }),
			// Emitted as a <meta> tag on prerendered pages. Headers a meta tag cannot set
			// (frame-ancestors and friends) are in static/_headers (ADR-007, NFR-017).
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', appHtmlScriptHash()],
					'style-src': ['self'],
					// style="" attributes only. SvelteKit's route announcer (and Svelte templates) set
					// them; they cannot run script, and <style> elements stay limited to 'self'.
					'style-src-attr': ['unsafe-inline'],
					// blob: for stored screenshots, shown through this page's own object URLs (F-13).
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					// Users may point lookups at any https endpoint, or a local node (FR-041).
					'connect-src': ['self', 'https:', 'http://localhost:*'],
					'worker-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self']
				}
			}
		})
	],
	test: {
		// Unit tests sit next to the code they test; E2E specs live in tests/e2e (architecture section 7).
		include: ['src/**/*.test.ts'],
		environment: 'node',
		expect: { requireAssertions: true }
	}
});
