<script lang="ts">
	import ChecklistList from '#lib/tools/checklists/ChecklistList.svelte';
</script>

<svelte:head>
	<title>Checklists · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Checklists</h1>
	<p>
		Test checklists for crypto and stock flows. Each item is one statement to mark pass or fail.
	</p>
</header>

<ChecklistList />

<style>
	.page-header {
		margin-bottom: var(--space-6);
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
