<script lang="ts">
	import ReleaseList from '#lib/tools/releases/ReleaseList.svelte';
</script>

<svelte:head>
	<title>Releases · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Releases</h1>
	<p>Results of your runs and sessions rolled up per release, ready to copy as a summary.</p>
</header>

<ReleaseList />

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
