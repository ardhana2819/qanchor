<script lang="ts">
	import { tick } from 'svelte';
	import type { CaseField } from '#lib/core/qa/validation.ts';
	import { STEPS_MAX } from '#lib/core/qa/validation.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Field from '#lib/ui/Field.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import { moveStep, neighbourAfterRemove, newStep, type DraftStep } from './draft.ts';

	interface Props {
		steps: DraftStep[];
		/** The first problem per field, shown once the user has tried to save. */
		errors: Map<CaseField, string>;
	}

	let { steps = $bindable(), errors }: Props = $props();

	let list: HTMLOListElement | undefined = $state();
	let addBox: HTMLDivElement | undefined = $state();

	/** Focus inside one step: its action field, or one of its buttons. */
	function focusStep(key: number, target: 'action' | 'up' | 'down'): void {
		const step = list?.querySelector(`[data-step="${key}"]`);
		if (!step) return;
		if (target === 'action') {
			step.querySelector<HTMLElement>('[data-field$=".action"] textarea')?.focus();
			return;
		}
		// At the top or bottom the button just used is disabled, so focus takes the other one.
		const wanted = step.querySelector<HTMLButtonElement>(`[data-move="${target}"]`);
		const other = step.querySelector<HTMLButtonElement>(
			`[data-move="${target === 'up' ? 'down' : 'up'}"]`
		);
		(wanted && !wanted.disabled ? wanted : other)?.focus();
	}

	async function add(): Promise<void> {
		const step = newStep();
		steps = [...steps, step];
		notify.announce(`Step ${steps.length} added.`);
		await tick();
		focusStep(step.key, 'action');
	}

	async function move(index: number, by: -1 | 1): Promise<void> {
		const { key } = steps[index];
		steps = moveStep(steps, index, by);
		notify.announce(
			`Step ${index + 1} moved ${by < 0 ? 'up' : 'down'}. It is now step ${index + by + 1}.`
		);
		await tick();
		focusStep(key, by < 0 ? 'up' : 'down');
	}

	async function remove(index: number): Promise<void> {
		const neighbour = neighbourAfterRemove(steps.length, index);
		steps = steps.toSpliced(index, 1);
		notify.announce(`Step ${index + 1} removed.`);
		await tick();
		if (neighbour === null) addBox?.querySelector('button')?.focus();
		else focusStep(steps[neighbour].key, 'action');
	}
</script>

<fieldset class="steps" data-field="steps" tabindex="-1">
	<legend>Steps</legend>
	{#if errors.get('steps')}
		<p class="error"><Icon name="warning" size={14} />{errors.get('steps')}</p>
	{/if}
	{#if steps.length > 0}
		<ol bind:this={list}>
			{#each steps as step, index (step.key)}
				<li data-step={step.key} data-testid="case-editor-step">
					<div class="step" role="group" aria-label="Step {index + 1}">
						<span class="number" aria-hidden="true">{index + 1}</span>
						<div data-field="steps.{index}.action">
							<Field label="Action" error={errors.get(`steps.${index}.action`)}>
								{#snippet children(control)}
									<Textarea
										{...control}
										rows={2}
										grow
										bind:value={step.action}
										data-testid="case-editor-step-action"
									/>
								{/snippet}
							</Field>
						</div>
						<div data-field="steps.{index}.expected">
							<Field
								label="Expected result (optional)"
								error={errors.get(`steps.${index}.expected`)}
							>
								{#snippet children(control)}
									<Textarea
										{...control}
										rows={2}
										grow
										bind:value={step.expected}
										data-testid="case-editor-step-expected"
									/>
								{/snippet}
							</Field>
						</div>
						<div class="buttons">
							<IconButton
								label="Move step {index + 1} up"
								disabled={index === 0}
								onclick={() => move(index, -1)}
								data-move="up"
							>
								<Icon name="arrow-up" />
							</IconButton>
							<IconButton
								label="Move step {index + 1} down"
								disabled={index === steps.length - 1}
								onclick={() => move(index, 1)}
								data-move="down"
							>
								<Icon name="arrow-down" />
							</IconButton>
							<IconButton label="Remove step {index + 1}" onclick={() => remove(index)}>
								<Icon name="trash" />
							</IconButton>
						</div>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
	<div class="add" bind:this={addBox}>
		<Button onclick={add} disabled={steps.length >= STEPS_MAX} data-testid="case-editor-add-step">
			Add step
		</Button>
		{#if steps.length >= STEPS_MAX}
			<span class="hint">Up to {STEPS_MAX} steps.</span>
		{/if}
	</div>
</fieldset>

<style>
	fieldset {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.steps > legend {
		margin-bottom: var(--space-2);
		padding: 0;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: var(--leading-xs);
	}

	.steps:focus-visible {
		outline-offset: 4px;
	}

	ol {
		display: grid;
		gap: var(--space-3);
		margin: 0 0 var(--space-3);
		padding: 0;
		list-style: none;
	}

	.step {
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr) auto;
		align-items: start;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
	}

	.number {
		padding-top: 24px;
		color: var(--color-text-subtle);
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		text-align: right;
	}

	.buttons {
		display: flex;
		gap: 2px;
		padding-top: 22px;
	}

	.add {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.hint,
	.error {
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	.hint {
		color: var(--color-text-subtle);
	}

	.error {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0 0 var(--space-2);
		color: var(--color-danger);
	}

	@media (max-width: 639px) {
		.step {
			grid-template-columns: 24px minmax(0, 1fr);
		}

		.step > div {
			grid-column: 2;
		}

		.buttons {
			grid-column: 2;
			padding-top: 0;
		}
	}
</style>
