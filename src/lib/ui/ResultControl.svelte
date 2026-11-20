<script lang="ts">
	import type { ResultStatus } from '#lib/core/qa/types.ts';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		/** Group name for screen readers; visually hidden, e.g. "Result of TC-12". */
		legend: string;
		/** `null`: untested, nothing selected. */
		value: ResultStatus | null;
		onchange: (value: ResultStatus) => void;
		/** A completed run: the result shows but cannot change (design 13.3 P2-04). */
		readonly?: boolean;
	}

	let { legend, value, onchange, readonly = false }: Props = $props();

	const OPTIONS: readonly { value: ResultStatus; label: string; icon: IconName }[] = [
		{ value: 'pass', label: 'Pass', icon: 'check' },
		{ value: 'fail', label: 'Fail', icon: 'cross' },
		{ value: 'blocked', label: 'Blocked', icon: 'warning' }
	];

	const name = $props.id();
	// The icon only pops after the user picks a result; a stored result shows without motion.
	let animated = $state(false);

	function select(next: ResultStatus): void {
		animated = true;
		onchange(next);
	}
</script>

<div class="result-control">
	<fieldset class:animated disabled={readonly}>
		<legend class="visually-hidden">{legend}</legend>
		{#each OPTIONS as option (option.value)}
			<label class={option.value}>
				<input
					type="radio"
					{name}
					value={option.value}
					checked={option.value === value}
					onchange={() => select(option.value)}
				/>
				<span class="option"><Icon name={option.icon} size={14} />{option.label}</span>
			</label>
		{/each}
	</fieldset>
	{#if value === null}
		<span class="untested">Untested</span>
	{/if}
</div>

<style>
	.result-control {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	fieldset {
		display: inline-flex;
		gap: 2px;
		min-width: 0;
		margin: 0;
		padding: 2px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
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
		gap: var(--space-1);
		min-height: var(--control-sm);
		padding: 0 var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
		transition:
			color var(--duration-fast) var(--ease-out),
			background-color var(--duration-fast) var(--ease-out);
	}

	fieldset:enabled label:hover input:not(:checked) + .option {
		color: var(--color-text);
	}

	.pass input:checked + .option {
		background: var(--color-success-bg);
		color: var(--color-success);
	}

	.fail input:checked + .option {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.blocked input:checked + .option {
		background: var(--color-warning-bg);
		color: var(--color-warning);
	}

	/* Result set (design 13.6): the chosen icon scales 0.5 to 1, transform only. */
	.animated input:checked + .option :global(.icon) {
		animation: pop var(--duration-base) var(--ease-spring);
	}

	@keyframes pop {
		from {
			transform: scale(0.5);
		}
	}

	input:focus-visible + .option {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	fieldset:disabled input {
		cursor: default;
	}

	.untested {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}
</style>
