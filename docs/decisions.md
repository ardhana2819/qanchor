# QAnchor: Decisions and Context

## What it is

Web app to make manual QA easier, focused on blockchain/crypto testing. For personal use and as an interview portfolio piece.

## Differentiator

Not another TestRail/Qase clone. The unique value is the blockchain toolkit and a test case generator that understands the crypto domain.

## Agreed features

1. Blockchain toolkit
   * Valid + invalid address generator (EVM, BTC legacy/segwit/taproot, Solana, Tron, etc.). Invalid variants: wrong EIP-55 checksum, wrong length, testnet vs mainnet prefix, look-alike addresses from other chains.
   * Amount edge cases: token decimals (USDT 6 vs 18), dust, fee > balance, comma vs dot, scientific notation, above max.
   * Unit converter (wei/gwei/ether, sats, lamports), multi-chain tx hash lookup, calldata decoder.
   * Checklists/templates: deposit, withdraw, swap, staking, network mismatch, memo/tag (XRP, XLM, TON), stocks (market hours, fractional, corporate actions).
   * Testnet wallet tracker + faucet links (faucets not automated).
2. Dummy data: Indonesian data (names, +62 phones, addresses, valid-format fake NIK/NPWP, dummy bank accounts), export CSV/JSON/SQL, seed, scenario presets.
3. Lightweight QA flow: test cases, test runs (pass/fail/blocked + screenshot paste), Jira-format bug report generator, exploratory session notes, release summary.
4. Generate from PRD: upload PDF/DOCX/MD or paste -> numbered editable requirements -> ambiguity detection as PM question list -> test cases (positive, negative, boundary, auto-injected blockchain edge cases) -> source quote per test case -> traceability matrix -> test run -> bug report.
5. Demo mode: sample crypto PRD (e.g. "Withdraw USDT multi-network") with pre-generated results, usable without an API key.

## Decision log

### 2026-11-12: Kickoff

