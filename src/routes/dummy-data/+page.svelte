<script lang="ts">
	import DummyData from '#lib/tools/dummy/DummyData.svelte';
</script>

<svelte:head>
	<title>Dummy data · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Dummy data</h1>
	<p>
		Fake Indonesian identities for filling forms and seeding databases. The same seed always gives
		the same rows.
	</p>
</header>

<DummyData />

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
