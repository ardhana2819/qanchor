<script lang="ts" generics="T extends string">
	interface Props {
		/** Group name for screen readers; visually hidden. */
		legend: string;
		/** 2 to 4 options (design section 6). */
		options: readonly { value: T; label: string }[];
		value: T;
		onchange: (value: T) => void;
	}

	let { legend, options, value, onchange }: Props = $props();

	const name = $props.id();
	const index = $derived(
		Math.max(
			0,
			options.findIndex((option) => option.value === value)
		)
	);
	// The thumb only slides after the user picks an option. A value that changes on load (for
	// example the stored theme applied after hydration) jumps into place instead of animating.
	let animated = $state(false);

	function select(next: T): void {
		animated = true;
		onchange(next);
	}
</script>

<fieldset class="segmented">
	<legend class="visually-hidden">{legend}</legend>
	<div class="track" class:animated style:--count={options.length} style:--index={index}>
		<span class="thumb" aria-hidden="true"></span>
		{#each options as option (option.value)}
			<label>
				<input
					type="radio"
					{name}
					value={option.value}
					checked={option.value === value}
					onchange={() => select(option.value)}
				/>
				<span class="option">{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.segmented {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.track {
		--gap: 2px;
		position: relative;
		display: grid;
		grid-auto-columns: minmax(0, 1fr);
		grid-auto-flow: column;
		gap: var(--gap);
		padding: 2px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
	}

	/* Segmented thumb (design 2.4): one background that slides with transform only. */
	.thumb {
		position: absolute;
		top: 2px;
		bottom: 2px;
		left: 2px;
		width: calc((100% - 4px - (var(--count) - 1) * var(--gap)) / var(--count));
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
		transform: translateX(calc(var(--index) * (100% + var(--gap))));
	}

	.animated .thumb {
		transition: transform var(--duration-base) var(--ease-out);
	}

	label {
		position: relative;
	}

	input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.option {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: var(--control-sm);
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
		transition: color var(--duration-fast) var(--ease-out);
	}

	label:hover .option,
	input:checked + .option {
		color: var(--color-text);
	}

	input:focus-visible + .option {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}
</style>
