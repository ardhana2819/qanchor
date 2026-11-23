<script lang="ts">
	import { resolve } from '$app/paths';
	import CaseList from '#lib/tools/cases/CaseList.svelte';
	import Button from '#lib/ui/Button.svelte';
</script>

<svelte:head>
	<title>Test cases · QAnchor</title>
</svelte:head>

<header class="page-header">
	<div>
		<h1>Test cases</h1>
		<p>Reusable checks with steps, expected results, tags, and a priority, kept in this browser.</p>
	</div>
	<Button variant="primary" href={resolve('/cases/new')} data-testid="cases-new">
		New test case
	</Button>
</header>

<CaseList />

<style>
	.page-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
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
