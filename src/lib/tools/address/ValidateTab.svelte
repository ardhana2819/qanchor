<script lang="ts">
	import Badge from '#lib/ui/Badge.svelte';
	import Field from '#lib/ui/Field.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { issueText, targetName, verdictText } from './verdict-text.ts';

	// Validate tab (FR-014, design S-02): paste one address, read the verdict live. The validators
	// load on the first keystroke, so the page itself carries no crypto code. Nothing is sent
	// anywhere (AC-6).

	type Core = typeof import('#lib/core/chains/verdict.ts');

	let text = $state('');
	let core = $state.raw<Core | null>(null);
	let loading = false;

	$effect(() => {
		if (text === '' || core || loading) return;
		loading = true;
		void import('#lib/core/chains/verdict.ts').then((module) => (core = module));
	});

	const check = $derived(core && text !== '' ? core.checkAddress(text) : null);
	const main = $derived(check ? verdictText(check.verdict) : null);
	const cleaned = $derived(check?.cleaned ? verdictText(check.cleaned.verdict) : null);
	// Changes whenever the verdict does, so the panel fades in again (design 2.4).
	const key = $derived(JSON.stringify([main, cleaned, check?.issues]));

	const BADGE = {
		valid: { variant: 'success', text: 'Valid' },
		risky: { variant: 'warning', text: 'Risky' },
		invalid: { variant: 'danger', text: 'Invalid' }
	} as const;
</script>

<div class="validate">
	<Field label="Address" hint="Paste one address. It is checked in this browser only.">
		{#snippet children(control)}
			<TextInput {...control} mono bind:value={text} />
		{/snippet}
	</Field>

	<!-- role="status" is a polite live region: the verdict is read when typing pauses. -->
	<div class="verdict" role="status" aria-label="Verdict">
		{#if check && main}
			{#key key}
				<div class="panel {check.issues.length > 0 ? 'invalid' : main.tone}">
					{#if check.issues.length > 0}
						<p class="headline">
							<Badge variant="danger">Invalid</Badge>
							<span>The input has characters that are not part of an address.</span>
						</p>
						<ul class="details">
							{#each check.issues as issue, i (i)}
								<li>{issueText(issue)}</li>
							{/each}
						</ul>
						{#if cleaned && check.cleaned}
							<div class="cleaned">
								<p class="label">Without them:</p>
								<p class="headline">
									<Badge variant={BADGE[cleaned.tone].variant}>{BADGE[cleaned.tone].text}</Badge>
									<span>{cleaned.headline}</span>
								</p>
								{#if cleaned.details.length > 0}
									<ul class="details">
										{#each cleaned.details as line (line)}<li>{line}</li>{/each}
									</ul>
								{/if}
							</div>
						{/if}
					{:else}
						<p class="headline">
							<Badge variant={BADGE[main.tone].variant}>{BADGE[main.tone].text}</Badge>
							<span>{main.headline}</span>
						</p>
						{#if check.verdict.kind === 'valid' && check.verdict.matches.length > 1}
							<ul class="details">
								{#each check.verdict.matches as match, i (i)}
									<li>{targetName(match.target)}</li>
								{/each}
							</ul>
						{/if}
						{#if main.details.length > 0}
							<ul class="details">
								{#each main.details as line (line)}<li>{line}</li>{/each}
							</ul>
						{/if}
					{/if}
				</div>
			{/key}
		{/if}
	</div>
</div>

<style>
	.validate {
		max-width: 820px;
	}

	/* One large field: the address is the only input on this tab. */
	.validate :global(input) {
		height: 44px;
		font-size: var(--text-md);
	}

	.verdict:not(:empty) {
		margin-top: var(--space-4);
	}

	.panel {
		padding: var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		/* Verdict change (design 2.4): a crossfade on opacity, once per new verdict. */
		animation: verdict-in var(--duration-fast) var(--ease-out);
	}

	.panel.invalid {
		border-color: var(--color-danger);
	}

	.panel.risky {
		border-color: var(--color-warning);
	}

	.headline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-weight: 500;
	}

	.details {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-4);
		color: var(--color-text-muted);
	}

	.cleaned {
		margin-top: var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border);
	}

	.label {
		margin: 0 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	@keyframes verdict-in {
		from {
			opacity: 0;
		}
	}
</style>
