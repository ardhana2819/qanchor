import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes mode everywhere except dependencies (ADR-002).
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Every route is prerendered; 404.html is the client-rendered fallback
			// that Cloudflare Pages serves for unknown paths (ADR-011, NFR-022).
			adapter: adapter({ fallback: '404.html' })
		})
	]
});
