<script lang="ts">
	import { tick } from 'svelte';
	import { distinctReleases } from '#lib/core/qa/run.ts';
	import { TIMEBOX_MAX, TIMEBOX_MIN, type SessionField } from '#lib/core/qa/validation.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import { sessions } from '#lib/state/sessions.svelte.ts';
	import Field from '#lib/ui/Field.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { TIMEBOX_OPTIONS, type TimeboxChoice } from './present.ts';
	import type { SessionForm } from './session-form.svelte.ts';

	// Charter, timebox, release, and environment of a session (design 13.3 P2-06; FR-130 AC-1),
	// in Start session and in Edit details. Release suggestions come from runs and sessions alike,
	// as one release groups both (FR-140).

	interface Props {
		form: SessionForm;
		/** One column, e.g. in a dialog. */
		narrow?: boolean;
	}

	let { form, narrow = false }: Props = $props();

	const uid = $props.id();
	let fields: HTMLDivElement | undefined = $state();
	const releases = $derived(distinctReleases([...runs.releases, ...sessions.releases]));
	const errors = $derived(form.errors);

	async function chooseTimebox(next: TimeboxChoice): Promise<void> {
		form.choice = next;
		if (next !== 'custom') return;
		await tick();
		focus('timebox');
	}

	/** Moves focus to a field, e.g. the first one with an error. */
	export function focus(field: SessionField): void {
		fields?.querySelector<HTMLElement>(`[data-field="${field}"] :is(input, textarea)`)?.focus();
	}
</script>

<div class="fields" class:narrow bind:this={fields}>
	<div data-field="charter" class="wide">
		<Field
			label="Charter"
			hint="What to explore, with what, to find what."
			error={errors.get('charter')}
		>
			{#snippet children(control)}
				<TextInput {...control} bind:value={form.charter} data-testid="session-charter" />
			{/snippet}
		</Field>
	</div>
	<div class="wide">
		<!-- The group's legend names it for screen readers; this is its visible label. -->
		<span class="label" aria-hidden="true">Timebox</span>
		<div class="timebox">
			<SegmentedControl
				legend="Timebox"
				options={TIMEBOX_OPTIONS}
				value={form.choice}
				onchange={chooseTimebox}
			/>
			{#if form.choice === 'custom'}
				<div data-field="timebox" class="minutes">
					<Field
						label="Minutes"
						hint="From {TIMEBOX_MIN} to {TIMEBOX_MAX}."
						error={errors.get('timebox')}
					>
						{#snippet children(control)}
							<TextInput
								{...control}
								inputmode="numeric"
								bind:value={form.custom}
								data-testid="session-timebox-minutes"
							/>
						{/snippet}
					</Field>
				</div>
			{/if}
		</div>
	</div>
	<div data-field="release">
		<Field
			label="Release (optional)"
			hint="Sessions and runs with the same release are grouped, whatever the letter case."
			error={errors.get('release')}
		>
			{#snippet children(control)}
				<TextInput
					{...control}
					bind:value={form.release}
					list="{uid}-releases"
					data-testid="session-release"
				/>
			{/snippet}
		</Field>
		<datalist id="{uid}-releases">
			{#each releases as known (known)}<option value={known}></option>{/each}
		</datalist>
	</div>
	<div data-field="environment">
		<Field
			label="Environment (optional)"
			hint="Build, device, OS, browser, network."
			error={errors.get('environment')}
		>
			{#snippet children(control)}
				<Textarea
					{...control}
					rows={1}
					grow
					bind:value={form.environment}
					data-testid="session-environment"
				/>
			{/snippet}
		</Field>
	</div>
</div>

<style>
	.fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		gap: var(--space-4);
	}

	.fields.narrow {
		grid-template-columns: minmax(0, 1fr);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.label {
		display: block;
		margin-bottom: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.timebox {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.minutes {
		width: 100%;
		max-width: 280px;
	}

	@media (max-width: 639px) {
		.fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
