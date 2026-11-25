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

### 2026-11-12: Toolchain versions (T-001)

* SvelteKit 3.2, Svelte 5.57, Vite 8.3, adapter-static 4, ESLint 10, Prettier 3.10. TypeScript pinned to `~6.0` because SvelteKit 3 requires TypeScript 6 and typescript-eslint and svelte-check do not support TypeScript 7 yet. Revisit when they do.
* SvelteKit 3 conventions used from the start: config in `vite.config.ts`, `#lib/*` instead of `$lib`, `$app/env` instead of `$app/environment`.

### 2026-11-12: CSP spike results (T-004)

Verified in Chromium and Firefox with E2E tests; WebKit runs in CI.

* `kit.csp` in hash mode hashes only the inline scripts SvelteKit generates. A script written into `src/app.html` is not hashed, and nonces are forbidden for prerendered pages. Decision: `vite.config.ts` reads the single inline script from `src/app.html` and adds its SHA-256 to `script-src`; the build fails if `app.html` has more or fewer than one inline script.
* A CSP `<meta>` tag only governs content that follows it, and SvelteKit emits it at `%sveltekit.head%`. A script placed before that placeholder runs unchecked. Decision: the theme script sits after `%sveltekit.head%`; it is still synchronous and runs before `<body>` is painted. Proven with a mutation test: a wrong hash now blocks the script and fails the E2E suite.
* SvelteKit's route announcer is created with an inline `style` attribute after hydration, which `style-src 'self'` blocks. Decision: `style-src-attr 'unsafe-inline'` (ADR-007 amended). Rejected: hashing the announcer's style string with `'unsafe-hashes'` (tied to a SvelteKit internal that can change on any upgrade); `style-src 'unsafe-inline'` (would also allow `<style>` elements).
* The `%sveltekit.body%` wrapper uses the class `app-root` (`display: contents` in `src/app.css`) instead of an inline style attribute.
* `404.html` carries the same CSP meta tag, and `vite preview` answers unknown URLs with status 404. Cloudflare's status code is still checked in T-024.
* `static/_headers` sets `frame-ancestors 'none'`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`. These take effect only on Cloudflare Pages and are checked on the live site in T-024.
* The theme pre-paint script itself (FR-002 AC-1) shipped with this spike; the theme control UI follows in T-007.

### 2026-11-13: Project rules move from "lightweight" to "polished & optimized"

Decided by the owner, following an update to the owner's global rules (`~/.claude/skills/kickoff/template.md`):

* `CLAUDE.md` section 3 "LIGHTWEIGHT & SIMPLE BY DEFAULT" is replaced by "POLISHED & OPTIMIZED". Visual quality becomes a primary goal; performance is a budget to stay within, not a number to minimize at the cost of the experience. Purposeful animation and micro-interactions are encouraged; custom fonts, icons, and visual effects are allowed when they strengthen the product's identity, with their size impact stated. A performance concern that would noticeably reduce visual quality is raised as a trade-off for the owner to decide, never applied silently.
* Goal line: "lightweight" becomes "polished, efficient".
* Performance budget gains "animations at 60fps". Every existing number stays: initial JS <= 80 KB gzip, Lighthouse Performance >= 95 (desktop), LCP < 1.5 s, idle CPU ~0%, idle JS heap <= 30 MB, no long task > 200 ms, no continuous animations, reduced motion respected, screenshots compressed.
* Unchanged: everything in section 3 about event-driven runtime, lazy loading, cleanup, code simplicity, and measuring instead of guessing.

Consequences:

* The design brief's Phase 1 (visual direction) is redone under the new rules. Until the owner picks a direction, `docs/design.md` v0.3 and the tokens already built in T-005 stay in force; a new direction that changes tokens, fonts, or motion is applied as its own task after approval.
* Reports for changes that add animation also report the measured frame rate.

Design inputs for the redone Phase 1, chosen by the owner:

* Style: "utilitarian + polish". The layout stays tool-first and information-dense; a polish layer adds subtle depth, purposeful motion, and distinctive details. `CLAUDE.md` Design line updated accordingly. Alternatives considered: "more expressive" (bolder colour, custom illustration, roomier layout) and "unchanged".
* Motion: "subtle and purposeful". 120 to 240 ms CSS transitions for feedback and continuity (staggered results, copy confirmation, tab and menu movement); near-zero added JS. Alternatives considered: "rich" (View Transitions between pages, animated counters) and "minimal" (hover and focus only).
* References: Linear and Vercel, plus Raycast and Arc.
* Still avoided: generic purple gradient / "AI look", dark neon "web3" look.

Visual direction (redone Phase 1), chosen by the owner:

* **A "Anchor, refined"**: the approved v0.3 colours, type, and layout stay; a polish layer adds subtle depth on form panels and the primary button, and a motion catalogue of event-driven micro-interactions (`docs/design.md` v0.4, sections 2.3 and 2.4). Font cost: +0 KB. Why: it meets the new rules without discarding approved decisions or merged work (T-005 tokens stay). Alternatives considered (`prototype/directions.html`): "Tidewater" (deeper Raycast-like panels, JetBrains Mono, about +40 KB, T-005 rework) and "Ledger ink" (warm palette, Geist fonts, about +25 KB net, T-005 rework).
* Design brief v0.4 approved with its four new decisions, all as recommended: stagger capped at the first 12 result rows; depth on form panels and the primary button only; theme changes are instant; the polish layer is built in T-008, and the small-screen menu animation in T-013.

### 2026-11-13: T-008 split and a `/components` reference page

* T-008 is split into T-008a (tokens, form and status primitives, form panel) and T-008b (Toast + live region, Data table, Dialog). Why: one PR with 14 components and the motion layer would be hard to review, and the riskier parts (focus handling, the 500-row stagger trace) are in T-008b.
* The primitives are tested on a prerendered `/components` page that lists each one in its states, is not linked from the navigation, and is screen S-12 in `docs/design.md`. Why: no tool page exists yet, and E2E, the axe scan, and the 60 fps trace all need a real page; it also shows the design system to an interviewer. Rejected: Vitest browser mode (a second test environment and new dependencies, and the trace would still need a page); deferring all checks to the first tool pages (the components would ship unverified).
* `@axe-core/playwright` is added as a dev dependency for the accessibility scan already listed in `CLAUDE.md`. It is not shipped.

### 2026-11-13: Storage layer dependencies (T-010)

* `idb` 8.0 is added as the IndexedDB wrapper named at kickoff. It loads on demand with the storage code (1.8 KB gzip chunk together), not in the initial bundle.
* `fake-indexeddb` is added as a dev dependency, revising plan note N-1. Why: the rules that matter most (a quota error or a bad record rolls back the whole batch; a schema upgrade in another tab closes this connection) cannot be triggered on demand in a real browser. `fake-indexeddb` implements the IndexedDB spec in Node, including transaction rollback, so `db.ts` runs unchanged in Vitest. Browser-specific failures (blocked or missing IndexedDB) stay in Playwright. Rejected: exposing test hooks in the production build to drive writes from E2E.

### 2026-11-13: Settings import confirmation (prototype test, T-011)

* After testing `prototype/settings.html`, the owner chose the confirmation dialog that shows, per type, what is stored now against what the import leaves, with drops in the danger colour (dialog B). Rejected: a dialog with the file's counts only (dialog A), which does not show what will be lost.
* No "Stored now" summary on the Settings page. Why: the dialog shows those counts at the moment they matter, the page stays short, and the page does not read IndexedDB on every visit.
* With storage unavailable, Export is disabled together with Import [ASSUMPTION, not tested in the prototype]. Why: an export would contain no records and could be mistaken for a real backup.

### 2026-11-14: Token decimals for the amount presets verified (T-014)

Every preset value in FR-020 AC-2 matches its primary source; nothing changes in the PRD. Tokens were read on-chain with `decimals()`, `symbol()`, and `name()` on 2026-11-14 (Ethereum block `0x1930224`, BNB Smart Chain block `0x7f50910`); native coins have no contract, so their unit is taken from the protocol's own docs or source.

| Preset | Decimals | Source |
| --- | --- | --- |
| ETH | 18 | ethereum.org, [Intro to Ether](https://ethereum.org/en/developers/docs/intro-to-ether/): wei is the smallest denomination, 10^-18 ether |
| BTC | 8 | Bitcoin Core, [`src/consensus/amount.h`](https://github.com/bitcoin/bitcoin/blob/master/src/consensus/amount.h): `COIN{100'000'000}`; [developer.bitcoin.org glossary](https://developer.bitcoin.org/glossary.html): one bitcoin equals 100,000,000 satoshis |
| SOL | 9 | Solana SDK, [`native-token/src/lib.rs`](https://github.com/anza-xyz/solana-sdk/blob/master/native-token/src/lib.rs): `LAMPORTS_PER_SOL = 1_000_000_000`, `SOL_DECIMALS = 9` |
| TRX | 6 | TRON developer docs, [Token standards: TRX](https://developers.tron.network/docs/token-standards-trx): 1 TRX = 1,000,000 sun |
| USDT on Ethereum | 6 | Contract `0xdAC17F958D2ee523a2206206994597C13D831ec7` (address from [tether.to, supported protocols](https://tether.to/en/supported-protocols/)): `decimals()` = 6, `symbol()` = USDT, `name()` = Tether USD |
| USDT on Tron | 6 | Contract `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (address from the same tether.to page), read through TronGrid `triggerconstantcontract`: `decimals()` = 6, `symbol()` = USDT |
| USDT on BNB Smart Chain | 18 | Contract `0x55d398326f99059fF775485246999027B3197955`: `decimals()` = 18, `symbol()` = USDT, `name()` = Tether USD |

