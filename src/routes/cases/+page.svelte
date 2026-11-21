<script lang="ts">
	import CaseList from '#lib/tools/cases/CaseList.svelte';
</script>

<svelte:head>
	<title>Test cases · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Test cases</h1>
	<p>Reusable checks with steps, expected results, tags, and a priority, kept in this browser.</p>
</header>

<CaseList />

<style>
	.page-header {
		margin-bottom: var(--space-8);
	}

	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: var(--leading-xl);
	}

	.page-header p {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}
</style>
