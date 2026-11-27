<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { distinctReleases } from '#lib/core/qa/run.ts';
	import { DEFAULT_TIMEBOX } from '#lib/core/qa/types.ts';
	import {
		sessionErrors,
		TIMEBOX_MAX,
		TIMEBOX_MIN,
		type SessionField
	} from '#lib/core/qa/validation.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import { sessions } from '#lib/state/sessions.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import {
		sessionErrorsByField,
		TIMEBOX_OPTIONS,
		timeboxMinutes,
		type TimeboxChoice
	} from './present.ts';

	// Start session (design 13.3 P2-06; FR-130 AC-1). The list page loads both stores; release
	// suggestions come from runs and sessions alike, as one release groups both (FR-140).

	const uid = $props.id();

	let form: HTMLDivElement | undefined = $state();
	let charter = $state('');
	let choice: TimeboxChoice = $state(`${DEFAULT_TIMEBOX}` as TimeboxChoice);
	let custom = $state('');
	let release = $state('');
	let environment = $state('');
	let attempted = $state(false);
	let starting = $state(false);
	let saveError = $state('');

	const draft = $derived({
		charter,
		timeboxMinutes: timeboxMinutes(choice, custom),
		release,
		environment
	});
	const errors = $derived(
		attempted ? sessionErrorsByField(sessionErrors(draft)) : new Map<SessionField, string>()
	);
	const releases = $derived(distinctReleases([...runs.releases, ...sessions.releases]));
	const releaseListId = `${uid}-releases`;

	async function chooseTimebox(next: TimeboxChoice): Promise<void> {
		choice = next;
		if (next !== 'custom') return;
		await tick();
		focusField('timebox');
	}

	function focusField(field: SessionField): void {
		form?.querySelector<HTMLElement>(`[data-field="${field}"] :is(input, textarea)`)?.focus();
	}

	async function start(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (starting) return;
		attempted = true;
		const first = sessionErrors(draft)[0];
		if (first) {
			await tick();
			focusField(first.field);
			return;
		}
		starting = true;
		saveError = '';
		const started = await sessions.start({
			charter: charter.trim(),
			timeboxMinutes: draft.timeboxMinutes,
			release: release.trim(),
			environment: environment.trim()
		});
		starting = false;
		if (!started.ok) {
			saveError = WRITE_ERRORS[started.error];
			return;
		}
		void goto(resolve(`/sessions/view?id=${encodeURIComponent(started.value.id)}`));
	}
</script>

<div class="start" bind:this={form}>
	<FormPanel aria-label="Start session" onsubmit={start} data-testid="session-start-form">
		<div class="fields">
			<div data-field="charter" class="wide">
				<Field
					label="Charter"
					hint="What to explore, with what, to find what."
					error={errors.get('charter')}
				>
					{#snippet children(control)}
						<TextInput {...control} bind:value={charter} data-testid="session-charter" />
					{/snippet}
				</Field>
			</div>
			<div class="timebox wide">
				<!-- The group's legend names it for screen readers; this is its visible label. -->
				<span class="label" aria-hidden="true">Timebox</span>
				<div class="timebox-row">
					<SegmentedControl
						legend="Timebox"
						options={TIMEBOX_OPTIONS}
						value={choice}
						onchange={chooseTimebox}
					/>
					{#if choice === 'custom'}
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
										bind:value={custom}
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
							bind:value={release}
							list={releaseListId}
							data-testid="session-release"
						/>
					{/snippet}
				</Field>
				<datalist id={releaseListId}>
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
							bind:value={environment}
							data-testid="session-environment"
						/>
					{/snippet}
				</Field>
			</div>
		</div>
		{#snippet footer()}
			<span class="status">
				{#if saveError}
					<span class="error" role="alert" data-testid="session-start-error">{saveError}</span>
				{:else}
					The clock keeps counting with the tab closed, until you pause or end the session.
				{/if}
			</span>
			<Button type="submit" variant="primary" loading={starting} data-testid="session-start">
				{starting ? 'Starting…' : 'Start session'}
			</Button>
		{/snippet}
	</FormPanel>
</div>

<style>
	.start {
		max-width: 820px;
		margin-bottom: var(--space-8);
	}

	.fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		gap: var(--space-4);
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

	.timebox-row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.minutes {
		width: 100%;
		max-width: 280px;
	}

	.status {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.error {
		color: var(--color-danger);
	}

	@media (max-width: 639px) {
		.fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
