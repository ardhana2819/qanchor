<script lang="ts">
	import NewRun from '#lib/tools/runs/NewRun.svelte';
</script>

<svelte:head>
	<title>New run · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>New run</h1>
	<p>Name the run, then pick the test cases it covers.</p>
</header>

<NewRun />

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
