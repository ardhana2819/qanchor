<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	// Unknown URLs reach this page through the 404.html fallback (FR-001 AC-3, NFR-022).
	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? 'Page not found' : 'Something went wrong');
</script>

<svelte:head>
	<title>{title} · QAnchor</title>
</svelte:head>

<div class="state">
	<h1>{title}</h1>
	<p>
		{notFound
			? 'This address does not match any tool.'
			: 'This page could not be shown. Reload to try again.'}
	</p>
	<a href={resolve('/')}>Back to toolkit</a>
</div>

<style>
	.state {
		max-width: 480px;
		margin: var(--space-12) auto 0;
		text-align: center;
	}

	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: var(--leading-xl);
	}

	p {
		margin: var(--space-2) 0 var(--space-4);
		color: var(--color-text-muted);
	}

	a {
		display: inline-flex;
		align-items: center;
		min-height: var(--control-md);
		padding: 0 var(--space-4);
		border-radius: var(--radius-md);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: 500;
		text-decoration: none;
	}

	a:hover {
		background: var(--color-accent-hover);
	}
</style>
