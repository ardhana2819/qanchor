import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// TypeScript already reports undefined identifiers; see the typescript-eslint FAQ.
			'no-undef': 'off',
			// No logging except in the global error boundary (architecture section 6).
			'no-console': ['error', { allow: ['error'] }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Build scripts report to the terminal; the app logging rule does not apply to them.
		files: ['scripts/**'],
		rules: { 'no-console': 'off' }
	},
	{
		// lib/core is pure domain code: no Svelte, no app runtime, no UI, network, or storage (ADR-001).
		files: ['src/lib/core/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['svelte', 'svelte/*', '$app/*', '*.svelte'],
							message: 'lib/core must not depend on Svelte or SvelteKit.'
						},
						{
							// A leading '#' starts a comment in gitignore-style patterns, so it is escaped.
							group: [
								'\\#lib/ui/*',
								'\\#lib/tools/*',
								'\\#lib/net/*',
								'\\#lib/storage/*',
								'\\#lib/state/*',
								'\\#lib/workers/*'
							],
							message: 'lib/core must not import UI, network, storage, state, or worker code.'
						}
					]
				}
			]
		}
	}
);
