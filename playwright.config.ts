import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
	testDir: 'tests/e2e',
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${port}`,
		trace: 'retain-on-failure'
	},
	// E2E runs against the production build, the same files Cloudflare Pages serves (NFR-007).
	webServer: {
		command: `npm run build && npm run preview -- --port ${port} --strictPort`,
		port,
		reuseExistingServer: !process.env.CI
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	]
});
