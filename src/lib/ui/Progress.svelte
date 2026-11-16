<script lang="ts">
	interface Props {
		/** What is in progress, e.g. "Generating 10,000 rows…"; also names the bar. */
		label: string;
		value: number;
		max: number;
		'data-testid'?: string;
	}

	let { label, value, max, 'data-testid': testId }: Props = $props();

	const id = $props.id();
</script>

<!-- Determinate only: there is no spinner (design 2.3). The bar moves when progress arrives. -->
<div class="progress" data-testid={testId}>
	<p {id}>{label}</p>
	<progress aria-labelledby={id} {value} {max}></progress>
</div>

<style>
	.progress {
		display: grid;
		gap: var(--space-2);
	}

	p {
		margin: 0;
		color: var(--color-text-muted);
	}

	progress {
		width: 100%;
		height: 6px;
		overflow: hidden;
		border: 0;
		border-radius: var(--radius-full);
		background: var(--color-surface-raised);
		appearance: none;
	}

	progress::-webkit-progress-bar {
		background: var(--color-surface-raised);
	}

	progress::-webkit-progress-value {
		background: var(--color-accent);
		transition: width var(--duration-base) var(--ease-out);
	}

	progress::-moz-progress-bar {
		background: var(--color-accent);
	}
</style>