Finding for the owner: USDT on BNB Smart Chain is not issued by Tether. Tether's supported-protocols page lists no USDT contract on BNB Smart Chain; the token above is Binance's bridged USDT (labelled "Binance-Peg BSC-USD" on BscScan). Its address could not be confirmed on a Binance or Tether page (BscScan refused automated access); it is the address in the [Trust Wallet asset registry](https://github.com/trustwallet/assets/blob/master/blockchains/smartchain/assets/0x55d398326f99059fF775485246999027B3197955/info.json) and the one the on-chain read answered for. The 18 decimals, the difference from Tether's own 6-decimal tokens, is exactly the case the preset exists to test, so the preset stays as written.

### 2026-11-14: Crypto dependencies for the encoding core (T-017)

* `@noble/hashes` 2.4.0 (keccak-256, SHA-256) and `@scure/base` 2.4.0 (Base58, Base58Check, Bech32, Bech32m, hex) are added as runtime dependencies, as listed in `docs/architecture.md` section 8. Both were released in late August 2026; `npm audit` reports no vulnerabilities.
* Pinned to exact versions, unlike the other dependencies (`^`) [PROPOSAL]. Why: these libraries decide whether an address is called valid, so an upgrade should be a reviewed change that reruns the published test vectors, not something a fresh install picks up. `@noble/curves` follows the same rule when T-018 adds it.
* Size: the encoding core with both libraries bundles to 8.0 KB gzip. It is imported only by the address tool's route chunk, so the initial JS budget is unaffected.
* T-018 added `@noble/curves` 2.4.0 (secp256k1, ed25519) under the same exact-pin rule. With EVM, Tron, and Solana it bundles to 24.2 KB gzip, again for the address tool only.

### 2026-11-14: 500-row render at 4x CPU throttle accepted (T-021)

* Rendering 500 generated addresses is one main-thread task of 50 to 54 ms at normal CPU speed and 200 to 214 ms under a 4x CPU throttle, at or just over the 200 ms long-task budget. The owner chose to keep the single render. Why: the budget holds at normal speed, and rendering in batches would make the rows appear in steps. Revisit if the live-site measurement in T-024 shows long tasks on real hardware.

### 2026-11-14: Firefox E2E retries once in CI (T-023)

* Playwright's Firefox page crashes during an axe scan in two known cases: right after an auto-retrying `toBeEnabled()` / `toBeVisible()` assertion (reproducible locally, found in T-023), and occasionally on `/components` in CI (seen on PR 28). A crash kills the page, so the test cannot catch and redo the scan itself.
* [PROPOSAL] The Firefox project sets `retries: 1` in CI only. Chromium and WebKit keep no retries, and nothing is retried locally. A test that passes on its retry is reported as flaky in the run summary, so a pattern stays visible; a real failure fails twice and stays red. Rejected: skipping axe in Firefox (it would weaken the accessibility checks) and retrying every browser (it would hide real flakes elsewhere).

### 2026-11-16: First deploy and Inter kept (T-024)

* The site is live at https://qanchor.pages.dev through the Cloudflare Pages Git integration (NFR-021, OQ-27): the project name `qanchor` was available, so the URL is the default one. The owner installed the Cloudflare GitHub App with access to this repository only.
* Cloudflare answers unknown paths with HTTP 404 and `404.html`, closing the open point in `docs/architecture.md` (risk table).
* Inter stays as the UI font. Why: measured LCP on the live site is 0.6 to 0.82 s and Lighthouse Performance 99 to 100 on every route (desktop), well inside the 1.5 s threshold that would switch to the system font (2026-11-12). Numbers in `docs/plan.md`, T-024 notes.

### 2026-11-16: Dummy-data facts without a primary source (T-025)

Decided by the owner after T-025 found no reachable primary source for these facts (sources and findings in `docs/plan.md`, T-025 notes):

* Phone, "realistic" mode: use the commonly published operator prefix list and a length of 10 to 13 digits in the `08…` form, labeled as a secondary source in the dataset and here. The verified rules still hold: `08XY` with X ≠ 0, 4, 6, and at most 13 digits after `62`. Rejected: random prefixes from the regulation pattern only (some would be unallocated, so strict validators reject them).
* Phone, "non-colliding" mode: prefixes `0801`, `0802`, `0803`, `0805`, which Permenkominfo 14/2018 lists as not allocated, so no subscriber can hold them. Many phone validators will reject them, which is what FR-081 AC-9 already warns about. Rejected: `084X` (assigned to M2M and IoT devices by Permenkomdigi 7/2025, so a real IoT SIM could hold the number).
* NPWP, 15-digit legacy format: format-valid only; the ninth digit is random and the UI says the check digit is not verified (FR-081 AC-6). Rejected: Luhn as an assumption (no source; it could make real numbers fail or fake ones pass).
* Bank accounts: use the commonly published account number length per bank and the 3-digit bank codes, with a `source` field in the dataset marking them as secondary. Revised by the owner in T-028: no re-check before merge; the label is enough for test data.

### 2026-11-16: Seeded PRNG for dummy data (T-026)

* xoshiro128** 1.1 per row, seeded from SHA-256 of the seed and the row index (`src/lib/core/dummy/random.ts`). Why: 32-bit integer arithmetic gives identical output in every browser (FR-082 AC-1); a stream per row keeps the first N rows unchanged when more rows are requested (AC-4); SHA-256 from `@noble/hashes`, already a dependency, turns any seed string into a well-mixed state, so seeds that differ only in case or a space still differ (AC-3). Rejected: one stream for the whole run (adding a field or a row-dependent draw would shift every later row); `Math.random`-style float helpers (float formatting and rounding are where engines can diverge); a hand-written string hash (an extra algorithm to get right when SHA-256 is already there).
* Seeds are used exactly as typed; trimming or case-folding, if any, is the UI's decision in T-031.

### 2026-11-16: Region dataset from open MIT data (T-027)

* The region codes, names, and postal codes come from Cahya DSN's `wilayah` and `wilayah_kodepos` repositories (MIT), pinned to a commit and converted by `scripts/build-regions.mjs`. Why: they follow Kepmendagri 300.2.2-2430 Tahun 2025 and match its totals (38 provinces, 416 kabupaten, 98 kota), and the decree's lampiran could not be reached on the Ditjen Bina Adwil site from here (T-025). Postal codes have no other machine-readable source per village. The MIT notice is kept in the repository next to the data, and the dummy data page will credit the source.
* Only a fixed sample below kabupaten/kota is shipped (2 kecamatan, 2 villages each), as FR-081 AC-3 allows: the full 83,762 villages would be several MB. Rejected: hand-typing the region list (error-prone for 514 entries); shipping the full dataset.

### 2026-11-16: Non-colliding NIK uses province 00 (T-028)

* In "non-colliding" mode a NIK's province digits are `00`, which Kepmendagri never assigns (codes start at 11); the kabupaten and kecamatan digits, birth date, gender, and sequence stay consistent with the row. The address stays real, so FR-081 AC-5 (NIK region matches the address) does not hold for the province part in this mode, and the UI warning of AC-9 covers it. Decided by the owner. Rejected: sequence `0000` with the real region (keeps AC-5, but "sequences start at 0001" has no primary source, so the no-real-person guarantee would be weaker).

### 2026-11-16: Dummy-data ages and the "as of" date (T-029)

* Age presets count whole years on an "Ages as of" date that is part of the settings, defaulting to today in the UI, so a seed gives the same rows on any later day (FR-082 AC-1). Rejected: counting from the current date (a seed would drift at every birthday). Decided by the owner.
* Adult ages are 17 to 70 (17 is the KTP age); underage is 10 to 16 (below the KTP age but old enough to try signing up). Decided by the owner.

### 2026-11-16: Dummy-data export columns and run info (T-030)

* Address exports as one full line (`address`) plus one column per part; the bank account as `bank_name`, `bank_code`, and `bank_account`. Why: testers fill forms with separate province and city fields, and the full line still exercises commas (EC-017). Rejected: the full address only; a single bank column. Decided by the owner.
* The generator version, seed, and as-of date are written as `--` comments at the top of SQL exports and in the file name (`qanchor-dummy-v1-<seed>`); CSV and JSON stay plain so they match FR-083 AC-1 and AC-2. Rejected: a JSON wrapper object (changes AC-2); version and seed columns on every row. Decided by the owner.

### 2026-11-16: Locators for owner-written automation (`data-testid`)

The owner wants to practise writing their own Playwright tests against the live site, so the UI keeps stable locators. Decided by the owner.

* Accessible roles and names stay the primary locators: every control has a visible label or accessible name that is unique on its page.
* Dynamic output and repeated items also get a `data-testid`, kebab-case `<tool>-<element>` (for example `dummy-generate`, `dummy-preview-row`, `address-result-row`): result rows, per-row copy buttons, status and error messages, and counts, where a role alone is ambiguous.
* Test ids are a public contract: a PR that renames or removes one says so.
* The project's own E2E tests stay role-first and do not use test ids.
* Applied from T-031 on; the slice 1a pages get theirs in a small follow-up task (T-031a). The byte cost is negligible.

### 2026-11-17: Default endpoints after the slice 1c re-check (T-035)

Decided by the owner, both as recommended.

* Ethereum, Ethereum Sepolia, Polygon, Polygon Amoy, and Base Sepolia default to Tenderly's keyless public gateways (`*.gateway.tenderly.co`). Why: the previous defaults (publicnode for four, `sepolia.base.org`) do not keep old transactions, so a real transaction would show as "Transaction not found"; Polygon's publicnode even answers an unknown hash with HTTP 403. Tenderly passed every check in Chromium and Firefox from the production origin. Accepted risk: five networks depend on one provider; each can be overridden (FR-041). Alternatives considered: mixing providers (another full-history Ethereum endpoint, Tenderly for the rest) and replacing only Polygon.
* Solana mainnet keeps `solana-rpc.publicnode.com`, which holds only about the last 2 to 3 days of transactions; no keyless full-history endpoint passed. A "not found" on Solana mainnet says so and suggests an override (`docs/design.md` section 7). Alternative considered: no extra copy.
* Bitcoin defaults to mempool.space (mainnet and Testnet4), now verified; `blockstream.info` is the documented alternative.
* Explorer URL templates and built-in faucet links are the lists in `docs/architecture.md` sections 5.1 and 5.2. Four explorer pages and one faucet show a bot check to automation and are opened by hand by the owner.

### 2026-11-17: Transaction parsers, EVM and Solana (T-038)

Implementation choices inside the approved architecture; none changes a requirement.

* `TxResult.valueBase` may be `null` (was `bigint`). Why: Solana's `getTransaction` returns nothing for a transaction that is only "processed", so its value is unknown, and FR-040 AC-3 forbids showing an unknown field as zero. `docs/architecture.md` section 3 updated.
* A Solana lookup asks `getSignatureStatuses` (with `searchTransactionHistory`) first: no entry means not found, "processed" means pending, and only a confirmed or finalized signature is fetched with `getTransaction` (encoding `json`, commitment `confirmed`). The lookup itself is built in T-040.
* Solana value and recipient: the SOL moved by top-level System Program transfers, read exactly from the instruction data (not from JSON numbers, which lose precision above 2^53); the recipient is shown only when every transfer goes to one account; the sender is the fee payer. A transaction that only calls other programs shows value 0 and no recipient.
* EVM fee: gas used × effective gas price, plus `l1Fee` on OP Stack chains (Base); Arbitrum already counts its L1 cost in gas used. Receipts without `effectiveGasPrice` (pre-London) fall back to the transaction's `gasPrice`.
* Known limit: receipts from before the Byzantium fork (Ethereum mainnet before block 4,370,000) have no `status`, so such a transaction is reported as an unexpected response instead of success or failure.
* Each parser checks that the node answered for the hash or signature that was asked; anything else is a bad response.

### 2026-11-17: Transaction parsers, Tron and Bitcoin (T-039)

Implementation choices inside the approved architecture (ADR-006); none changes a requirement.

* Tron calls are sent with `visible: true`, so addresses come back in Base58 (`T...`) as users see them in wallets and on Tronscan. An empty transaction (`{}`) is not found; an empty transaction info means the transaction is not in a block yet, so it is pending.
* Tron status is the transaction's `contractRet`: SUCCESS is success, anything else (REVERT, OUT_OF_ENERGY, ...) is failed, and the node's `resMessage` is kept as the reason. TronGrid leaves out `fee` when staked energy and bandwidth covered the cost, so a missing fee is 0, not unknown.
* Tron value: the `amount` of a TransferContract, or the `call_value` of a TriggerSmartContract (the contract is the recipient). Other contract types, TRC-10 transfers included, move no TRX and show value 0. Amounts are JSON numbers, so a value above 2^53 sun (about 9 billion TRX) is refused as an unexpected response rather than shown rounded.
* Bitcoin: `from` and `to` are null and the inputs and outputs are listed instead (FR-040 AC-2); the value is the total of the outputs. A transaction is never "failed": it is confirmed (success) or in the mempool (pending). A pending transaction's fee is already fixed, so it is shown; `TxResult.fee` is null only where the fee is not known yet.

### 2026-11-17: Tx lookup page (T-040)

Implementation choices inside FR-040 to FR-043 and design S-05; none changes a requirement.

* A pasted hash is accepted with or without `0x` and in either case, then sent in the form each chain expects (EVM `0x` + lower case; Tron and Bitcoin bare lower-case hex). Why: wallets and explorers copy both forms; the format check still runs before any request (FR-040 AC-4).
* "Open in explorer" sits beside Look up and appears as soon as the hash is valid for the selected network, before any lookup (FR-043 AC-1). Its URL comes from `explorerTx` in `networks.ts`, which now also holds each network's native coin symbol.
* A lookup waits for the stored endpoint overrides to be read, so it never goes to a default while an override exists. The result names the host it came from and says "(your endpoint)" for an override.
* The result section is not a labelled landmark: with `aria-labelledby` on it, an axe scan crashed Playwright's Firefox once the error callout had focus. The heading is unchanged for sighted and screen-reader users.
* `/tx` is added to the cross-cutting route lists (idle network, keyboard focus ring, long tasks) now rather than in T-046.

### 2026-11-17: ABI core (T-041)

Implementation choices inside FR-050, FR-052, EC-014, and ADR-005; none changes a requirement.

* Supported types: `address`, `bool`, `uint8` to `uint256` and `int8` to `int256` in steps of 8 (`uint`/`int` read as the 256-bit types), `bytes1` to `bytes32`, `bytes`, `string`, fixed and dynamic arrays, and tuples. Not supported: `fixed`/`ufixed` (Solidity cannot use them) and the `function` type (rare in calldata); both give "Unknown type". Empty tuples and zero-length fixed arrays are rejected, as Solidity does.
* Signatures may carry a `function` keyword, parameter names, `address payable`, and data locations (`memory`, `calldata`, `storage`), so a line copied from Solidity source works. Anything after the closing parenthesis, such as `external returns (bool)`, is an error rather than silently ignored.
* A JSON ABI may be an array of entries or a build artifact with an `abi` array. Events, errors, constructors, `fallback`, and `receive` are skipped; an entry with no `type` is a function, as the ABI specification says. One malformed function entry fails the whole ABI with its position, so the user never decodes against a partly read ABI.
* Decoding is all or nothing (FR-052 AC-4) and value types are checked as strictly as Solidity's ABI decoder: an integer outside its type's range, an address or `bytesN` with non-zero padding, or a `bool` other than 0 or 1 is a decoding error. Every offset and length is checked against the data before anything is read or allocated, so a huge length cannot hang the page.
* A `string` that is not valid UTF-8 is a decoding error. Why: showing replacement characters would present altered data as valid. The bytes can still be read by decoding the argument as `bytes`.
* Offsets that point to the same data are allowed (the specification does not forbid them), but a decode that reads more than four times the data size is refused. A real encoding reads each byte once; the limit stops a small, crafted input from expanding into a huge result.
* Trailing data after the encoded arguments is reported as an extra-byte count for a warning (EC-014), measured from the furthest byte any value covered, padding included. A last `bytes` or `string` value without its padding is accepted.
* Error messages name the argument path, for example `Argument 1 (orders)[2].maker: address has non-zero padding.`
* Test vectors: the five examples of the Solidity ABI specification, the ERC-20 and Uniswap V3 selectors, and hand-encoded nested tuples, with expected words written out in the tests rather than produced by an encoder. Decoding 384 KB of calldata takes 4.4 ms in Node, so the decoder runs on the main thread.

### 2026-11-18: Calldata decoder page (T-042)

Implementation choices inside FR-050 to FR-053, EC-015, and design S-06; none changes a requirement.

* One optional input takes either a signature or a JSON ABI: text starting with `[` or `{` is read as JSON. Why: design S-06 has one "ABI or signature" field, and the two forms cannot be confused.
* The built-in table (`lib/core/abi/selectors.ts`) has eight entries: ERC-20 `transfer`, `approve`, `transferFrom`; ERC-721 both `safeTransferFrom`s; `setApprovalForAll` (ERC-721 and ERC-1155); ERC-1155 `safeTransferFrom` and `safeBatchTransferFrom`. ERC-20 and ERC-721 share the `approve` and `transferFrom` selectors with the same types, so those entries use the ERC-20 argument names and show a note that in ERC-721 the last argument is the token ID.
* A supplied ABI or signature replaces the built-in table for that decode; a selector it does not contain is a mismatch (FR-052 AC-3), not a fallback to the table.
* Nested values are shown as one table row per item, named by path (`order.ids[0]`), under their argument's number. An empty array is one row reading "Empty array".
* "Decode input" (FR-053) sits beside the copy button of an EVM result's input row, and only when the input is not `0x`. The calldata travels in SvelteKit's history state (`goto` with `state`), not in the URL, so kilobytes of calldata never end up in the address bar or the browser history list. On arrival the decoder fills the field and decodes at once, since decoding is local and instant.
* A new `Textarea` primitive (`lib/ui/Textarea.svelte`) shares the `.control` box with `TextInput`; Ctrl+Enter (⌘+Enter on Mac) submits its form, because Enter adds a line. It is listed on `/components`.
* Field errors move focus to the invalid field; a decoding error or mismatch moves focus to its alert, as in tx lookup.

### 2026-11-18: Repository made public

Decided by the owner.

* `ardhana2819/qanchor` is public. Why: GitHub Actions minutes for a private repository on GitHub Free ran out (about 94 CI runs in November at about 32 billed minutes each), so CI jobs stopped starting. Actions on standard runners are free for public repositories, and the code is a portfolio piece meant to be shown. Alternatives considered: a spending limit (keeps the repo private, costs per run), running Firefox and WebKit E2E only on `main` (about half the minutes, later browser feedback), and merging on local checks until the monthly reset (WebKit untested).
* Before the switch, every tracked file and the full commit history were scanned for secrets: no API keys, tokens, real private keys, mnemonics, or `.env` files. The only WIF-shaped string is the public Bitcoin wiki example used in a test.
* Earlier commits carry the owner's personal email as author; they stay as they are (no history rewrite, no force-push). New commits use the GitHub noreply address, and GitHub blocks pushes that would expose the personal email.
* The "Cloudflare Pages" kickoff entry and the review 2 note that GitHub Free cannot enforce required status checks both assumed a private repository. Branch protection with required checks is now available, but merge-on-green stays a manual rule until the owner decides otherwise.

### 2026-11-18: Testnet wallets (T-043)

Implementation choices inside FR-070, FR-071, EC-021, EC-025, and design S-08; none changes a requirement.

* The form has Label, Chain, Network, Address, and Notes. The Network list holds only the testnets of the chosen chain (Ethereum Sepolia, BSC Testnet, Polygon Amoy, Arbitrum Sepolia, Base Sepolia, Bitcoin Testnet4, Solana Devnet, Tron Nile), since the tracker is for testnet wallets. An imported entry on another network keeps it and can still be edited.
* The address is checked with the address validator (`verdictFor`) against the chosen chain. A valid address of another chain says which chain it is. A Bitcoin address is accepted only if it matches a testnet format; one that matches only mainnet gets the design's "testnet only" error. Surrounding whitespace is removed before checking and saving; invisible characters inside are not, so they fail validation.
* [ASSUMPTION] Bitcoin entries accept the formats the validator knows: P2PKH, P2SH, P2WPKH, and P2TR. A testnet P2WSH address (`tb1q…` of 62 characters) is rejected as another address type. Revisit if multisig test wallets are needed.
* Duplicates (FR-070 AC-6) compare chain, network, and address. EVM and Bech32 addresses are compared without case (`0xAbC…` and `0xabc…` are one address); Base58 is case-sensitive. The first Save shows a warning naming the existing entry and turns the button into "Save anyway"; changing any field withdraws the warning.
* Limits: label up to 80 characters (required), notes up to 2,000. The notes hint says not to paste a key or seed phrase and that notes are exported as typed (EC-021).
* Notes show under the label in the table, cut to one line. Faucet links (T-044) and the balance (T-045) are not part of this task.
* Delete opens a destructive dialog with Cancel focused first, matching the import dialog.
* The wallets route loads the address validators (noble), like the address tool; the crypto-free routes are unchanged.

### 2026-11-18: Faucet links (T-044)

Implementation choices inside FR-072 and design S-08; none changes a requirement.

* Each wallet row has a native `<details>` disclosure under the label (design: "Row detail … faucet links", disclosure = native `<details>`). Its summary reads "Faucets (n)", or "No faucet listed" when the network has none (AC-3), so the note is visible without opening it.
* Built-in faucets are the list checked in T-035 (`docs/architecture.md` section 5.2), kept in `lib/config/networks.ts` as `builtinFaucets(networkId)`, each with a short provider label. Every testnet has at least one; mainnets and unknown network ids (possible after an import) have none.
* User-added links are stored per network in the existing `faucets` store, not per wallet: a faucet serves a network, so a link added on one entry is listed on every entry on that network. The dialog says so. Fields: address (required) and label (optional, up to 80 characters; an unlabelled link shows its host).
* A user link must be an `http:` or `https:` address, stored as the browser normalises it (`URL.href`). Anything else is refused, because a `javascript:` or `data:` link would run in or replace the app when clicked. Links already listed for the network (built-in or the user's) are refused as duplicates.
* Imported backups are not trusted: a stored link that is not http or https is shown as text with "not a web link" and a Remove button, never as a link.
* Every faucet link opens in a new tab with `rel="noopener noreferrer"`, shows the external-link icon and the destination host, and says "(opens in a new tab)" to screen readers. The app sends nothing to a faucet; the E2E test stubs the faucet and checks that the only request is the page GET, with no referrer and no opener.
* Removing a user link needs no confirmation (it is one link, re-added in seconds); a toast confirms it.
* User links are listed by label, then address. The store has no creation time and IndexedDB returns records by id, so insertion order would not survive a reload.
* [ASSUMPTION] http (not only https) is accepted for user links, for faucets run on a local or test network. Revisit if that is never used.

### 2026-11-18: On-demand balance (T-045)

Implementation choices inside FR-073, FR-042, and design S-08; none changes a requirement.

* The table gains a Balance column, and each row's actions start with Refresh. One click sends one balance request (two on EVM networks, which check the chain ID first, as tx lookup does, so a wrong-chain endpoint cannot show another chain's balance). Nothing else sends a request: no polling, no refresh on load or on focus (AC-2).
* Requests per protocol: `eth_getBalance` (latest), Solana `getBalance`, Tron `/wallet/getaccount` with `visible: true`, and Esplora `/address/<address>`. Response shapes were checked on the default testnet endpoints on 2026-11-18 (read-only). They go through the same request client and endpoint resolution as tx lookup, so the user's endpoint override applies (FR-041).
* A Tron account that never received TRX answers `{}`; it is shown as 0 TRX. An activated account with no `balance` field is also 0.
* [ASSUMPTION] The Bitcoin balance is confirmed plus mempool (funded minus spent, both), so a faucet payment shows as soon as it is broadcast. Revisit if confirmed-only is needed.
* The balance is shown in the coin with full precision (the tx lookup's amount format), with "fetched HH:MM" in local time and the full time in a `<time datetime>`.
* Balances live in memory for the session only (architecture section 2), keyed by network and address, so two entries for one address share a balance, and editing an entry's address or network starts from "Not fetched". Leaving the page aborts a request in flight (NFR-019).
* Error states follow FR-042: the same codes and wording, adapted to an address ("Could not reach <host>. The balance could not be read."). The error shows in the row, takes focus (AC-6), and the button reads Retry. A previous value stays, with a "stale" badge (AC-3).
* While a refresh runs, the button stays focusable (`aria-disabled`) and a second click is ignored, so keyboard focus is not lost.
* An entry on a network this version does not know (possible after an import) shows "No endpoint for this network" and has no Refresh.
* The table was about 160 px wider than the content area at 1280 px (full address, an 18-decimal balance, four row actions). Owner's choice of the options offered: shorten the address in the middle, `0x5aAe…eAed` (first six, last four characters; 13 or fewer are left as they are). The full address stays in the accessible name (a visually hidden copy; the short form is `aria-hidden`), in the tooltip, in the table's text form, and in Copy. Rejected: moving Edit and Delete into a "⋯" menu (one more click for common actions), and leaving the sideways scroll. At 1280 px the table now fits.

### 2026-11-18: Phase 1 completion check (T-046)

* Phase 1 is complete as far as the plan's tasks go: all 46 tasks are done, all eight tools are on the live site, and every active Phase 1 functional requirement (33; FR-013 retired) is named by at least one test, now enforced by `src/traceability.test.ts`.
* Two owner checks remain open and are not blocking: the checklist content review (deferred from T-032), and opening by hand the explorer and faucet pages that show a bot check to automation (bscscan, testnet.bscscan, sepolia.basescan, tronscan, faucet.polygon.technology) or refused the test network (Coinbase CDP faucet).
* The traceability check works at requirement level (each FR named in a test). Acceptance criteria were reviewed by hand in this task, not enforced, because tests name them inconsistently ("AC-5", "(AC-6)", or in a describe title); a stricter check would first need one naming rule across every spec.

### 2026-11-19: Phase 2 discovery

Decided by the owner before the Phase 2 requirements were drafted (`docs/prd.md` section 10).

* Scope: every feature in the Phase 2 outline, in three slices, each ending deployed and tested. 2a: test cases and test runs. 2b: screenshots and the bug report generator. 2c: exploratory session notes, release summary, and the Phase 1 hooks (checklist to test cases, test data into steps). Rejected: moving session notes and release summary to after the MVP; one slice for everything (no deploy point in between).
* Result granularity: one status per case in a run (pass, fail, blocked), and on Fail the tester marks which step failed and writes the actual result. Why: fast to execute, and the bug report can still be filled from the failed step. Rejected: a status per step (slower to run, heavier data model); case only (the bug report could not know the failed step).
* Bug report output: both Markdown and Jira wiki markup, chosen at copy time. Why: Markdown for the Jira Cloud editor, wiki markup for Jira Server/Data Center and plain text fields. No Jira API: the report is copied, not posted.
* Screenshots are part of the JSON export and import, base64-encoded, so one file is a complete backup. The export shows its size before download. Rejected: an "include screenshots" option (more UI and tests for little gain); leaving them out (lost when restoring in another browser).

### 2026-11-19: Phase 2 requirements approved (PRD v0.4)

* The owner approved `docs/prd.md` section 10 as a block: FR-090 to FR-151, US-013 to US-019, NFR-023 to NFR-026, EC-027 to EC-039, the limits in section 10.5, and the three slices. Every proposal and assumption in the draft is approved with it, including: runs keep a snapshot of their cases; bug reports are generated on demand and not stored, with a linked-issue field on the result instead; releases are free text grouped without regard to letter case, and the release summary uses the latest result per case; persistent storage is requested only from a Settings button; a checklist item becomes one test case without steps; no zip download of attachments.
* The [VERIFY] items in section 10.7 are facts, not decisions, and are checked before the related code ships.
* Next: user flows and UI direction for the P2 screens in `docs/design.md`, then the tech plan for slice 2a.

### 2026-11-19: Phase 2 design approved (design brief v0.5)

* The owner approved `docs/design.md` section 13: screens and routes P2-01 to P2-07, a "QA" sidebar group after "Blockchain" and "Data", flows J-8 and J-10 to J-12, the two-pane run execution screen, single-key shortcuts on that screen only, the new components (result control, results bar, screenshot area, image viewer, tag chip, steps editor, sticky footer bar), the motion additions, and the copy. No new design token.
* Decided with it, as recommended (section 13.9): a static prototype `prototype/run-execution.html` is reviewed before slice 2a code; the session clock shows minutes and updates once a minute while visible (rejected: `mm:ss` every second, which keeps a timer running for the whole session); the bug report is a dialog on the run, not its own route; a new run lists its cases by key, whatever order they were ticked in (reading of FR-110 AC-2).
* Next: the prototype, then the tech plan for slice 2a (`docs/plan.md`).

### 2026-11-19: Run execution prototype approved

* The owner approved `prototype/run-execution.html` (P2-04 and P2-05) as built, with no layout change to design section 13.
* It was checked in Chromium only: the shortcuts, required text for Fail and Blocked, the bug report in both formats, completing and reopening a run, the dark theme, and 375 px width without horizontal scroll. Its escaping is a stand-in; the real rules wait for the PRD 10.7 check.
* Next: the tech plan for slice 2a (`docs/plan.md`).

### 2026-11-19: Slice 2a plan approved

* The owner approved milestone M4 in `docs/plan.md` (T-047 to T-056), the v0.2 additions to `docs/architecture.md`, and ADR-015 (schema v2).
* FR-123 (linked issue) moves from slice 2b to 2a (plan finding F-3): it is one optional field on a result and is already in the approved prototype. `docs/prd.md` section 10.1 is updated.
* Work starts with the T-047 spike, because every record page depends on reading the ID after hydration (plan finding F-2).

### 2026-11-19: Record IDs in the query string, spike results (T-047)

* The pattern holds in Chromium, Firefox, and WebKit (Playwright on `vite preview`, 11 checks, 3 to 5 repeats per browser, all green). The throwaway route `/spike-ids` was removed before merge.
* Read the ID after hydration: a `mounted` flag set in `onMount`, then `$derived(mounted ? (page.shallow?.url ?? page.url) : null)`. The built HTML holds only the loading state and the build raises no prerender error. Deep links, reload, an unknown ID (a not-found state in the page), a missing ID (EC-028: `goto(resolve(list), { replace: true })` from an effect, so Back skips the empty URL), another ID on the same route (the component is reused, so per-record form state resets from an effect on the ID), and Back and Forward between records all work.
* The current case and the list filter change with `goto(url, { shallow: true, replace: true })`. In SvelteKit 3, `replaceState` from `$app/navigation` is deprecated, and a shallow `goto` leaves `page.url` unchanged: the new URL is in `page.shallow.url`. Reading only `page.url` was tried and failed (the case did not change, and a filter change dropped the chosen case). A shallow `goto` keeps focus and scroll by default (`reset` is false), so no extra options are needed; `keepFocus` and `noScroll` no longer exist.
* Build URLs with `resolve()`, which accepts a route ID with a query string (`resolve(`/cases/edit?id=${id}`)`), so `svelte/no-navigation-without-resolve` stays on. The query string itself is built in a plain `.ts` helper, because `svelte/prefer-svelte-reactivity` flags a `URLSearchParams` created in a component.
* Unsaved-changes guard: one `beforeNavigate` that returns early for `nav.shallow` (switching case or filter never asks), calls `nav.cancel()` otherwise, and opens the QAnchor dialog for link, `goto`, and in-app Back or Forward (`popstate`; SvelteKit restores the history position). Discard clears the dirty flag and calls `goto(nav.to.url)`. For `leave` (reload, closing the tab, or Back to a page outside the app, such as a record opened from a bookmark), `cancel()` makes the browser show its own prompt, since no page dialog can run; Playwright saw the `beforeunload` prompt in all three browsers. This matches design 13 (FR-100 AC-7): the QAnchor dialog for in-app navigation, the browser's own prompt for reloads.
* Bug found and fixed: `Dialog.svelte` ended a reopened dialog when the queued `close` event of the previous close arrived after `showModal()` (a second Back after "Keep editing" showed no prompt in about half of the Chromium runs). `onclose` now sets `open = false` only when the dialog is actually closed. A regression test in `tests/e2e/components.spec.ts` fails in all three browsers without the fix.
* Not covered by the spike: typing quickly into a filter that rewrites the URL on every key (T-052 checks it with 1,000 cases) and the Cloudflare preview (same static files, checked when T-052 deploys).

### 2026-11-20: QA core rules (T-048)

* `src/lib/core/qa` holds the slice 2a rules as plain TypeScript: record types, keys, tags, field limits, the case filter and its URL query, snapshots, counts, releases, linked issues, and the run summary. Choices where the PRD is silent, all [ASSUMPTION] until the owner says otherwise:
  * Limits not in PRD 10.5: release up to 200 characters (as a title), environment up to 5,000 (free text), linked issue up to 500 (room for a long issue URL). Lengths count UTF-16 code units, the unit an input's `maxlength` uses; tag length counts characters (code points).
  * "Letters" in a tag means letters of any script (`\p{L}`), so `ünïcödé` is a valid tag; spaces, `/`, `#`, `,`, and emoji are not.
  * A step needs an action; its expected result stays optional (FR-100). A blank step is an error, not dropped silently, so the editor decides what to do with it.
  * The text filter matches the key and the title, not the steps or preconditions (FR-101 AC-2 does not name the fields). Typing `TC-12` also matches `TC-120`, as substring matching does.
  * Case keys are parsed in any letter case (`tc-12`) but never with leading zeros (`TC-012`), so one key has one spelling.
  * Fields of another status are kept and not checked when a result is saved (FR-111 AC-6); the summary reads only the fields of the current status.
* Run summary (FR-113 AC-5): the prototype's layout, with release and environment as list items instead of plain lines, because Markdown joins consecutive plain lines into one paragraph. User text is put on one line and inline Markdown characters are escaped with a backslash (a CommonMark escape, so no [VERIFY] is needed); a linked issue that is an `http:` or `https:` URL becomes an autolink. The bug report escaping (FR-121, PRD 10.7) is still open for slice 2b.
* Tests: 112 unit tests with a boundary test (max and max + 1) per limit and a golden summary. Mutation check by hand: 17 mutants of the limit, filter, snapshot, key, link, and summary rules, each caught by at least one test.

### 2026-11-20: Schema v2 in storage (T-049)

* `DB_VERSION` is 2. Migration 2 adds `testCases` (unique index `byNumber`), `runs`, `results` (key `[runId, caseNumber]`), and `meta`, and leaves the v1 stores alone. A v1 database seeded in the browser upgrades with every wallet, endpoint, and faucet kept, in all three browsers (FR-091 AC-1).
* No `results.runId` index, unlike `docs/architecture.md` v0.2: `runId` leads the key, so one run's results are one key range, which reads and deletes them without an index to maintain. Architecture section 3.1 is updated.
* The backup has its own version, `BACKUP_VERSION` in `backup.ts`, set to 1. Before, export and import used `DB_VERSION`, so raising it here would have labelled exports as v2 without the Phase 2 data and refused every existing v1 backup. Backup v2 and the Phase 2 stores in import and export come with T-050; until then an import replaces only the v1 stores, and no page writes Phase 2 data yet.
* Storage gets two multi-store writes, each one transaction (NFR-026): `createCase` reads and raises `caseCounter` and adds the case (`add`, so a key already taken rolls the counter back), and `deleteRun` deletes the run with its results (NFR-024). Other QA writes are single records through the generic `putAll` and `deleteOne`.
* State modules `test-cases.svelte.ts` and `runs.svelte.ts` follow `wallets.svelte.ts`. The 5,000-case limit (PRD 10.5) is checked in `testCases.create` against the loaded list; another tab can still add cases past it, which is accepted for a single-user tool. Field validation stays with the caller (`caseErrors`, `runErrors`, `resultErrors`).

### 2026-11-20: Backup v2 (T-050)

* `BACKUP_VERSION` is 2. Export carries test cases, runs, and results; `meta` is left out and the key counter is rebuilt on import as the highest case number among the cases and every run's snapshots, so a key that only survives in a run is never given out again (FR-100 AC-2, EC-039). Import replaces every store, Phase 2 included, in one transaction.
* A version 1 file is accepted and upgraded in memory with empty Phase 2 lists (FR-091 AC-3, EC-037); Phase 2 lists in a v1 file are ignored. Versions other than 1 and 2 are refused as before.
* The Phase 2 guards use the editor's rules from `lib/core/qa/validation.ts`, so a file can hold nothing the app could not have saved. Tags are normalised on import as the editor does; a run's snapshots are put in key order. Cross-checks: one test case per key and per id, one run per id, each result for a run in the file and a case in that run, one result per case, and the result rules for that case's steps (FR-091 AC-5). Each refusal names the record: `Result 1 of 1 ("TC-7") in run "Smoke" is for a case that is not in the run.`
* The import dialog and the success message list Test cases, Test runs, and Results after the Phase 1 types. The success text grows to "Imported 3 wallets, 1 endpoint override, 0 faucet links, 0 test cases, 0 test runs, 0 results, and the theme setting." (design S-10 copy, extended).
* Not covered here: the 200 ms long-task check for a large import (FR-091 AC-6) is checked in slice 2b with the section 10.5 data set, which includes screenshots (NFR-023).

### 2026-11-20: Slice 2a UI primitives (T-051)

* New in `src/lib/ui`: `ResultControl`, `ResultsBar`, `StatusBadge`, `PriorityBadge`, `TagChip`, `TagInput`, `FooterBar`, and `PageState`; icons `cases`, `run`, `arrow-up`, `arrow-down`, `trash`. All are shown on `/components`.
* The result control is native radios, like the segmented control, so arrow keys move and select within it. Its read-only form is a disabled fieldset: the stored result keeps its colours, and the radios leave the Tab order. The icon pop (design 13.6) is a CSS keyframe on `transform` that runs only after the user picks a result, so a stored result never animates on load.
* `StatusBadge` maps result and run statuses onto the Phase 1 `Badge` (Pass, Fail, Blocked, Untested, In progress, Completed). Running, Paused, and Ended come with the sessions in slice 2b. `PriorityBadge` uses `Badge` without an icon: a priority is not a verdict, and the check or cross icons would say otherwise. `Badge` gains an optional `icon` override and a `subtle` variant (Low).
* `ResultsBar` takes the counts from `countStatuses`. Its accessible name is the counts in words from the new `countsInWords` in `lib/core/qa/run.ts`, which the run summary now uses too. A status with no cases has no segment.
* `TagInput` stores tags through `normalizeTags`, so invalid tags stay visible and `caseErrors` names them; it does not refuse them itself. Enter and a comma (typed or pasted) add tags; Enter in an empty field still submits the form. [ASSUMPTION] Text left in the field becomes a tag when focus leaves it, so Save never drops a tag the user typed. Suggestions come from `suggestTags` (prefix match), so the `<datalist>` stays empty until the user types.
* The record not-found state is `PageState`: a heading, one sentence, and one link styled as the primary action. The 404 and error page (`+error.svelte`) now uses it too, instead of its own copy of the same markup and styles.

### 2026-11-21: Test case list (T-052)

* Owner decision: the editor routes `/cases/new` and `/cases/edit` arrive with T-053, and every merge deploys. So T-052 ships `/cases` unlisted. The "QA" sidebar group, the index entry, New test case, the title links, and Duplicate opening the editor move to T-053; New run with these moves to T-054. The live site never lists a page where a case cannot be created. Until then, Duplicate stays on the list with the toast "Duplicated as TC-31." and the empty state has no button.
* The filter is the T-048 `CaseFilter`, read from the URL after mount and written back with a shallow `goto` that replaces the entry (T-047), so it survives a reload and adds no history. An emptied filter leaves `/cases` with no query. The tag filter is an inline `<details>` disclosure, not a floating menu, so it needs no outside-click handling; it lists every tag in use plus any tag in the URL that no case has, so that one can be unticked (it then disappears). [ASSUMPTION] Closed, it reads "Any tag", "1 tag", or "2 tags".
* Rows a filter leaves out stay in the DOM, hidden (`DataTable` prop `hidden`), and the list does not play the results-enter animation (`enter={false}`). Removing and re-creating rows cost a 120 to 144 ms task when a filter was cleared on 1,000 cases, close to the 200 ms limit (FR-101 AC-4); toggling `hidden` takes 66 ms. Hidden rows are out of the accessibility tree.
* Duplicate copies every field but the identity through `copyOfCase` and prefixes "Copy of ", cut to the 200-character title limit so the copy is always valid. [ASSUMPTION] At the 5,000-case limit it shows "This browser already keeps 5,000 test cases, the most it can. Delete some to add more."
* The delete confirmation counts the runs from the loaded runs list, so the page shows its content only once both cases and runs are read. [ASSUMPTION] A case in no run reads "It is not in any run."; one run reads "That run keeps its own copy." After a delete, focus goes to the filter field, because the row and its button are gone.
* "Updated" shows a relative time ("20 hours ago", "yesterday", then the date from a week on) with the full date and time in the `<time>` title. It is computed when the list loads and never ticks (NFR-005).

### 2026-11-21: Test case editor (T-053)

* One component serves `/cases/new` and `/cases/edit?id=` (`CaseEditor.svelte`). The ID is read after mount (T-047). An edit URL without an ID replaces itself with `/cases` (EC-028). An unknown ID shows `PageState` "Test case not found" with Back to test cases (FR-090 AC-3). When the route shows another record (Duplicate from the editor), the form reloads from an effect on the record ID.
* [ASSUMPTION] A new case starts with one empty step, since most cases have steps. Removing it leaves a case with only a case-level expected result, which FR-100 allows.
* [ASSUMPTION] After the first save, a new case continues at its own edit URL (a replace, so Back goes to where the user came from), so a reload or a shared link finds it. Saving an existing case stays on the page. Both confirm with the toast "Saved TC-12." and clear "Unsaved changes" in the footer. A failed write is shown in the footer as an alert, not only as a toast.
* Errors show only after the first Save, then update as the user types. Save focuses the first field with a problem, in form order (FR-100 AC-3). Copy from design 13.7, plus [ASSUMPTION] "Describe what to do in step N.", "Up to 10 tags.", and an invalid-tag message that names the tag.
* Steps: Move up, Move down, and Remove are icon buttons named with the step number. After a move, focus stays on the moved step: on the same button, or on the other move button when the step reaches an end and the first is disabled. After a remove, focus goes to the action of the step that took its place, else the previous step, else Add step. Each change is announced ("Step 3 moved up. It is now step 2."). At 50 steps, Add step is disabled with "Up to 50 steps." (FR-100 AC-4).
* Unsaved changes compare the stored fields, not step identities, so undoing an edit by hand clears the warning. In-app navigation (links, Cancel, Back) opens "Discard this new test case?" or "Discard your changes to TC-12?" with Keep editing focused. A reload or closing the tab gets the browser's prompt (FR-100 AC-7, T-047).
* Duplicate in the editor copies the saved case, not unsaved edits, then opens the copy; with unsaved edits, the discard question comes first. Delete in the editor uses the list's confirmation and returns to `/cases`.
* Text areas grow with their content up to 12 rows (design 13.8) through CSS `field-sizing: content`. Firefox does not support it yet, so there they keep their row count and the resize handle.
* `Button` takes `href` to render a link that looks like a button (New test case), so the list's actions stay links that can open in a new tab.
* The "QA" group comes after Blockchain and Data in the sidebar and on the index, with Test cases (FR-090 AC-1). It was held back in T-052 until a case could be created.
* The 1,000-case long-task check (FR-101 AC-4) failed in CI: the runner is about 4x slower than a desktop, and rendering 1,000 rows or bringing back 888 when a filter is cleared was one task of up to 401 ms there. Without the enter animation, `DataTable` now creates rows 50 per frame, and rows that start to pass the filter are shown 50 per frame; rows already shown stay, so the table never shrinks back and its scroll position holds. The table scrolls inside a box of at most 640 px, so later steps land off screen. The cases table also uses `table-layout: fixed` with set column widths, so each step does not lay out the whole table again. Longest task at 4x: 148 ms. Why not keep one render as for the 500 generated addresses (2026-11-14, T-021): that one was 200 to 214 ms only under throttle, while this one failed the CI gate itself.

### 2026-11-23: Test runs list and New run (T-054)

* Owner decision: the run page `/runs/view` arrives with T-055, and every merge deploys. So T-054 ships `/runs` and `/runs/new` unlisted, as T-052 did for `/cases`. "Test runs" in the sidebar and on the index, links on run names, Create run opening the new run, and New run with these on `/cases` (moved here from T-052) move to T-055. Until then Create run returns to `/runs` with the toast [ASSUMPTION] "Created run "<name>"." and run names are plain text.
* The filter bar of `/cases` is now `CaseFilterBar.svelte`, used by `/cases` and the new-run picker, so both filter the same way (FR-110 AC-1) and keep the filter in the URL. The picker reads it on load, so T-055's New run with these only has to link to `/runs/new` with the list's query.
* Select all matching is the header checkbox of the picker (design 13.3), named "Select all matching (n)". It selects every case the filter shows, or clears them when all are selected; it is mixed when only some are. [ASSUMPTION] Cases selected before the filter changed stay selected while hidden, and the toolbar counts all of them ("2 of 3 match · 3 selected"). A case title is the label of its checkbox, so clicking it selects the case.
* Create run stays disabled with "Select at least one test case." or "Up to 500 test cases per run." beside the count (FR-110 AC-1, PRD 10.5), so the case count is never a submit error. Only the name is checked on submit ("Enter a name." with focus on it); the release and the environment are checked for length.
* [ASSUMPTION] The name and the environment are stored as typed (FR-100 AC-8); the release is trimmed (FR-110 AC-4). Release suggestions are the distinct releases of earlier runs in their first spelling (EC-031). Sessions add theirs in slice 2c.
* The run list shows "None" for a run without a release, the results bar with "18 / 40" (cases with a result out of all), and the created time as a relative date with the full date in `<time>` (as "Updated" on `/cases`). The delete confirmation counts the run's results: [ASSUMPTION] "It has no results yet. This cannot be undone." for none; screenshots join the count in slice 2b. After a delete, focus goes to the table, or to the empty state's New run when the last run is gone.

### 2026-11-23: Run execution (T-055)

* `/runs/view?id=` with `src/lib/tools/runs/RunView.svelte`, `ResultPanel.svelte`, and `execution.ts`. It loads only the runs store (a run holds its own case snapshots). A missing ID goes to `/runs`; an unknown ID shows "Run not found". The current case is `case=TC-n` in the URL, changed with a replace so Back leaves the run [ASSUMPTION]; an unknown key opens the first case.
* Pass is saved when picked. Fail and Blocked show their fields, and the case keeps its stored status until Save result succeeds (FR-111 AC-3, AC-4); Save result with a missing text shows the error and focuses that field. [ASSUMPTION] Once a result is stored, a changed field (notes, linked issue, failed step, actual result, reason) is saved when it loses focus if the form is valid, so notes never need a separate save button (FR-111 AC-5). Picking another status keeps the other fields in the form until a save (FR-111 AC-6); Pass replaces a stored failure, and there is no result history.
* [ASSUMPTION] The default failed step is the last step, or "Not step-specific" for a case without steps. The failed step row is highlighted once the failure is saved.
* [ASSUMPTION] An unsaved form is kept per case in memory while the page is open, so moving to another case and back keeps it; a reload drops it.
* Shortcuts (design 13.4): P, F, B, J, K, and ? on the window. They never fire in a text field, select, or editable content, with Ctrl, Alt, or Cmd, while a dialog is open, or on a completed run (except J, K, ?). [ASSUMPTION] F and B focus the Actual result and Reason fields (the design text), not the failed step as in the prototype. A click on a result radio does not move focus. The result control shows the keys as `kbd` hints.
* Announcements through the app's live region: "TC-12 marked Failed. 18 passed, 3 failed, 2 blocked, 17 untested." on a status save, "Case 19 of 40: <title>" on a case change. Save result also shows the toast "Saved TC-n.".
* Complete run asks first with the untested count; [ASSUMPTION] with none untested the body reads "Every test case has a result.". A completed run is read-only with Reopen run; [ASSUMPTION] toasts "Run completed: x passed, y failed, z blocked." and "Run reopened.". Copy summary copies `runSummaryMarkdown` with the toast [ASSUMPTION] "Copied run summary".
* A linked issue is stored trimmed; it becomes "Open linked issue" (new tab, `rel="noopener noreferrer"`) only when it is an http or https URL (FR-123).
* Below 1024 px the case list is a disclosure above the case ("Case n of N · show all").
* Moved in from T-054: "Test runs" in the QA group of the sidebar and on the index, run names link to the run, Create run opens the new run, and "New run with these" on `/cases` opens `/runs/new` with the list's filter (shown only when a case matches).

### 2026-11-24: Slice 2a cross-cutting checks (T-056)

* The QA routes get their own spec, `tests/e2e/cross-cutting-qa.spec.ts`, with stored records (three cases, a run with a Pass and a Fail), so the record pages are checked with content rather than their not-found state. `cross-cutting.spec.ts` stays the Phase 1 spec; the request recorder, the crypto-chunk check, and the focus-ring walk move to `helpers.ts` and serve both.
* NFR-025 is checked by marker strings from the QA pages' code ("Pass is saved at once", "New run with these", "Write a test case first."): `/`, `/address`, and `/settings` load none of them, and the run page does, which proves the markers mark QA code.
* The focus-ring walk accepts a ring drawn by the focused control's parent: the tag input draws it on its wrapper with `:has(input:focus-visible)`. The ring is visible; the old walk only looked at the control and its next sibling.
* FR-091 AC-6 and NFR-023 for slice 2a: exporting and importing the PRD 10.5 data set without screenshots (1,000 cases, 20 runs of 100 cases, 2,000 results; a 3.0 MB file) gives no main-thread task over 200 ms. Measured at 4x CPU throttle in Chromium: at most 119 ms over three runs, so the backup code stays on the main thread. A first measure of 703 ms at 4x was Playwright's own script turning a 3 MB buffer into a File in the page (seen in a CPU profile; the app's code took about 25 ms of it); the test passes the downloaded file by path instead. Screenshots join the data set in slice 2b, with the worker NFR-023 asks for.
* `src/traceability.test.ts` gains a Phase 2 check: it reads the 21 requirements of PRD section 10.3 and requires every ID in its shipped list (slice 2a: FR-090, FR-091, FR-100 to FR-102, FR-110, FR-111, FR-113, FR-123) to be named by a test. The list must hold Phase 2 IDs only, so a typo fails the test. Slices 2b and 2c extend the list.

### 2026-11-24: Slice 2b plan approved

* Owner decision: the slice 2b breakdown in `docs/plan.md` (M5, T-057 to T-066) is approved as a block, with every proposal and assumption in findings F-7 to F-13. In short: screenshots added before Save result wait in the case's draft and are written with the result in one transaction (F-7); one `screenshots` store keyed by an `owner` array, ready for slice 2c findings (F-8); the whole backup is built and read in a worker (F-9); the bug report format is remembered in `localStorage`, outside the backup (F-10); screenshots stay with a result when its status changes (F-11); Download all has a fallback if a browser refuses several downloads (F-12); the CSP adds `blob:` to `img-src` only (F-13).
* T-057 checks the browser facts of PRD 10.7 before any code depends on them; a fact that turns out differently is brought back to the owner before the plan changes.

### 2026-11-24: Browser facts for slice 2b (T-057)

Checked with a throwaway route and worker on the built site (`vite preview`), in Playwright's Chromium 158, Firefox 159, and WebKit (Safari 27.2 engine) on macOS. Small fixture images (PNG, transparent PNG, JPEG, WebP, a two-frame GIF, AVIF, HEIC) were made with Python and `sips`; the 12 and 50 megapixel inputs were drawn in the worker. The route, worker, fixtures, and spec are not merged.

* **Decoding in a worker.** `OffscreenCanvas` and `createImageBitmap` exist in a worker in all three. PNG, JPEG, WebP, GIF, and AVIF decode everywhere; HEIC decodes in WebKit only (Chromium and Firefox throw `InvalidStateError`), which matches the design's "This browser cannot open <file> (HEIC)." A GIF decodes to its first frame in all three (EC-030).
* **Encoding.** `convertToBlob({ type: 'image/webp', quality: 0.8 })` gives WebP in Chromium and Firefox. WebKit does not throw: it silently returns `image/png`. So the image worker must check the returned `blob.type` and encode JPEG when it is not WebP (FR-112 AC-2); a PNG result is never kept (1.8 MB for a 1,920 px image, against 35 KB as WebP).
* **Transparency.** Drawn on a white fill first, the transparent half of a PNG comes back white in the JPEG; without the fill it comes back black in all three. The fill is needed for JPEG (EC-030).
* **Large images.** 12 and 50 megapixel JPEGs decode, scale to a 1,920 px long edge, and encode in the worker in every browser, with no main-thread long task (Long Tasks API in Chromium). Worker time for 50 MP: decode 115 to 307 ms, scale and encode 141 to 463 ms (WebKit slowest). `createImageBitmap` with `resizeWidth`, `resizeHeight`, and `resizeQuality: 'high'` returns the target size in all three, so T-059 can decode straight to the output size and skip the full-size bitmap.
* **Blobs in IndexedDB.** A `Blob` stores and reads back in Chromium and Firefox. In WebKit the write fails (the transaction errors with no error object), in Playwright's ephemeral context, which behaves like a private window. An `ArrayBuffer` stores and reads back in all three. **Changes finding F-8 (approved by the owner, 2026-11-24):** a screenshot record holds `bytes: ArrayBuffer` and its `mediaType`, and a `Blob` is made from them when shown or downloaded, so screenshots also work in Safari private windows and in CI's WebKit.
* **CSP.** An `<img>` with a `blob:` URL is blocked in all three, reported as an `img-src` violation, as finding F-13 expected.
* **Persistent storage.** `estimate()` and `persisted()` work in all three (`persisted()` is false at first). `persist()` after a click: false in Chromium and WebKit; in Firefox the promise does not settle within 3 s, because Firefox asks the user. MDN (Storage quotas and eviction criteria) says Chromium browsers and Safari decide silently from the user's interaction with the site, and Firefox shows a prompt; web.dev's "Persistent storage" names Chrome's signals (engagement, installed or bookmarked, notification permission). So T-064 shows a waiting state until the browser answers, never assumes an answer, and the copy for "not granted" says the browser decides. Safari's proactive 7-day deletion of script-written data without interaction (MDN) is a known limit for the README.
* **Several downloads from one click.** All three browsers delivered three files from one click under Playwright, which accepts downloads on its own. Chrome Help lists an "Automatic downloads" site setting but does not state its default, so a real browser may still ask; F-12's fallback stays, and T-065 includes a manual check in a real Chrome.
* **Jira wiki markup escaping: not verified.** Jira's text formatting notation help needs a login on jira.atlassian.com and on the public Apache Jira, and the Jira Cloud support page is gone (HTTP 404). The Confluence wiki markup page (readable) lists the same markup characters but no escape rule. Open: T-058 builds the Jira renderer on the PRD's character list with backslash escapes, and its golden output is checked once by the owner in their Jira (an extension of the FR-121 AC-5 owner action), or the owner provides the help page text from their own Jira.

### 2026-11-24: QA core for slice 2b (T-058)

* **Summary limit: 200 characters** [ASSUMPTION], the title limit (`SUMMARY_MAX = TITLE_MAX`), as in the approved prototype. PRD 10.5 names no limit for FR-120 AC-4; Jira's own summary limit is 255, so 200 always fits. A cut summary ends with "…" and never splits a surrogate pair. The summary uses the first line of the actual result that has text, as the run summary does.
* **Steps field format.** The dialog has one Steps textarea (design 13.3 P2-05). A line with no indent that starts with a number and `.` or `)` starts a step; any other line continues the step above, so a step can hold line breaks (FR-121 AC-4). Pre-filled steps indent their continuation lines under the text. Blank lines and empty steps are dropped when rendering.
* **The run and case reference** goes in Notes, after the result's notes: "Run: Smoke (v2.3.0), case TC-12.", as in the prototype (FR-120 AC-1).
* **Markdown escaping.** The run summary's inline escapes (`` \ ` * _ [ ] < > | ~ & ``) on every line of user text, plus at the start of a line `#`, `+`, `-`, `=`, and the `.` or `)` after a number. Lines are trimmed, so indentation never makes a code block. Each typed line ends with a CommonMark hard break (`\` at the end of the line), so line breaks show as typed.
* **Jira escaping** [VERIFY], built from the characters in FR-121 AC-2 because Atlassian's notation page could not be read (T-057). A backslash before `{ } [ ] | * _ ^ ~ + !` everywhere. `-` is escaped unless it sits between two letters or digits, so dates and hyphenated words stay plain. `?` is escaped only in pairs (`??cite??`). At the start of a line, `#` and the dot of `h1.` to `h6.` and `bq.` are escaped. A backslash in user text becomes `&#92;`, because `\\` is Jira's line break and a backslash before a markup character would escape it. A step's lines are joined with ` \\ `, because a list item ends at a line break. Other lines rely on Jira showing a single line break as a line break. Known limits, not escaped: emoticons such as `(y)` or `:)`, and `_` inside a URL, which may break the link. The owner checks the golden output by pasting it into Jira (Owner actions in `docs/plan.md`).
* **Golden files**: `src/lib/core/qa/fixtures/bug-report.markdown.txt` and `bug-report.jira.txt` (`.txt`, so Prettier leaves them alone), from one report with braces, pipes, asterisks, backticks, a leading `#`, `{code}`, `{panel}`, line breaks inside a step, and a backslash. Vitest's `toMatchFileSnapshot` does not write a missing golden file under `CI=true`, so CI fails when a golden file is missing or the output differs.
* **Mutation check**: each escape rule was removed in turn: 11 Jira characters, 11 inline Markdown characters, 4 line-start Markdown characters, numbered-line escapes in both formats, the backslash entity, the dash and `??` rules, `h3.`/`bq.`, and both line-break rules (34 mutants). The report tests failed for each one. A first run found that the line-start `>` rule could never change the output, because `>` is already an inline escape; that rule was removed.
* **Screenshot rules** (`screenshots.ts`): the PRD 10.5 limits; sizes are decimal (25 MB = 25,000,000 bytes), as file managers show them. A file with an empty type but an image extension counts as an image (Chromium gives HEIC files no type), so it is the decode step that reports "This browser cannot open IMG_1.heic (HEIC)." The output size scales the long edge to 1,920 px, keeps the aspect ratio, never enlarges, and keeps each side at least 1 px. Attachment names use the first 8 letters and digits of the run ID: `TC-12-1a2b3c4d-1.webp`. Error copy is from design 13.7.
* `PRIORITY_LABELS` moved to `lib/core/qa/types.ts`, so the report renderer can use it; `tools/cases/present.ts` re-exports it, so its importers are unchanged.

### 2026-11-24: Long result tables are built a step per frame

* The cross-cutting check "500 addresses with every variant" (NFR-005) failed three CI runs in a row: 205, 209, and 216 ms against 200 ms. A CPU profile at 4x and 5x throttling showed one task of about 190 ms, the `DataTable` render of about 511 rows at once. With the enter animation on (result sets), the table built every row in one task; only stored lists without the animation were built 50 rows per frame (FR-101 AC-4). Playwright's trace snapshot added a separate task of about 60 ms, not the cause.
* Change: with the enter animation too, `DataTable` creates rows 50 per frame, and a new result set starts again from the first step. The 12 staggered rows and the one-block animation of the rest are unchanged. Rows added to that block in later frames appear without animating, below the 640 px scroll box.
* Measured with tracing on, as in CI: the longest task fell from about 200 ms to 99 ms at 4x and 117 ms at 5x throttling.

### 2026-11-25: Persistent storage in Settings (T-064)

* **Where**: a Storage part under Data in Settings (`StorageSection.svelte`, design 13.3 S-10). It reads `navigator.storage.estimate()` and `persisted()` when the page opens and shows "38 MB of about 2 GB used" on a determinate bar, then a badge: "Persistent", or "Not persistent" with "The browser may delete this data when disk space runs low." The quota is the browser's estimate, hence "about".
* **Asking only on a click** (FR-092 AC-2): "Keep data persistent" (secondary, hidden once persistent) is the only caller of `persist()`. While the browser has not answered (Firefox's prompt, T-057), the button shows its loading state and "Waiting for the browser's answer…"; the page never assumes an answer. A yes changes the badge and is announced ("Storage is now persistent."). A no shows "The browser did not make storage persistent." with one line on how browsers decide, and focus moves to it; the button stays for another try. A rejected promise is an error ("The browser could not be asked.").
* **One line for every browser** [ASSUMPTION; design 13.7 asked for "one line on how that browser decides"]: "Chrome, Edge, and Safari decide on their own, for example once you visit often or bookmark the site; Firefox asks you." From T-057 and MDN. Guessing the browser from its user agent to show a line per browser was rejected as fragile.
* **Degrades**: without `navigator.storage` the part says "This browser does not report how much storage is used or whether it is persistent." and offers no button; export and import are unaffected. A browser with `estimate()` but no `persist()` shows the use and the badge without the button.
* **E2E**: `navigator.storage` is replaced before the page loads, so every answer (granted, refused, a prompt still open, an error, no API) runs in all three browsers, and the stub counts `persist()` calls (none on load). One test reads each browser's real API without asking.

### 2026-11-25: Screenshots in run execution (T-063)

* **Where they live** (plan finding F-7): `RunShots` in `src/lib/tools/runs/shots.svelte.ts`, one per run page. A screenshot added before its result is first saved waits there, per case, in memory, and is passed to `runs.saveResult` with the result, so both are written in one transaction. On a stored result a screenshot is written at once. A waiting screenshot stays with its case while another case is open, like the unsaved form (T-055), and is lost when the page is left, as that form is [ASSUMPTION].
* **A screenshot's id is set when the image is made**: `NewScreenshot` now carries `id` (`crypto.randomUUID()`), and storage keeps it. The thumbnail of a waiting screenshot is the same item after the save, so it does not play the added transition again. Storage writes screenshots with `add`, so a repeated id is refused and never overwrites another screenshot (unit test).
* **Object URLs**: the open case's stored images are read when its area first shows and revoked when another case's area opens; waiting images keep theirs until saved, removed, or the page goes away (`dispose`). At most one case's stored images are in memory (NFR-004).
* **The area appears once a result is picked** [ASSUMPTION]: it sits with the fields that depend on the status (design 13.3 P2-04 item 3), and a screenshot of an untested case would have no result to belong to (F-7). A completed run shows it read-only.
* **Paste** (design 13.5, EC-029): handled on the result panel. A paste with an image file adds every file, also with focus in a text field, and the text is not pasted. A paste without one keeps its usual meaning in a text field; elsewhere in the panel it shows "The clipboard has no image.", and a file that is not an image shows "<file> is not an image." A paste outside the panel does nothing [ASSUMPTION; the design names the panel only].
* **Several images** (EC-029, FR-112 AC-6): compressed one after another in the worker and added up to five, counting stored, waiting, and compressing ones; the rest are refused with "5 of 5 screenshots". A refused file (not an image, cannot be decoded, too large) does not stop the files after it; the last refusal is shown. An image that finishes while the first save runs is written right after it.
* **GIF** (EC-030): the record keeps no first-frame flag, so the area says "Only the first frame of <file> was added." when it is added [ASSUMPTION; a flag in the record would need a schema change].
* **Full storage** (EC-032, FR-092 AC-3): the area shows the storage used from `navigator.storage.estimate()` and an "Open Settings" link; nothing is written.
* **Removal**: "Remove this screenshot?" with Cancel focused; focus then moves to the first control left in the area, as the thumbnail is gone. Deleting a run names its screenshots: "Its 1 result and 2 screenshots are deleted too. This cannot be undone." (design 13.7).
* **Firefox and WebP downloads**: Firefox saves a `.webp` (or `.avif`) file under its name and then opens it in a new tab, its default for images it can show; Playwright reports that tab, not a download. Sending the bytes as `application/octet-stream` does not change it, because Firefox goes by the extension, so the app downloads as before. JPEG and PNG start a normal download. This matters for Download all (T-065).
* **Found by the E2E**: right after the first save, a screenshot was briefly both stored and waiting, so the area listed it twice and Svelte threw `each_key_duplicate`. `itemsOf` now lists it once; a unit test covers the moment between the save and `saved`.
* **Test notes**: Firefox drops `clipboardData` given to the `ClipboardEvent` constructor, so the synthetic paste sets it on the event. A Playwright `click()` on Download waits for the navigation of Firefox's new tab, so that test dispatches the click. The PNG generator moved to `tests/e2e/helpers.ts` for the three specs that make images.

### 2026-11-25: Screenshot area, thumbnail, and image viewer (T-062)

* **Components** in `src/lib/ui`: `ScreenshotArea` (design 13.5), `Thumbnail`, and `ImageViewer` (design 13.6), with `image` and `download` icons. The area only shows what it is given (items, placeholders, an error); compressing, storing, and paste handling belong to the run page (T-063). `/components` shows each state and an interactive example that compresses chosen or dropped images in the existing image worker.
* **The target's name is its visible text** [ASSUMPTION]: "Paste, drop, or choose an image", not the design's "Add screenshot: paste, drop, or choose a file", so the accessible name matches what is shown (WCAG 2.5.3, label in name). The group is labelled "Screenshots optional, up to 5".
* **Full**: at five images, counting those still compressing, the target is replaced by "5 of 5 screenshots", and a drop on the area is ignored.
* **Read-only** (a completed run): thumbnails open, there is no target and no remove button, and an empty area says "No screenshots." [ASSUMPTION; the design has no copy for this case].
* **Added transition** (design 13.6): fade and scale from 0.96 over `--duration-base`, played only by thumbnails whose id was not shown when the area mounted, so opening a result with stored screenshots does not animate them. Reduced motion makes it instant through the duration tokens. A page that loads its items after mounting must mount the area once they are there; `/components` does this.
* **Viewer**: the shared `Dialog` gets a `wide` option that sizes the dialog to its content (`width: fit-content`, at least the normal 480 px, at most the window less its margins). The image is at most 70% of the window height. The meta line shows the attachment file name (FR-122) and the size; Download saves the stored image under that name. Escape and Close return focus to the thumbnail through the dialog's existing focus return. A native modal dialog makes the page behind it inert; Tab may move to the browser's own controls, but never to the page, which is what the E2E checks.
* **CSP** (finding F-13): `img-src` is now `'self' data: blob:`; `csp.spec.ts` checks the exact list and that `/components` loads with no violation.
* **Test note**: Playwright's `locator.evaluateAll` inside an open modal dialog crashes the page in Playwright's Firefox (reproduced 4 of 4); `evaluate` on the same element works, so the viewer test reads its one image with `evaluate`.
* The text test bed "Screenshot compression" on `/components` stays until T-063, because `image-worker.spec.ts` uses it.

### 2026-11-25: Backup v3 with screenshots (T-061)

* **Format.** `schemaVersion` 3 adds `data.screenshots`. Each screenshot is written with its fields and the image as base64 in `data`; `size` is left out and recomputed from the decoded bytes on import, so a file cannot claim a size its image does not have.
* **Version steps as data transforms** (plan note N-1): `UPGRADES` in `backup.ts` holds one function per step (2: empty test cases, runs, and results; 3: an empty screenshot list), applied in order before the guards. The guards check the current format only, which replaces the version 1 branch in `parseBackup`. A list an older file should not have is replaced, not trusted.
* **Screenshot guards** (FR-091 AC-5): canonical base64 only (a regex first, because `Uint8Array.fromBase64` also accepts spaces and line breaks), WebP or JPEG, an owner `['result', runId, caseNumber]` that is a result in the file, a number unique for its result, at most five per result, one id per screenshot, width and height from 1 to 1,920 px. Messages follow the result messages: "Screenshot 3 of 200 ("TC-12") in run "Smoke" belongs to no result in the file."
* **Base64** uses the platform's `Uint8Array.prototype.toBase64` and `Uint8Array.fromBase64`, checked in the worker of all three Playwright browsers (Chromium 158, Firefox 159, WebKit 27.2) and in Node 26. No dependency.
* **Worker** (finding F-9): `backup.worker.ts` builds the JSON file as a Blob and reads, checks, and decodes a chosen file. The page reads IndexedDB and transfers the screenshot bytes to the worker, and the worker transfers the decoded bytes back; only the Blob and the records cross by copy. The worker starts on the first export or import and is terminated when Settings is left (`backup-jobs.ts`, the same pattern as the image client).
* **File size before the download** (FR-091 AC-4) [PROPOSAL, approved by the owner 2026-11-25]: an export with screenshots opens "Download backup?" with the file name, its exact size, and the screenshot count, and downloads on Download; Cancel downloads nothing. An export without screenshots downloads at once, as before. "Preparing backup…" shows while the file is built.
* **Import dialog counts** come from `countRecords()` (IndexedDB `count()`), so it no longer reads every stored record, images included, only to count them. A Screenshots row is added, and the success message names the screenshot count.
* **Images are written one after another during an import.** The first measure of the full data set at 4x CPU throttling gave a 179 to 197 ms task right after Replace all data: queuing every `put` at once copied the 40 MB of images into the requests in one task. `replaceRecords` now queues the small records at once, as before, and writes each image after the one before it succeeds, inside the same transaction, so the import stays all or nothing. A write that throws before it becomes a request aborts the transaction, and the error kind (such as `quota`, EC-032) is kept.
* **Measured** (Chromium, the PRD 10.5 data set: 1,000 cases, 20 runs of 100 cases, 2,000 results, 200 screenshots of 200 KB random bytes; a 56.4 MB file): the longest main-thread task at 1x was 64 ms, at 4x 109 to 132 ms over three runs, and at 5x 136 ms. Without screenshots T-056 measured at most 119 ms at 4x, and the remaining task is that same queue of small records. Peak page JS heap: 60 to 64 MB. Peak renderer memory sampled with `ps` over the whole test: about 1.3 GB. That counts every renderer process and includes the test's own 40 MB of seeded images and memory not yet collected, so it is an upper bound, not the app's figure. The worker's heap is not visible from the page. Building the JSON as one string, and reading the file as one string, are the largest single allocations; streaming them would need a hand-written JSON writer and parser, not done [PROPOSAL for later if memory becomes a problem].
* **Mutation check**: removing the base64 regex, the per-result limit, the owner check, the duplicate number or id check, the version 3 step, the media type check, the 1,920 px limit, or the size from the bytes each failed the backup tests (9 mutants), as did removing the abort or the kept error kind on a failed image write (2).

### 2026-11-25: Screenshot storage, schema v3 (T-060)

* **Store** (`screenshots`, migration 3, plan finding F-8): key `id` (`crypto.randomUUID()`), index `byOwner` on `owner`, an array key `['result', runId, caseNumber]`. One `IDBKeyRange.only(owner)` reads a result's screenshots; `IDBKeyRange.bound(['result', runId, -Infinity], ['result', runId, Infinity])` finds a whole run's. Fields: `owner`, `n`, `mediaType`, `width`, `height`, `size` (bytes), `createdAt`, and `bytes: ArrayBuffer`. Migration 3 adds the store only; the v2 records are untouched.
* **Numbering** [ASSUMPTION]: a new screenshot gets one more than the result's highest `n`, so removing one leaves the others' attachment names as they were (FR-122). Rejected: renumbering 1 to 5 after a removal, which would give an already-downloaded file's name to a different image.
* **The limit is checked in the write transaction.** `addScreenshot` and `saveResult` read the result's screenshots and write in one `readwrite` transaction on `results` and `screenshots`. IndexedDB runs overlapping `readwrite` transactions one after another, also across tabs, so two tabs cannot both add the fifth (a unit test opens two connections and adds at once). `addScreenshot` also refuses when the result is not stored (its run was deleted in another tab), so no screenshot is left without an owner (FR-091 AC-5).
* **A result with its pending screenshots** (finding F-7): `saveResult(result, pending)` writes the result and the screenshots added before its first save in one transaction; a failure writes neither. Stored screenshots stay when the result changes (F-11). Every result save now goes through this method; without screenshots it behaves as before.
* **Cascade deletes** (NFR-024, EC-034): deleting a run reads its screenshot keys and deletes them with the run and its results in one transaction. An import clears the `screenshots` store with the others, because those screenshots belong to the results being replaced; backup v2 carries no screenshots, and backup v3 adds them (T-061). Exporting before T-061 leaves screenshots out, and no screen can add one before T-063.
* **Errors** (EC-032, FR-092 AC-3): the storage layer returns `limit` and `missing` besides the storage codes. `runs.svelte.ts` turns a screenshot write's `limit` into the `limit` `ScreenshotError` and a quota error into the `storage` kind with `navigator.storage.estimate()`'s used and available bytes (left out where the browser gives none), so the 13.7 copy can name the storage used. A quota error on a result saved without screenshots keeps the plain storage copy. `missing` reads as a failed save [ASSUMPTION]: it happens only when another tab deleted the run.
* **Memory** (NFR-004): `runs.svelte.ts` keeps each screenshot's metadata, not its image. `readScreenshotMeta` reads with a cursor, one record at a time, and drops the bytes; images are read per result (`images()`) when they are shown.
* **Mutation check**: removing the add limit, the owner check, the save limit, the cascade delete, the import clear, or the numbering rule, or counting without the stored screenshots, each failed the unit tests (7 mutants).

### 2026-11-24: Image worker (T-059)

* **Pipeline** (`lib/workers/image-pipeline.ts`): check the type and the 25 MB limit, decode with `createImageBitmap`, check the 50-megapixel limit, scale with `createImageBitmap` resize options (`resizeQuality: 'high'`) when the long edge is over 1,920 px, encode WebP at 0.8 on `OffscreenCanvas`, and when the browser returns another type (WebKit gives PNG, T-057), draw again on white and encode JPEG at 0.8. Every decoded bitmap is closed, also on failure. The browser calls are passed in as a platform, so the order of steps is unit-tested in Node; `image.worker.ts` supplies the real one.
* **Protocol** (`lib/workers/messages.ts`): `compress` with the file and the name shown in messages; answers are `done` (bytes transferred, not copied; type, size, and `firstFrameOnly` for a GIF), `refused` (a `ScreenshotError` from T-058, shown with its design 13.7 copy), or `error` (unexpected, such as no canvas or out of memory). The worker handles one image at a time, so several 50-megapixel images never sit in memory together.
* **Client** (`lib/workers/image-jobs.ts`): like the address and dummy-data clients, but next to the worker, because run execution and, in slice 2c, session findings both use it. The worker starts on the first image.
* **Pixel limit after decoding**: the pixel count is known only after decoding, so an image over 50 megapixels is decoded before it is refused. A file within 25 MB can still decode to a very large bitmap; if the worker runs out of memory, the client rejects with the worker's error.
* **Test bed**: a "Screenshot compression" section on `/components` (as decided for T-008) runs the worker on a chosen file and shows the result as text, because the CSP blocks `blob:` images until T-062. The screenshot area replaces it in T-062 and T-063.
* **E2E** (`tests/e2e/image-worker.spec.ts`, three browsers): test images are built in Node at test time (PNG with zlib, a two-frame GIF from bytes), so no large file is committed; the only fixture is a 630-byte HEIC made with macOS `sips`. A 12-megapixel PNG gave no long task at all (none over 50 ms) in Chromium, in three runs. WebKit's white fill under JPEG is checked by the unit tests (the fill comes before the draw), not by reading pixels in E2E.
* **WebKit differs by platform** (found on CI, PR 75): Playwright's WebKit on Linux encodes WebP and cannot decode HEIC, the opposite of WebKit on macOS, where T-057 checked it. The worker was right in both, because it checks the encoded type; the E2E had assumed the macOS behaviour from the browser's name. The E2E now asks the browser: it encodes a 1 × 1 WebP to learn the expected output type, and decodes the HEIC fixture to learn whether HEIC should open. The T-057 facts about WebKit hold for Safari on macOS and iOS, the WebKit the app's users run.

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
* Amended by the T-004 spike (2026-11-12): `style-src-attr 'unsafe-inline'` is added, because SvelteKit's route announcer (and any Svelte template with a `style` attribute) sets inline style attributes. `<style>` elements stay `'self'`-only and scripts stay hash-only. See the T-004 entry for the verified behaviour.

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
* Revised 2026-11-17 (T-035): the re-check also requires an old transaction to be found and an unknown hash to come back as "not found". Ethereum, Sepolia, Polygon, Amoy, and Base Sepolia move to Tenderly's public gateways; mempool.space is verified for Bitcoin. See the decision of 2026-11-17 and `docs/architecture.md` section 5.

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

### ADR-015: IndexedDB schema v2 for test cases and runs

* Status: Accepted (owner, with the slice 2a plan, 2026-11-19)
* Context: PRD section 10 (FR-100 to FR-113, FR-123), NFR-016, NFR-024, NFR-026, EC-027, EC-033; `docs/architecture.md` section 3.1.
* Decision: migration 2 adds `testCases`, `runs`, `results`, and `meta`. A run stores a snapshot of each case at creation. Each result is its own record keyed `[runId, caseNumber]`. Case keys come from a `caseCounter` in `meta`, raised in the same transaction that writes the new case, never reused, and rebuilt on import from the highest case or snapshot number. Export `schemaVersion` becomes 2; import accepts 1 and 2.
* Rejected: results inside the run record (two tabs saving different cases would overwrite each other, against FR-111 AC-8); runs that reference live cases (editing a case would rewrite past results, against FR-110 AC-3); keys from the highest stored number (a deleted last case would give its key away); one store per slice with screenshots now (no screenshot code in 2a; v3 in 2b is a small additive step).
* Consequences: a run's progress is computed from its results on every read, which is cheap at 500 cases; the import guards check that every result belongs to a case in its run; the backup file grows by the snapshots, which duplicate case text by design.

## Build order

1. Blockchain toolkit + dummy data (slices 1a, 1b, 1c; first deploy at the end of 1a)
2. Test cases, test runs, bug reports
3. PRD generator
4. Demo mode

## Out of scope (for now)

APK + emulator + automation from Firebase App Distribution (separate, much heavier project).

Backend (owner, 2026-11-16): a server for team sharing of test cases and runs, sync across devices, an RPC proxy for CORS and rate limits, or keeping API keys out of the browser. A future feature, not planned; it would change the "no backend, data stays in the browser" constraint and needs its own PRD and decision first.
