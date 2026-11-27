<script lang="ts">
	import SessionList from '#lib/tools/sessions/SessionList.svelte';
</script>

<svelte:head>
	<title>Sessions · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Sessions</h1>
	<p>Timeboxed exploratory testing with a charter and findings, kept in this browser.</p>
</header>

<SessionList />

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
