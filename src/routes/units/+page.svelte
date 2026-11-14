<script lang="ts">
	import UnitConverter from '#lib/tools/units/UnitConverter.svelte';
</script>

<svelte:head>
	<title>Unit converter · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Unit converter</h1>
	<p>Exact conversion between chain units. Type in any field and the others update.</p>
</header>

<UnitConverter />

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