* Framework: Svelte 5 + SvelteKit (adapter-static, SPA) + TypeScript + Vite. Why: smallest runtime among options considered (React, Preact, vanilla), built-in routing and per-route code splitting.
* Crypto libs: @noble/* and @scure/*. Why: small, audited, tree-shakeable; ethers and @solana/web3.js are much heavier.
* Storage: IndexedDB via `idb`. Why: localStorage (~5 MB) can't hold screenshot blobs.
* AI: Claude API, BYOK, generic provider interface, phase 3. Keys stay in the browser; UI must warn about it.
* Tx lookup: direct JSON-RPC to public RPCs, user-overridable URL. Public RPCs can rate-limit, so error states must be clear.
* PRD parsing: pdfjs-dist + mammoth, lazy-loaded on the PRD page only (both are hundreds of KB).
* Dummy data: own generator + small datasets + seeded PRNG instead of faker. Why: lighter, full control over NIK/NPWP/+62 rules.
* Testing: Vitest, Playwright, svelte-check, ESLint, Prettier; GitHub Actions on every PR.
* Deploy: Cloudflare Pages. Why: GitHub Pages from a private repo needs a paid plan.
* Performance budget: see CLAUDE.md. Targets are not yet measured; revise with real data if unrealistic.
* Design: clean utilitarian, light + dark (system default), compact, plain CSS + CSS variables.

### 2026-11-12: PRD review 1

Changes to kickoff decisions:

* Deploy: first production deploy to Cloudflare Pages at the end of slice 1a, then automatic deploy on every merge to main. Phase 4 becomes demo mode only. Why: a live link is needed early for the job search; it also lets Lighthouse/LCP be measured on the real site. Supersedes "Deploy (phase 4)".
* Rendering: prerender every route to static HTML instead of a pure SPA fallback. Why: tool pages are static, so LCP improves and deep links work without a fallback trick; bundle size is unchanged. Supersedes "SPA mode". Consequences: browser-only APIs must not run at build time; pages for user-created records (Phase 2) cannot be prerendered and need a client-rendered fallback or query-string IDs.
* Secrets: the app stores no private keys or mnemonics, encrypted or not. The wallet tracker keeps address + label + notes. Why: passphrase encryption adds UX, crypto code, and tests for a rarely used feature, and "never stores private keys" is a stronger portfolio story. Supersedes the "testnet keys/mnemonics are client-only" constraint.
* Bitcoin tx lookup: Esplora-style REST API (e.g. mempool.space), user-overridable URL. Why: Bitcoin has no public JSON-RPC that browsers can call. All other chains stay on JSON-RPC.

New decisions:

* Phase 1 slices: 1a app shell, unit converter, amount edge cases, address generator + validator, first deploy; 1b dummy data, checklists; 1c tx lookup, calldata decoder, testnet wallet tracker.
* Address chains: EVM, Bitcoin (P2PKH, P2SH, P2WPKH, P2TR), Solana, Tron. XRP/XLM/TON later as a separate task.
* Address generation uses the CSPRNG only, no seed. Why: a seeded key is predictable.
* Address validator (paste an address, get chain/type/network/validity) is in Phase 1.
* The "testnet only" check in the wallet tracker can only be enforced for Bitcoin; EVM, Solana, and Tron addresses are identical on mainnet and testnet. Accepted, since only public addresses are stored.
* Tx lookup chains: Ethereum, BNB Smart Chain, Polygon, Arbitrum, Base, Solana, Tron, Bitcoin. Default endpoints must be verified for browser CORS before they are listed. Tron protocol (EVM-compatible JSON-RPC vs native HTTP) is chosen in the tech plan.
* Calldata decoder: EVM-only, built-in selector table, no online signature lookup.
* Checklists: read-only + Markdown export in Phase 1.
* Dummy data: "identifier realism" setting (realistic by default, non-colliding as an option) for NIK and phone; NPWP in both 15-digit and 16-digit formats; address dataset covers provinces and kabupaten/kota plus a sample of kecamatan/kelurahan; SQL export as generic INSERT with PostgreSQL or MySQL identifier quoting; presets include "duplicate NIK across rows".
* JSON import replaces all data (no merge). Unit converter rejects a comma with a hint.
* Limits: 500 addresses and 10,000 dummy rows per generation, 10 s endpoint timeout, decimals 0 to 36.
* UI language: English. Default route: toolkit index. No offline/service worker in Phase 1.
* Performance measurement: Lighthouse, LCP, and idle heap are measured on the live site.

The questions left open after review 1 were resolved in review 2 below.

### 2026-11-12: PRD review 2 (PRD v0.3 approved)

* PRD status: approved at v0.3. All remaining proposals and assumptions in the PRD were approved as a block. Factual details that still need a primary source are tagged [VERIFY] and listed in docs/prd.md section 9.3; approval does not make them true.
* Deploy mechanism: Cloudflare Pages Git integration. Cloudflare builds and deploys every push to main and builds a preview for every PR. Why: nothing to store in GitHub and no deploy workflow to maintain. Known gap: Cloudflare does not wait for GitHub Actions, and GitHub Free cannot enforce required status checks on a private repo, so "merge only when CI is green" is a manual rule. A PR merged while red would be deployed.
* Cloudflare Pages project name: qanchor. No custom domain. Public PR preview deployments are acceptable.
* Private keys are never displayed: FR-013 (opt-in private key display) is dropped and its ID retired. Why: "this app never shows or stores a private key" is a stronger and simpler claim, and it removes a warning panel and a test. Supersedes the review 1 answer that keys could be shown on opt-in.
* On-demand balance in the wallet tracker (FR-073) is in Phase 1, slice 1c.
* Tx lookup networks: mainnet plus one testnet for every chain, including Solana, Tron, and Bitcoin.
* While Phase 1 is being built, the live site lists shipped tools only. The roadmap lives in the README.

### 2026-11-12: Design brief (v0.2 approved)

Decided by the owner:

* Design scope: the whole app, phases 1 to 4. Phase 2 to 4 screens are outline-level proposals until those phases get FR IDs.
* Visual direction: "Anchor". Cool neutrals, one teal accent (`#0F766E` light, `#2DD4BF` dark), Inter for UI text, system monospace for data. Why: it gives the portfolio piece an identity while staying inside "clean utilitarian". Alternatives considered: "Graphite" (monochrome, system fonts) and "Ledger" (mono-forward, amber accent).
* Visual references stay Linear and Vercel only.
* Avoided on request: generic purple gradient / "AI look", dark neon "web3" look.
* Style, theme, density, and styling approach from kickoff are confirmed unchanged.

Consequences:

* Inter is the first and only custom font: one self-hosted variable file, Latin subset. Its size is not yet measured; it is outside the JS budget but can affect LCP. To be measured in slice 1a.
* All colour pairs in `docs/design.md` were computed against WCAG 2.1 AA and pass.

Approved as recommended (`docs/design.md` section 12): body text 13 px; switch to the system font if Inter pushes LCP above 1.5 s; no spinner, text status and determinate progress only; sidebar groups "Blockchain" then "Data"; route names as proposed, adjustable in the tech plan; skip link and inline SVG icons; Phase 2 to 4 screens as direction only; checklist detail on its own route.

Revised after reviewing the prototypes (design brief v0.3):

* Type and control scale raised one step: body text 14 px (was 13 px), smallest text 13 px (was 12 px), page title 24 px, default control height 36 px (was 28 px). Why: the owner found the first scale too small to read comfortably. Density stays "compact" in spirit (flat layout, tables first), but rows and controls are larger. Supersedes "body text 13 px" above.
* Selects drop the native arrow and use a themed chevron inset from the right edge. Why: the native arrow sat flush against the border.

## Build order

1. Blockchain toolkit + dummy data (slices 1a, 1b, 1c; first deploy at the end of 1a)
2. Test cases, test runs, bug reports
3. PRD generator
4. Demo mode

## Out of scope (for now)

APK + emulator + automation from Firebase App Distribution (separate, much heavier project).
