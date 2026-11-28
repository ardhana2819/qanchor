<script lang="ts">
	import { tick } from 'svelte';
	import { elapsedMs } from '#lib/core/qa/session.ts';
	import {
		DEFAULT_FINDING_TYPE,
		type Finding,
		type FindingType,
		type Session
	} from '#lib/core/qa/types.ts';
	import { findingErrors } from '#lib/core/qa/validation.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { sessions } from '#lib/state/sessions.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import { saveErrorText } from '#lib/tools/runs/present.ts';
	import { isTextField, pastedFiles, pasteAction } from '#lib/tools/runs/screenshots.ts';
	import type { FindingShots, ShotTarget } from './finding-shots.svelte.ts';
	import FindingScreenshots from './FindingScreenshots.svelte';
	import { FINDING_TYPE_OPTIONS, findingTextError } from './present.ts';

	// The finding composer (design 13.3 P2-06; FR-131 AC-1, AC-4): type, text, and screenshots;
	// Add finding or Ctrl/Cmd+Enter saves it with the session time now, and focus goes back to
	// the text for the next one. The type is kept, as findings often come in runs of one type.

	interface Props {
		session: Session;
		shots: FindingShots;
		/** A finding was added, so the list can show it entering. */
		onadded: (finding: Finding) => void;
	}

	let { session, shots, onadded }: Props = $props();

	let text = $state('');
	let type: FindingType = $state(DEFAULT_FINDING_TYPE);
	let draftId = $state(crypto.randomUUID());
	let attempted = $state(false);
	/** Saves in flight: each submit carries its own finding, so the next can start at once. */
	let saving = $state(0);
	let saveError = $state('');
	let field: HTMLDivElement | undefined = $state();
	let screenshots: FindingScreenshots | undefined = $state();

	const target: ShotTarget = $derived({ id: draftId, sessionId: session.id, at: 0, saved: false });
	const error = $derived(attempted ? findingTextError(findingErrors(text)) : undefined);

	function focusText(): void {
		field?.querySelector('textarea')?.focus();
	}

	async function add(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		attempted = true;
		if (findingErrors(text).length > 0) {
			focusText();
			return;
		}
		saving++;
		saveError = '';
		const now = Date.now();
		const pending = shots.pending;
		const submitted = text;
		const finding: Finding = {
			id: draftId,
			sessionId: session.id,
			type,
			text: submitted.trim(),
			at: elapsedMs(session, now),
			createdAt: now,
			updatedAt: now
		};
		// The field is cleared at once, so the next finding can be typed while this one saves.
		text = '';
		attempted = false;
		draftId = crypto.randomUUID();
		const saved = await sessions.saveFinding(finding, pending);
		saving--;
		if (!saved.ok) {
			if (text === '') text = submitted;
			saveError = saveErrorText(saved.error);
			return;
		}
		shots.saved(pending);
		screenshots?.reset();
		onadded(saved.value);
		notify.announce('Finding added.');
		await tick();
		focusText();
	}

	// Paste anywhere in the composer (design 13.5, EC-029): an image wins, also in the text field.
	function onpaste(event: ClipboardEvent): void {
		const files = pastedFiles(event.clipboardData);
		const action = pasteAction(files, isTextField(event.target));
		if (action === 'default') return;
		event.preventDefault();
		if (action === 'add') void screenshots?.add(files);
		else screenshots?.refuse({ kind: 'no-image' });
	}
</script>

<div class="composer" {onpaste}>
	<FormPanel aria-label="Add a finding" onsubmit={add} data-testid="finding-composer">
		<div class="fields">
			<div class="type">
				<SegmentedControl
					legend="Finding type"
					options={FINDING_TYPE_OPTIONS}
					value={type}
					onchange={(next) => (type = next)}
				/>
			</div>
			<div bind:this={field}>
				<Field label="Finding" hint="Ctrl or Cmd + Enter adds it." {error}>
					{#snippet children(control)}
						<!-- The page opens ready for the first finding (design J-10 step 2). On a client-side
						navigation SvelteKit moves focus to the [autofocus] element instead of the body. -->
						<Textarea
							{...control}
							rows={3}
							grow
							autofocus
							bind:value={text}
							data-testid="finding-text"
						/>
					{/snippet}
				</Field>
			</div>
			<FindingScreenshots bind:this={screenshots} {shots} {target} />
		</div>
		{#snippet footer()}
			<span class="status">
				{#if saveError}
					<span class="error" role="alert" data-testid="finding-save-error">{saveError}</span>
				{/if}
			</span>
			<Button type="submit" variant="primary" loading={saving > 0} data-testid="finding-add">
				Add finding
			</Button>
		{/snippet}
	</FormPanel>
</div>

<style>
	.composer {
		margin-bottom: var(--space-8);
	}

	.fields {
		display: grid;
		gap: var(--space-4);
	}

	.status {
		font-size: var(--text-xs);
	}

	.error {
		color: var(--color-danger);
	}

	.type {
		max-width: 420px;
	}
</style>
