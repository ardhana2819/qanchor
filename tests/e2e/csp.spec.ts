import { expect, test, type Page } from '@playwright/test';

// Collects CSP violations and uncaught errors from the moment the document is created.
async function watchForProblems(page: Page): Promise<() => Promise<string[]>> {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
	await page.addInitScript(() => {
		const store: string[] = [];
		Object.defineProperty(window, '__cspViolations', { value: store });
		document.addEventListener('securitypolicyviolation', (event) => {
			store.push(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'}`);
		});
	});
	return async () => {
		const violations = await page.evaluate(
			() => (window as unknown as { __cspViolations: string[] }).__cspViolations
		);
		return [...violations, ...pageErrors];
	};
}

// /components shows screenshots through blob: URLs (T-062).
for (const path of ['/', '/this-page-does-not-exist', '/components']) {
	test(`no CSP violations or errors on ${path}`, async ({ page }) => {
		const problems = await watchForProblems(page);

		await page.goto(path);
		await page.waitForLoadState('networkidle');

		expect(await problems()).toEqual([]);
	});
}

test('the page carries the CSP meta tag with a restrictive script-src', async ({ page }) => {
	await page.goto('/');

	const csp = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');

	const directives = new Map(
		(csp ?? '').split(';').map((directive) => {
			const [name, ...sources] = directive.trim().split(/\s+/);
			return [name, sources];
		})
	);

	expect(directives.get('default-src')).toEqual(["'self'"]);
	// Scripts: same origin plus exact hashes only, never unsafe-inline or unsafe-eval.
	const scriptSources = directives.get('script-src') ?? [];
	expect(scriptSources[0]).toBe("'self'");
	expect(scriptSources.slice(1).length).toBeGreaterThan(0);
	for (const source of scriptSources.slice(1)) {
		expect(source).toMatch(/^'sha256-[A-Za-z0-9+/=]+'$/);
	}
	// <style> elements stay same-origin; only style="" attributes are relaxed (ADR-007).
	expect(directives.get('style-src')).toEqual(["'self'"]);
	expect(directives.get('object-src')).toEqual(["'none'"]);
	// Images: same origin, data: URLs, and the page's own object URLs for screenshots (F-13).
	expect(directives.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
});

test('unknown URLs get the fallback page with a 404 status', async ({ page }) => {
	const response = await page.goto('/this-page-does-not-exist');

	expect(response?.status()).toBe(404);
});

test.describe('stored theme is applied by the inline script', () => {
	for (const stored of ['dark', 'light']) {
		test(`"${stored}"`, async ({ page }) => {
			await page.addInitScript((value) => localStorage.setItem('qanchor.theme', value), stored);

			await page.goto('/');

			await expect(page.locator('html')).toHaveAttribute('data-theme', stored);
		});
	}

	test('ignores values other than light and dark', async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('qanchor.theme', 'neon'));

		await page.goto('/');

		await expect(page.locator('html')).not.toHaveAttribute('data-theme');
	});
});
