<script lang="ts">
	import DataSection from '#lib/tools/settings/DataSection.svelte';
	import EndpointsSection from '#lib/tools/settings/EndpointsSection.svelte';
	import ThemeControl from '#lib/ui/ThemeControl.svelte';
</script>

<svelte:head>
	<title>Settings · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Settings</h1>
	<p>Preferences and data stored in this browser.</p>
</header>

<section class="section" aria-labelledby="appearance">
	<h2 id="appearance">Appearance</h2>
	<div class="row">
		<div class="theme">
			<ThemeControl />
		</div>
		<p class="hint">System follows your operating system's setting.</p>
	</div>
</section>

<div class="section">
	<EndpointsSection />
</div>

<div class="section">
	<DataSection />
</div>

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

	.section {
		max-width: 820px;
	}

	.section + .section {
		margin-top: var(--space-8);
		padding-top: var(--space-8);
		border-top: 1px solid var(--color-border);
	}

	h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}

	.theme {
		width: 240px;
	}

	.hint {
		margin: 0;
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
	}
</style>
