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

### 2026-11-12: Implementation plan approved

* `docs/plan.md` approved: Phase 1 only, 46 tasks (T-001 to T-046) in milestones M0 (walking skeleton) and M1 to M3 (slices 1a to 1c). Phases 2 to 4 get tasks once they have FR IDs.
* Plan finding F-1 accepted: the theme preference is stored in `localStorage`, not IndexedDB (see ADR-014).

## Architecture decision records

Full context in `docs/architecture.md` (approved 2026-11-12). ADR-001 to ADR-010 were chosen option by option; ADR-011 to ADR-014 were accepted with the architecture document. The same approval added `@fontsource-variable/inter` and `@axe-core/playwright` to the stack in `CLAUDE.md`.

### ADR-001: Project structure by tool

* Status: Accepted
* Context: NFR-015 and FR-001 AC-5 require crypto code and datasets to load only on the routes that use them.
* Decision: `lib/core` (pure TypeScript domain code), `lib/tools/<tool>` (tool UI and state), `lib/ui` (shared components), plus `lib/net`, `lib/storage`, `lib/state`, `lib/workers`, `lib/config`.
* Rejected: layer-based folders (`components/`, `crypto/`, `stores/`): one tool's code spreads across folders and route-level code splitting is easier to break by accident.
* Consequences: `lib/core` must never import Svelte, DOM, or network code; enforced by review and an ESLint import restriction.

### ADR-002: Svelte 5 runes for state

* Status: Accepted
* Context: global state is only the theme and settings; everything else is local to a page.
* Decision: runes in `*.svelte.ts` modules. No state library.
* Rejected: `svelte/store` (older style in Svelte 5), any external store (not needed).
* Consequences: zero added bytes; state stays close to the component that owns it.

### ADR-003: Native BigInt for exact amounts

* Status: Accepted
* Context: FR-021 AC-6 and FR-030 AC-4 require exact results up to 78 digits.
* Decision: all amounts are `bigint` in base units; small own helpers parse and format decimal strings.
* Rejected: big.js / decimal.js (a dependency for what integer math already does; decimal precision settings are a source of bugs).
* Consequences: parse/format helpers need thorough unit tests, including D = 0 and D = 36 (EC-012, EC-013).

### ADR-004: Native Web Workers

* Status: Accepted
* Context: NFR-005 moves bulk address and dummy-data generation off the main thread.
* Decision: Vite's `new Worker(new URL(...), { type: 'module' })` with a small typed `{ type, payload }` message protocol.
* Rejected: Comlink (convenient, but a dependency for two jobs).
* Consequences: the protocol types live in `lib/workers/messages.ts`; workers run `lib/core` only.

### ADR-005: Own EVM ABI decoder

* Status: Accepted
* Context: FR-050 needs static and dynamic types, arrays, and tuples, with the precise error states of FR-052.
* Decision: write the decoder in `lib/core/abi`, using `@noble/hashes` keccak-256 for selectors.
* Rejected: micro-eth-signer (dependency outside `CLAUDE.md`; size and audit status of its ABI module not verified).
* Consequences: more code and tests; correctness rests on published ABI test vectors and malformed-input tests. Ships in slice 1c, after the first deploy.

### ADR-006: Tron lookup via the native HTTP API

* Status: Accepted
* Context: PRD left the Tron protocol to the tech plan. Both TronGrid's HTTP API and its JSON-RPC endpoint passed a CORS check on 2026-11-12.
* Decision: `/wallet/gettransactionbyid` and `/wallet/gettransactioninfobyid` on TronGrid (mainnet) and Nile (testnet).
* Rejected: Ethereum-compatible JSON-RPC (loses Tron-specific data such as energy and bandwidth fees and contract types).
* Consequences: a Tron-specific parser in `lib/core/tx`. TronGrid without an API key is rate-limited; the override setting covers users who have their own key or node.

### ADR-007: CSP through SvelteKit hash mode

* Status: Accepted
* Context: NFR-017 asks for a strict CSP, but FR-041 lets users point lookups at any endpoint URL.
* Decision: `kit.csp` in hash mode emits a CSP `<meta>` tag in every prerendered page: `script-src 'self'` plus hashes (including the inline theme script), `connect-src 'self' https: http://localhost:*`. Headers a meta tag cannot set (`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`) go in `static/_headers` for Cloudflare.
* Rejected: a fixed `connect-src` allowlist (breaks endpoint overrides).
* Consequences: `connect-src` cannot block exfiltration to arbitrary https hosts; acceptable because no secret is ever stored (NFR-012) and no third-party script runs.

### ADR-008: Hand-written validation for imports

