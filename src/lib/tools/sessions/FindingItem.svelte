<script lang="ts">
	import { tick } from 'svelte';
	import { findingTime } from '#lib/core/qa/session.ts';
	import { FINDING_TYPE_LABELS, type Finding, type FindingType } from '#lib/core/qa/types.ts';
	import { findingErrors } from '#lib/core/qa/validation.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { sessions } from '#lib/state/sessions.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Field from '#lib/ui/Field.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import { saveErrorText } from '#lib/tools/runs/present.ts';
	import { isTextField, pastedFiles, pasteAction } from '#lib/tools/runs/screenshots.ts';
	import type { FindingShots, ShotTarget } from './finding-shots.svelte.ts';
	import FindingScreenshots from './FindingScreenshots.svelte';
	import { FINDING_TYPE_OPTIONS, findingTextError } from './present.ts';

	// One finding in the list (design 13.3 P2-06; FR-131 AC-1, AC-2): its session time, type,
	// text, and thumbnails. Edit changes its type and text in place, and adds or removes
	// screenshots; its session time stays.

	interface Props {
		finding: Finding;
		shots: FindingShots;
		/** Added during this visit: plays the enter animation (design 13.6). */
		fresh: boolean;
		ondelete: (finding: Finding) => void;
	}

	let { finding, shots, fresh, ondelete }: Props = $props();

	const BADGES = {
		bug: { variant: 'danger', icon: 'bug' },
		question: { variant: 'warning', icon: 'info' },
		idea: { variant: 'neutral', icon: 'dot' },
		note: { variant: 'subtle', icon: 'dot' }
	} as const;

	let item: HTMLLIElement | undefined = $state();
	let editing = $state(false);
	let type: FindingType = $state('note');
	let text = $state('');
	let attempted = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let screenshots: FindingScreenshots | undefined = $state();

	const target: ShotTarget = $derived({ ...finding, saved: true });
	const error = $derived(attempted ? findingTextError(findingErrors(text)) : undefined);
	const badge = $derived(BADGES[finding.type]);

	async function edit(): Promise<void> {
		type = finding.type;
		text = finding.text;
		attempted = false;
		saveError = '';
		editing = true;
		await tick();
		item?.querySelector('textarea')?.focus();
	}

	async function close(): Promise<void> {
		editing = false;
		await tick();
		item?.querySelector<HTMLElement>('[data-testid="finding-edit"]')?.focus();
	}

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		attempted = true;
		if (findingErrors(text).length > 0) {
			item?.querySelector('textarea')?.focus();
			return;
		}
		saving = true;
		const saved = await sessions.saveFinding({ ...finding, type, text: text.trim() });
		saving = false;
		if (!saved.ok) {
			saveError = saveErrorText(saved.error);
			return;
		}
		notify.announce('Finding saved.');
		await close();
	}

	function onpaste(event: ClipboardEvent): void {
		if (!editing) return;
		const files = pastedFiles(event.clipboardData);
		const action = pasteAction(files, isTextField(event.target));
		if (action === 'default') return;
		event.preventDefault();
		if (action === 'add') void screenshots?.add(files);
		else screenshots?.refuse({ kind: 'no-image' });
	}
</script>

<li class="finding" class:fresh bind:this={item} {onpaste} data-testid="finding">
	<div class="head">
		<span class="time" data-testid="finding-time">{findingTime(finding)}</span>
		<Badge variant={badge.variant} icon={badge.icon}>{FINDING_TYPE_LABELS[finding.type]}</Badge>
		{#if !editing}
			<span class="actions">
				<Button size="sm" variant="ghost" onclick={edit} data-testid="finding-edit">
					Edit<span class="visually-hidden"> the finding {findingTime(finding)}</span>
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onclick={() => ondelete(finding)}
					data-testid="finding-delete"
				>
					Delete<span class="visually-hidden"> the finding {findingTime(finding)}</span>
				</Button>
			</span>
		{/if}
	</div>

	{#if editing}
		<form
			class="edit"
			novalidate
			onsubmit={save}
			aria-label="Edit the finding {findingTime(finding)}"
		>
			<div class="type">
				<SegmentedControl
					legend="Finding type"
					options={FINDING_TYPE_OPTIONS}
					value={type}
					onchange={(next) => (type = next)}
				/>
			</div>
			<Field label="Finding" {error}>
				{#snippet children(control)}
					<Textarea {...control} rows={3} grow bind:value={text} data-testid="finding-edit-text" />
				{/snippet}
			</Field>
			<FindingScreenshots bind:this={screenshots} {shots} {target} />
			<div class="edit-actions">
				{#if saveError}<span class="error" role="alert">{saveError}</span>{/if}
				<Button onclick={close}>Cancel</Button>
				<Button type="submit" variant="primary" loading={saving} data-testid="finding-save">
					Save
				</Button>
			</div>
		</form>
	{:else}
		<p class="text" data-testid="finding-text-shown">{finding.text}</p>
		<FindingScreenshots {shots} {target} readonly />
	{/if}
</li>

<style>
	.finding {
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--color-border);
	}

	/* Finding added (design 13.6): as results enter, one row. */
	.fresh {
		animation: enter var(--duration-base) var(--ease-out) backwards;
	}

	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.time {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.actions {
		display: flex;
		gap: var(--space-1);
		margin-left: auto;
	}

	.text {
		max-width: 80ch;
		margin: var(--space-2) 0 0;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	.finding :global([data-testid='finding-screenshots']) {
		margin-top: var(--space-3);
	}

	.edit {
		display: grid;
		gap: var(--space-4);
		margin-top: var(--space-3);
	}

	.edit-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.error {
		margin-right: auto;
		color: var(--color-danger);
	}

	.type {
		max-width: 420px;
	}
</style>
