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

## Build order

1. Blockchain toolkit + dummy data (slices 1a, 1b, 1c; first deploy at the end of 1a)
2. Test cases, test runs, bug reports
3. PRD generator
4. Demo mode

## Out of scope (for now)

APK + emulator + automation from Firebase App Distribution (separate, much heavier project).

Backend (owner, 2026-11-16): a server for team sharing of test cases and runs, sync across devices, an RPC proxy for CORS and rate limits, or keeping API keys out of the browser. A future feature, not planned; it would change the "no backend, data stays in the browser" constraint and needs its own PRD and decision first.