* Status: Accepted
* Context: FR-003 AC-4 requires rejecting invalid import files with a named reason. The schema has four small record types.
* Decision: type guards in `lib/storage/validate.ts` that return a `Result` with the first problem found.
* Rejected: zod (estimated ~13 KB gzip), valibot (estimated 1 to 2 KB); both add a dependency for four record shapes.
* Consequences: guards must be updated with every schema version; covered by unit tests per version.

### ADR-009: Own bundle-size check

* Status: Accepted
* Context: NFR-001 caps initial JS for the default route at 80 KB gzip and requires CI to enforce it.
* Decision: `scripts/check-bundle-size.mjs` reads the build output, gzips the JS the default route loads, and fails above the limit.
* Rejected: size-limit (a dependency stack for one number).
* Consequences: the script must follow how SvelteKit names entry chunks; if that changes in an upgrade, the script is updated in the same PR.

### ADR-010: Inter through @fontsource-variable/inter

* Status: Accepted
* Context: design brief v0.3 uses Inter as the only custom font.
* Decision: import only the Latin subset of `@fontsource-variable/inter`; the woff2 file is self-hosted with the site.
* Rejected: hand-subsetting a woff2 into `static/` (manual updates and licensing bookkeeping).
* Consequences: a new dependency outside the `CLAUDE.md` list (recorded here per NFR-018). The file adds no JS, but it can affect LCP; measured in slice 1a, with the system font as the agreed fallback.

### ADR-011: Prerendered routes with a 404.html fallback

* Status: Accepted
* Context: NFR-022 requires static HTML per route and a not-found state for unknown URLs.
* Decision: `prerender = true` and `trailingSlash = 'never'` on every route; adapter-static writes a client-rendered `404.html`. Cloudflare Pages serves the nearest `404.html` for unmatched paths and does not fall back to SPA mode when one exists (Cloudflare docs, read 2026-11-12).
* Rejected: SPA fallback to `index.html` (would hide not-found from crawlers and contradict the review 1 decision to prerender).
* Consequences: the HTTP status Cloudflare sends with `404.html` is not documented; checked on the first preview deploy. Phase 2 record pages use query-string IDs.

### ADR-012: Default endpoints from a verified list

* Status: Accepted
* Context: the PRD forbids listing a default endpoint before its browser CORS behaviour is verified.
* Decision: the defaults in `docs/architecture.md` section 5, checked on 2026-11-12. publicnode.com for Ethereum, Polygon, and Solana mainnet; chain operators' own endpoints for BNB, Arbitrum, Base, Solana Devnet, and Tron; mempool.space for Bitcoin, pending verification.
* Rejected: `polygon-rpc.com` (HTTP 401), `rpc-amoy.polygon.technology` (no response), `api.mainnet-beta.solana.com` (HTTP 403 from the test network).
* Consequences: the list is re-checked before slice 1c. Bitcoin defaults stay unlisted until a check succeeds.

### ADR-013: Errors as values in core and network code

* Status: Accepted
* Context: most failures in this app are expected (bad input, endpoint errors, undecodable data) and each needs specific copy (FR-042, FR-052, docs/design.md section 7).
* Decision: `lib/core` and `lib/net` return `Result<T, E>` with a typed `code`; only bugs throw, and a single layout error boundary catches them.
* Rejected: throwing for expected failures (callers forget to catch; error types are untyped in TypeScript).
* Consequences: every tool keeps one map from error code to user copy.

### ADR-014: IndexedDB schema v1, theme in localStorage, replace-all import

* Status: Accepted (theme storage revised by the owner on 2026-11-12, plan finding F-1)
* Context: FR-002 AC-1, FR-003, FR-070 to FR-073, NFR-016, EC-002, EC-003.
* Decision: database `qanchor` v1 with stores `endpoints`, `wallets`, `faucets`. The theme preference lives in `localStorage` (`qanchor.theme`) because the pre-paint script must read it synchronously. Fetched balances stay in memory only. Import clears and rewrites all stores in one transaction, then writes the theme; the export file carries both.
* Rejected: theme in IndexedDB (asynchronous, cannot run before first paint, so dark-mode users would see a light flash); persisting balances (stale on the next visit, extra migration); localStorage for all data (kickoff decision, size limit).
* Consequences: two storage mechanisms to export and import; a schema change needs a migration step and a new export `schemaVersion`.

## Build order

1. Blockchain toolkit + dummy data (slices 1a, 1b, 1c; first deploy at the end of 1a)
2. Test cases, test runs, bug reports
3. PRD generator
4. Demo mode

## Out of scope (for now)

APK + emulator + automation from Firebase App Distribution (separate, much heavier project).
