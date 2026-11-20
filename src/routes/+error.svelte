<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PageState from '#lib/ui/PageState.svelte';

	// Unknown URLs reach this page through the 404.html fallback (FR-001 AC-3, NFR-022).
	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? 'Page not found' : 'Something went wrong');
</script>

<svelte:head>
	<title>{title} · QAnchor</title>
</svelte:head>

<PageState {title}>
	{notFound
		? 'This address does not match any tool.'
		: 'This page could not be shown. Reload to try again.'}
	{#snippet action()}
		<a href={resolve('/')}>Back to toolkit</a>
	{/snippet}
</PageState>
