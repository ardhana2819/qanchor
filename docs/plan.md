# QAnchor: Implementation Plan

* Status: APPROVED (owner, 2026-11-12)
* Scope: Phase 1 (slices 1a, 1b, 1c). Phases 2 to 4 are not broken down because they have no FR IDs yet.
* Sources: `docs/prd.md` v0.3, `docs/design.md` v0.3, `docs/architecture.md` v0.1, `docs/decisions.md`
* Date: 2026-11-12

How this plan is used:

* One task = one branch = one PR. Branch name: `<type>/t-xxx-short-name` (for example `feat/t-013-unit-converter`).
* After approval, tasks are executed one at a time; work stops after each task until the owner says to continue.
* Status values: `todo`, `in progress`, `done`, `blocked`. This file is updated in the same PR as the task.
* "Spike" tasks check an uncertain fact or technique before code depends on it. They are placed early on purpose.
* Every task's definition of done also includes the general one in `CLAUDE.md` (CI green, keyboard usable, states complete, README updated where relevant). The column below lists only what is specific to the task.

## Milestones

| Milestone | Goal | Ends with |
| --- | --- | --- |
| M0 Walking skeleton | Smallest app that builds, runs, tests, and passes CI, with the final folder structure | Green CI on a PR; prerendered `index.html` and `404.html` |
| M1 Slice 1a | App shell, unit converter, amount edge cases, address generator and validator | **First production deploy** to Cloudflare Pages |
| M2 Slice 1b | Dummy data, checklists | Deployed automatically on merge |
| M3 Slice 1c | Tx lookup, calldata decoder, testnet wallet tracker | Phase 1 complete |

## Task table

### M0 Walking skeleton

| ID | Task | FR/US/NFR | Depends on | Definition of done | How to verify | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-001 | Scaffold SvelteKit (TypeScript, Svelte 5, adapter-static, `prerender = true`, `trailingSlash = 'never'`), folder skeleton from architecture section 2, `.nvmrc`, npm scripts, ESLint (incl. `no-console`, `lib/core` import restriction), Prettier, svelte-check | FR-001 (partial), NFR-022 | none | Build output has `index.html` and `404.html`; lint, format check, and typecheck pass | `npm run build`, `npm run lint`, `npm run check` | Low | done |
| T-002 | Test harness: Vitest with one unit test (`lib/core/result.ts`); Playwright for Chromium, Firefox, WebKit against `vite preview`, with one E2E (index page shows its heading) | NFR-007 | T-001 | Both suites pass locally in all three browsers | `npm test`, `npm run test:e2e` | Low (WebKit install on CI) | done (WebKit: see task notes) |
| T-003 | CI workflow (lint, typecheck, unit, build, bundle size, E2E) and `scripts/check-bundle-size.mjs` | NFR-001, NFR-020, ADR-009 | T-002 | PR shows all CI jobs green; the size script prints the measured gzip size and fails when the limit is lowered on purpose | GitHub Actions run; local run with a low limit | Low | done |
| T-004 | Spike: CSP in hash mode with the inline theme script, `static/_headers`, and `404.html` fallback | FR-002 AC-1, NFR-017, NFR-022, ADR-007, ADR-011 | T-001 | Built pages carry a CSP meta tag that includes the theme script's hash; no CSP violations in the console in three browsers; findings written to `docs/decisions.md` | Inspect build output; Playwright console check | **High**: the `kit.csp` behaviour for `app.html` scripts is unverified | done |

### M1 Slice 1a

| ID | Task | FR/US/NFR | Depends on | Definition of done | How to verify | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-005 | Design tokens and base CSS from `docs/design.md` section 2; Inter Latin subset; `prefers-reduced-motion` | NFR-006, NFR-009, ADR-010 | T-001 | `app.css` tokens match the design brief for both themes; font file size recorded in this plan | Visual check against `prototype/`; file size from build output | Low | done |
| T-006 | App shell: sidebar with shipped tools only, skip link, landmarks, footer commit ID, toolkit index, not-found page, small-screen top bar | FR-001 AC-1 to AC-4, AC-6, AC-7; NFR-021; US-010 | T-005 | Every route's static HTML contains heading and navigation; unknown URL shows the not-found state; nav works by keyboard | E2E: deep-link reload, unknown URL, Tab through nav; inspect built HTML | Low | done |
| T-007 | Theme control (System / Light / Dark), pre-paint script, follows OS changes, persisted | FR-002, US-011 | T-004, T-006 | No light flash in dark mode on any prerendered page; choice survives reload (stored in `localStorage`, finding F-1); System follows OS changes live | E2E with `colorScheme` emulation in three browsers | Medium | done |
| T-008a | Depth and motion tokens (design v0.4); UI primitives Button, IconButton, Field, Text/Number input, Select, Checkbox group, Segmented control (theme control reuses it), Tabs, Badge, Callout, Empty state, Form panel; `/components` reference page | NFR-008, NFR-009, NFR-010; NFR-006 | T-005 | Each component has its states from design section 6; focus ring visible; screen-reader names present; each catalogue animation uses only opacity/transform, is 0 ms under reduced motion, and holds 60 fps in a performance trace | E2E and axe scan on `/components`; Chrome performance trace (frame rate reported) | Low | done |
| T-008b | Toast + live region, Data table (results-enter stagger), Dialog (open/close motion), added to `/components` | NFR-008, NFR-009, NFR-010; NFR-006 | T-008a | Same as T-008a; stagger capped at 12 rows; dialog traps focus and returns it to the trigger | E2E and axe scan on `/components`; performance trace on a 500-row table | Medium (focus handling, 500-row trace) | done |
| T-009 | Output actions: Copy, Copy all, Download (CSV/JSON), clipboard-denied fallback | FR-004, EC-023 | T-008b | Copy puts the exact value on the clipboard and announces it; denied clipboard shows the error and keeps the value selectable | E2E with clipboard permissions granted and denied | Medium (clipboard APIs differ per browser) | done |
| T-010 | Storage layer: `idb` schema v1, migration runner, unavailable detection + banner, quota errors, `versionchange` handling | NFR-016, EC-001, EC-002, EC-003, ADR-014 | T-006 | Unit tests for migrations; banner appears when IndexedDB is blocked; a quota error leaves existing data intact | Vitest for migration transforms; real-browser E2E for IndexedDB behaviour (note N-1), including blocked storage | Medium | done |
| T-011 | Settings page: Appearance and Data sections; JSON export; import with validation, summary dialog, replace-all | FR-003, US-010, EC-020, ADR-008 | T-008b, T-010 | Export file has app, schemaVersion, exportedAt, data; invalid, unknown-version, or truncated files write nothing and name the reason | Unit tests for guards; E2E export → import round-trip | Low | done |
| T-012 | BigInt decimal helpers in `lib/core/amount`: parse and format with D = 0 to 36, rejection rules (comma, `+`, scientific notation, negative), whitespace trimming where allowed | FR-021 AC-6, FR-030 AC-3/AC-4, FR-031, EC-012, EC-013, ADR-003 | T-002 | 78-digit values round-trip exactly; every rejection rule has a test | Vitest | Low | done |
| T-013 | Unit converter page: families (ether, BTC, SOL, TRX, custom token), live conversion, field errors; first nav entry (with its icon), small-screen menu E2E test and menu animation (design 2.4) | FR-030, FR-031, FR-032, US-004 | T-009, T-012 | AC examples from the PRD produce the exact strings; `0.5 wei` and `1,5` show their errors without updating other fields | Vitest for conversions; E2E for typing and errors | Low | done |
| T-014 | Spike: verify token decimals for the amount presets against primary sources (contract or official docs) | FR-020 AC-2 [VERIFY] | none | Each preset value has a source link recorded in `docs/decisions.md`; any mismatch reported to the owner before T-016 | Review of recorded sources | Low | done |
| T-015 | Amount edge-case generator in `lib/core/amount` | FR-020 AC-3, FR-021, EC-012 | T-012 | Every case listed in FR-021 AC-1 to AC-3 is produced; omitted cases are reported with a reason; D = 0 produces no fractional cases | Vitest | Low | todo |
| T-016 | Amount edge cases page: presets, inputs, table, export | FR-020, FR-022, US-003 | T-009, T-014, T-015 | Export preserves input strings byte for byte, including whitespace and separators | E2E download content check | Low | todo |
| T-017 | Encoding core: EIP-55, Base58Check, bech32 / bech32m, hex | NFR-014 | T-002 | Published EIP-55, BIP-173, BIP-350, and Base58Check vectors pass | Vitest | Low | todo |
| T-018 | Chain modules for EVM, Tron, Solana: derive from a CSPRNG key, validate, risky samples (zero address, all-lowercase, off-curve Solana address) | FR-010 AC-2, AC-6; FR-011 AC-5; EC-004, EC-006; NFR-012, NFR-013 | T-017 | Every derived address passes its validator; key bytes are zero-filled after use; no seeded randomness in key paths | Vitest, including a test that keys come from `crypto.getRandomValues` | Medium | todo |
| T-019 | Bitcoin module: P2PKH, P2SH, P2WPKH, P2TR (BIP-341 tweak), mainnet and testnet | FR-010 AC-2, AC-5 | T-017 | BIP-341 and BIP-350 vectors pass; generated addresses round-trip through the validator for every type and network | Vitest | **High**: hand-written Taproot tweak | todo |
| T-020 | Invalid variants per chain, look-alike variants, variant applicability | FR-011 AC-2 to AC-4, EC-007 | T-018, T-019 | An automated test generates every variant for every applicable chain/type/network and asserts the selected validator rejects it; look-alikes pass their source chain | Vitest | Medium | todo |
| T-021 | Address worker and Generate tab: form, worker job, results table, export | FR-010 AC-1, AC-3, AC-4; FR-011 AC-1; FR-012; US-001, US-002; NFR-005, NFR-012, NFR-019 | T-009, T-020 | 500 addresses generate without a main-thread long task over 200 ms; count limits enforced; export records have all FR-012 fields | E2E; performance trace for N = 500 | Medium | todo |
| T-022 | Validate tab: live verdict, multiple matches, named defects, whitespace and invisible characters | FR-014, US-012, EC-007 | T-008a, T-020 | Each AC of FR-014 has an E2E case; no network request is made | E2E with request recording | Low | todo |
| T-023 | Cross-cutting E2E for slice 1a: idle has no requests, request allowlist, no key material in DOM/storage/requests, axe scan in both themes, reduced motion, keyboard paths, no crypto chunk on the default route | FR-001 AC-5; NFR-003, NFR-006, NFR-008, NFR-009, NFR-011, NFR-012, NFR-015 | T-013, T-016, T-021, T-022 | All specs green in three browsers | CI | Medium (flaky timing on idle checks) | todo |
| T-024 | README (shipped tools, roadmap) and first deploy: Cloudflare Pages Git integration, project `qanchor`, analytics off; check `*.pages.dev` name, 404 status, CSP and headers, commit ID; measure Lighthouse, LCP, idle heap; decide Inter vs system font | NFR-002, NFR-004, NFR-017, NFR-021; OQ-27 | T-023 | Live URL serves the build of `main`; measured numbers recorded in this plan; Inter decision recorded | Manual checks on the live site | Medium; **needs the owner** to connect the GitHub repo in their Cloudflare account | todo |

### M2 Slice 1b

| ID | Task | FR/US/NFR | Depends on | Definition of done | How to verify | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-025 | Spike: verify dummy-data facts (+62 length and operator prefixes, legacy NPWP check digit, account number length per bank, unassigned NIK region codes and phone prefixes) | FR-081 AC-2, AC-6, AC-7, AC-9 [VERIFY] | none | Each fact has a recorded source, or is reported to the owner as unverifiable before T-028 | Review of recorded sources | **High**: some facts may have no public primary source | todo |
| T-026 | Seeded PRNG and determinism contract, generator version constant | FR-082 | T-002 | Same seed gives byte-identical output; N+10 rows keep the first N identical; different seeds differ | Vitest | Low | todo |
| T-027 | Datasets: names, regions (all provinces and kabupaten/kota, sample kecamatan/kelurahan), banks, phone prefixes as lazy JSON | FR-081 AC-1, AC-3 | T-025 | Dataset sizes recorded; region hierarchy is consistent (every kota belongs to its province) | Vitest consistency checks | Medium (dataset size) | todo |
| T-028 | Field generators: name, phone (three formats), address, NIK, NPWP (both formats), bank account, identifier realism setting | FR-081, EC-016, EC-022 | T-026, T-027 | Every FR-081 AC has a unit test; NIK dates are real dates including 29 February; NIK agrees with gender, birth date, and region | Vitest | Medium | todo |
| T-029 | Scenario presets including invalid formats with reasons and duplicate NIK | FR-084 | T-028 | AC-1 to AC-5 of FR-084 pass; duplicate rows name the row they duplicate | Vitest | Low | todo |
| T-030 | Exporters: CSV (RFC 4180), JSON (identifiers as strings), SQL (PostgreSQL / MySQL quoting, table-name validation) | FR-083, EC-017, EC-018 | T-028 | A name such as `Ma'ruf` and an address with commas and newlines export to valid CSV and SQL | Vitest; SQL parsed by a test helper | Low | todo |
| T-031 | Dummy data worker and page: fields, count, seed, options, preset, progress, 100-row preview, seed display, fake-data note | FR-080, FR-081 AC-8, FR-082 AC-2, US-009; NFR-005 | T-008b, T-029, T-030 | 10,000 rows generate with no main-thread long task over 200 ms; export covers all rows | E2E; performance trace for N = 10,000 | Medium | todo |
| T-032 | Draft checklist content for the seven decided topics | FR-060 AC-1, AC-2; US-007 | none | Each item is one testable statement under a heading; **owner reviews the content before merge** | Owner review | Low | todo |
| T-033 | Checklists pages: list with item counts, filter with empty result, detail route, Copy as Markdown | FR-060, FR-061 | T-009, T-032 | Markdown copy matches `- [ ] item` format with headings | E2E | Low | todo |
| T-034 | Cross-cutting E2E for slice 1b, README and navigation update | NFR-003, NFR-005, NFR-009, NFR-011 | T-031, T-033 | All specs green; new tools listed in nav and index | CI; live site after merge | Low | todo |

### M3 Slice 1c

| ID | Task | FR/US/NFR | Depends on | Definition of done | How to verify | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-035 | Spike: re-check every default endpoint (including Bitcoin from a network where mempool.space is reachable), explorer URL templates, built-in faucet links | FR-041 AC-1, FR-043, FR-072; ADR-012 | none | `docs/architecture.md` section 5 updated with a new check date; any failing default replaced or reported | Recorded check output | **High** for Bitcoin | todo |
| T-036 | Network client: timeout, abort, error classification, endpoint resolution with overrides, EVM chain-ID check | FR-041 AC-3, AC-4; FR-042; EC-008, EC-009; ADR-013 | T-010, T-035 | Each `LookupError` code is produced by a unit test with a stubbed `fetch` | Vitest | Low | todo |
| T-037 | Settings: Endpoints section (default, override, reset, URL validation) | FR-041 AC-1 to AC-3 | T-011, T-036 | Non-https URLs (except `http://localhost`) are rejected; overrides persist and reset | E2E | Low | todo |
| T-038 | Tx parsers: EVM and Solana, to the common `TxResult` | FR-040 AC-2, AC-3; EC-010, EC-011 | T-012 | Fixtures for success, failed, and pending transactions parse correctly; missing fields give `bad-response` | Vitest with recorded fixtures | Medium | todo |
| T-039 | Tx parsers: Tron (HTTP API) and Bitcoin (Esplora) | FR-040 AC-2, AC-3; ADR-006 | T-012, T-035 | Same as T-038; Bitcoin shows inputs and outputs | Vitest with recorded fixtures | Medium | todo |
| T-040 | Tx lookup page: form, hash format check, single in-flight request, result panel, error callouts with Retry and focus, explorer link, abort on unmount, no polling | FR-040, FR-042, FR-043, US-005; EC-005, EC-024; NFR-019 | T-036, T-038, T-039 | Every FR-040 and FR-042 AC has an E2E case against stubbed endpoints | E2E with `route()` stubs | Medium | todo |
| T-041 | ABI core: signature and JSON ABI parsing, decoder for static and dynamic types, arrays, tuples | FR-050 AC-3, AC-4; FR-052; EC-014; ADR-005 | T-017 | Published ABI vectors pass; malformed offsets and lengths give a decoding error with no partial values | Vitest | **High**: hand-written decoder | todo |
| T-042 | Calldata decoder page: built-in selector table, raw-word fallback, errors, hand-off from tx lookup | FR-050, FR-051, FR-052, FR-053, US-006; EC-015 | T-040, T-041 | "Decode input" opens the decoder pre-filled; an unknown selector calls no external service | E2E with request recording | Low | todo |
| T-043 | Testnet wallets: add, edit, delete with confirmation, validation, Bitcoin testnet-only rule, duplicate warning, notes hint | FR-070, FR-071, US-008; EC-021, EC-025 | T-010, T-020 | Entries persist across reload; schema and export contain no key or mnemonic field | E2E; schema review | Low | todo |
| T-044 | Faucet links: built-in per network plus user-added, "no faucet listed" state | FR-072 | T-035, T-043 | Links open in a new tab with `rel="noopener noreferrer"` and submit nothing | E2E | Low | todo |
| T-045 | On-demand balance with fetch time; stale marking on error | FR-073 | T-036, T-043 | No balance request without a user action; failed refresh keeps the old value marked stale | E2E with stubs and idle check | Low | todo |
| T-046 | Cross-cutting E2E for slice 1c, README update, Phase 1 completion check against every FR | NFR-003, NFR-009, NFR-011, NFR-019 | T-040, T-042, T-044, T-045 | Traceability check: every Phase 1 FR has at least one passing test; live site lists all eight tools | CI; review of the FR list | Low | todo |

## Coverage check

Every Phase 1 FR is covered by at least one task:

| FR | Tasks |
| --- | --- |
| FR-001 | T-001, T-006, T-023 |
| FR-002 | T-004, T-007 |
| FR-003 | T-010, T-011 |
| FR-004 | T-009 |
| FR-010, FR-011, FR-012, FR-014 | T-018 to T-022 |
| FR-020 to FR-022 | T-012, T-014 to T-016 |
| FR-030 to FR-032 | T-012, T-013 |
| FR-040 to FR-043 | T-035 to T-040 |
| FR-050 to FR-053 | T-041, T-042 |
| FR-060, FR-061 | T-032, T-033 |
| FR-070 to FR-073 | T-043 to T-045 |
| FR-080 to FR-084 | T-025 to T-031 |

FRs not covered by any task: **none**. NFR-018 (dependency discipline) is a review rule on every PR rather than a task.

## Task notes

* **T-001 (done):**
  * SvelteKit 3.2 (released 2026-10-01) replaced several v2 conventions, so the scaffold follows the official `sv` 1.3 template: the SvelteKit config lives in the `sveltekit()` plugin in `vite.config.ts` (`svelte.config.js` no longer exists), the `#lib/*` subpath import replaces `$lib`, `$app/environment` is now `$app/env`, and `tsconfig.json` extends `$app/tsconfig`.
  * TypeScript is pinned to `~6.0`: SvelteKit 3 requires TypeScript 6, and `typescript-eslint` 8.72 and `svelte-check` 4.7 do not yet support TypeScript 7.
  * Folders from architecture section 2 are created by the task that adds their first file, not as empty placeholders; the `lib/core` boundary is enforced by an ESLint rule from the start.
  * `npm audit`: 0 vulnerabilities in runtime dependencies (there are none yet); 14 low/moderate advisories in dev tooling (for example `minimatch`, `deepmerge`), fixable only with breaking downgrades. Not part of the shipped site; re-checked in T-003.

* **T-002 (done, with one exception):**
  * Vitest 5.1 (unit, `src/**/*.test.ts`, Node environment) and Playwright 1.65 (E2E in `tests/e2e`, against `vite build` + `vite preview`, Chromium/Firefox/WebKit projects).
  * Unit: 3 tests pass. E2E: Chromium and Firefox pass locally.
  * **WebKit does not run locally**: Playwright's WebKit build (webkit-2388) crashes on launch on the owner's Mac (macOS 26.0.1, arm64) with `EXC_BAD_ACCESS` in `-[WKWebView _cornerConfiguration]`, inside AppKit, before any page loads. Reproduced with and without the shell sandbox, so it is not a permissions issue. WebKit passed in CI on Linux in T-003; re-check locally after a macOS or Playwright update.
  * npm 11 skipped the install script of the optional `fsevents` package (macOS file watching). Build and tests ran without it; the dev server's file watching was not checked.

* **T-003 (done):**
  * `.github/workflows/ci.yml`: job `checks` (lint, typecheck, unit, build, bundle size, `npm audit --omit=dev --audit-level=high`) and job `e2e` (one matrix entry per browser). Actions pinned to their latest major versions as of 2026-11-12: checkout v7, setup-node v7, upload-artifact v7. Node comes from `.nvmrc`.
  * `npm run size` (`scripts/check-bundle-size.mjs`): sums the gzip size of every script that `build/index.html` preloads or imports. First measurement: **30.48 KB** of the 80 KB budget. Verified to exit with code 1 when over the limit (limit lowered to 10 KB in a copy) and when `build/index.html` is missing.
  * `npm audit`: runtime dependencies 0 advisories; dev tooling still has 14 low/moderate advisories with no non-breaking fix. CI fails only on high or critical advisories in runtime dependencies.
  * First CI run (PR 7, run 43248758969): all four jobs green on Node 26.13.1, including **E2E in WebKit on Linux**, which closes the WebKit gap from T-002. CI measured 30.46 KB initial JS.

* **T-004 (done):** findings are in `docs/decisions.md` ("CSP spike results"). In short: the theme script's hash is computed in `vite.config.ts`; the script must follow `%sveltekit.head%` to be covered by the meta CSP (proven by a mutation test); `style-src-attr 'unsafe-inline'` is needed for SvelteKit's route announcer. `tests/e2e/csp.spec.ts` adds 7 E2E tests (CSP meta, no violations on `/` and on an unknown URL, 404 status, stored theme). T-007 no longer needs to write the pre-paint script, only the theme control.

* **T-005 (done):**
  * Inter Latin variable font: **47.1 KB** (48,256 bytes woff2), self-hosted, preloaded, `font-display: swap`, one emitted file shared by the `@font-face` and the preload link.
  * Size-adjusted `Inter Fallback` (Arial / Liberation Sans) computed from the two font files with fonttools in a throwaway virtualenv, not a project dependency.
  * Light and dark values use CSS `light-dark()` with `color-scheme`, so each token is defined once; `data-theme` switches `color-scheme`. The Vite 8 CSS minifier (lightningcss) also emits a fallback for browsers without `light-dark()`, and rewrites `0ms` as `0s`.
  * `tests/e2e/design-tokens.spec.ts`: 6 E2E tests (system light/dark, stored theme overrides system both ways, reduced motion zeroes durations, Inter loads from the same origin). Initial JS 31.02 KB.
* **T-006 (done):**
  * Shipped tools are listed in `src/lib/config/tools.ts`; the sidebar and the toolkit index both read it. The list is empty until the first tool ships, so the index shows "No tools have shipped yet." Each tool task adds its entry in the same change as its route, and T-011 adds the Settings link with the Settings route, so the nav never links to a missing page.
  * Small-screen menu: a native `<details>`. On wide screens `::details-content` is forced visible and the toggle hidden; below 1024 px the browser's own open/closed behaviour applies, and the menu closes after each navigation. Checked with temporary entries in Chromium and Firefox (closed by default, opens on click, closes after navigation). The E2E menu test is added with the first tool entry (T-013), because the menu is not rendered while the list is empty.
  * Footer shows `Build <7-char commit>` from `CF_PAGES_COMMIT_SHA` via Vite `define`, or `Build dev` locally (NFR-021).
  * Tool icons in the nav come with the first tool entry; only the product mark exists now.
  * Initial JS for `/`: 34.57 KB gzip (was 31.02 KB; adds `$app/state`, `$app/navigation`, `$app/paths`).
* **T-007 (done):**
  * Theme state in `src/lib/state/theme.svelte.ts`; the control in `src/lib/ui/ThemeControl.svelte` (a radio-based segmented control) sits at the bottom of the sidebar, outside the `nav` landmark. Below 640 px it wraps onto its own row of the top bar. T-011 reuses the same state on the Settings page; T-008's generic Segmented control can replace the component's markup.
  * "System" removes `data-theme` and the stored key, so CSS `light-dark()` follows the OS live with no JS listener (AC-3). Light and Dark are written to `localStorage` (`qanchor.theme`, ADR-014); if storage is blocked the choice still applies for the visit.
  * AC-1 is checked on `/` and the 404 fallback by reading the body colour the moment `<body>` is inserted, before any module script runs. Mutation-tested: with the pre-paint script disabled, both tests fail.
  * `tests/e2e/theme.spec.ts`: 9 tests. Initial JS for `/`: 35.39 KB gzip.
* **T-008a (done):**
  * Split from T-008 (owner, 2026-11-13): T-008a holds the form and status primitives, T-008b the Toast, Data table, and Dialog. Components live in `src/lib/ui/`; the shared input box is the global `.control` class in `app.css`.
  * `/components` is a prerendered reference page with every primitive in its states. It is not in the navigation; the component E2E and axe tests run against it (owner, 2026-11-13).
  * ThemeControl now renders the generic Segmented control. Its thumb slides only after the user picks an option; a stored choice applied after hydration jumps into place.
  * Tab indicator: a 1 px bar moved with `translateX` and stretched with `scaleX`, re-measured by a `ResizeObserver` when tab widths change (font load, zoom).
  * `tests/e2e/components.spec.ts`: 14 tests (axe WCAG 2.1 AA in light and dark, field linking, loading button, checkbox group, select, tabs keyboard pattern, indicator and thumb positions, theme thumb on load, panel halo, button press, no transitions on layout or shadow properties, reduced motion). Mutation-tested: thumb animating on load, a missing halo, a missing icon-button name, and a `box-shadow` transition each fail a test.
  * Performance trace (headless Chromium, `/components`, 30 animation windows: tab indicator, segmented thumb, theme change, panel halo in and out): worst frame interval per window median 18.4 ms at 1x CPU and 18.1 ms at 4x slowdown, i.e. about 60 fps; no task over 50 ms; about 20 layout events in total, so no animation lays out per frame. One 41 to 44 ms gap appears only on the first interaction of a page load, whichever control it is (first-input cost, not the animation).
  * New dev dependency: `@axe-core/playwright` (tests only, not shipped). Initial JS for `/`: 40.27 KB gzip (was 35.39 KB). The Segmented control in the shell adds 1.07 KB; the other 3.81 KB is Svelte runtime code the bundler places in a chunk shared with `/components`, which tool pages will need for the same primitives anyway.

* **T-008b (done):**
  * `src/lib/state/notify.svelte.ts` holds the shell's one polite live region and the toast; `Toaster.svelte` renders both in the layout (S-00). `notify.announce()` reads a message out (result counts); `notify.showToast()` also shows it for 4 s. The toast itself is not a live region, so nothing is read twice. Its leave fade keeps the text and switches `visibility` at the end.
  * Data table: two `<tbody>` elements, so at most 13 elements animate however many rows there are: the first 12 rows one by one (28 ms apart), then every later row as one block with the 12th. Rows animate when their keys are new, so only a new result set plays it. The table scrolls in its own focusable region with a sticky header.
  * Dialog: native `<dialog>` with `showModal()`. The browser makes the page inert, closes on Escape, and returns focus to the trigger on close; Tab cycles through the dialog and may pass through the browser's own UI but never reaches the page. Open and close fade with `@starting-style`; the close fade needs `overlay` support (Chromium), elsewhere it closes instantly.
  * Mutation testing showed that the dialog's manual focus return was redundant (browsers already do it), so it was removed; the same test runs on WebKit in CI.
  * `tests/e2e/components.spec.ts`: 10 more tests (24 in all): live region count, toast timing with a fake clock, table semantics, stagger delays, sticky header, table scroll at 375 px, dialog focus and Escape, focus return from the Close button, axe with a dialog open, reduced motion. Mutation-tested: a non-modal dialog, staggering every row, a 10 s toast, and a toast that is also a live region each fail a test.
  * Performance trace (headless Chromium, 4 rounds each): 500-row results enter at 60 fps once the rows are in, but inserting 500 new rows is one 46 ms task at 1x CPU (84 ms at 4x), so one or two frames are missed at the start (worst gap 35 ms). Dialog open: worst gap 18 to 21 ms at 1x, up to 26 ms at 4x. Dialog close plus toast: 18 to 20 ms. No task near the 200 ms budget.
  * Initial JS for `/`: 40.73 KB gzip (was 40.27 KB; the toast and live region in the shell).

* **T-009 (done):**
  * `lib/core/export/format.ts`: CSV (RFC 4180: header row, CRLF, quoting, doubled quotes) and JSON (array of objects, field order, all values strings). SQL is added with dummy data (T-031). 8 unit tests.
  * `lib/state/clipboard.svelte.ts`: one `copy()` for every output. Success shows the "Copied" toast, read out by the live region. Failure (API missing, denied, page not focused) opens one fallback dialog in the shell with the value in a read-only field, focused and fully selected. A textarea turns CRLF into LF, so a manual Copy all has LF line breaks.
  * `CopyButton` (icon swaps to a check with `--ease-spring`, back after 1.4 s), `OutputToolbar` (summary, Copy all, format, Download; disabled with no rows), `download.ts` (Blob + object URL, revoked after 1 s for Safari).
  * `/components`: the results table has the toolbar and a copy button per row; a stand-alone copy button copies a fixed hash. The sample buttons were relabelled so their names do not clash with real actions.
  * `tests/e2e/output-actions.spec.ts`: 11 tests (10 run in Firefox and WebKit): disabled state, exact value and confirmation timing with a paused fake clock, Copy all and Download in CSV and JSON against the table, fallback for denied and missing clipboard, Copy all fallback, axe on the fallback dialog, and a real clipboard read in Chromium. The clipboard is stubbed in the other tests because only Chromium lets a test read it back. Mutation-tested: a trailing space, Copy all with only 12 rows, no fallback dialog, no preselection, never disabled, and a 1 s or 3 s confirmation each fail a test. `tests/e2e/helpers.ts` now holds the hydration wait.
  * Trace (headless Chromium, 8 copies): worst frame gap during the check animation 22 to 25 ms at 1x (the click frame also writes the clipboard and starts the toast), 18 to 21 ms at 4x; revert 17 to 19 ms; longest task 5 ms.
  * Initial JS for `/`: 41.73 KB gzip (was 40.73 KB; the fallback dialog and clipboard state in the shell).

* **T-010 (done):**
  * `lib/storage/schema.ts` (database `qanchor` v1: `endpoints`, `wallets` with the `byNetworkAddress` index, `faucets`), `migrations.ts` (one step per version, run in order inside idb's upgrade; a missing step throws and aborts the upgrade), `db.ts` (`openStorage`, `readAll`, `putAll`). Errors are values (ADR-013): `unavailable`, `quota`, `closed`, `failed`. `putAll` writes a batch in one transaction, so a quota error or a bad record saves nothing from the batch and leaves existing data as it was (EC-002).
  * `lib/state/storage.svelte.ts` opens the database once per page load from the shell's `onMount`, importing the storage code on demand: idb and the storage code are a 1.8 KB gzip chunk outside the initial bundle. Status: `checking` (also the prerendered state, so no banner flashes), `ready`, `unavailable`, `outdated`.
  * `StorageBanner` at the top of main: an info callout when storage is unavailable (EC-001, copy from design section 7), a warning with Reload when another tab upgrades the schema or the browser closes the database (EC-003). This tab closes its connection at once, so the other tab's upgrade is not blocked.
  * Tests: `src/lib/storage/*.test.ts` (12 unit tests with `fake-indexeddb`: schema and index, unavailable and refused, round trip, quota rollback, batch rollback, outdated on upgrade elsewhere, migration order and gaps) and `tests/e2e/storage.spec.ts` (6 tests per browser: schema v1 on a normal visit, no banner in the prerendered HTML, banner when `open` throws or IndexedDB is missing with tools still working, an asynchronous open failure, and the reload banner when a second tab upgrades). Mutation-tested: not closing on `blocking`, no abort on a synchronous request error, an unclassified quota error, a missing index, and a shell that never connects each fail a test.
  * New dependencies: `idb` 8.0 (runtime, lazy chunk above) and `fake-indexeddb` (dev only). Initial JS for `/`: 42.83 KB gzip (was 41.73 KB; the banner and storage state in the shell).
  * Consumers come next: Settings export/import (T-011) and the wallet tracker. Writing by those tasks maps the error codes to copy.

* **T-011 (done):**
  * Prototyped first (`prototype/settings.html`). The owner chose the confirmation that compares stored now with after import, and no "Stored now" line on the page.
  * `lib/storage/backup.ts`: the backup file and its hand-written guards (ADR-008). Guards rebuild each record from known fields only, so unknown fields (a `privateKey`, say) are dropped, not written. Errors are values: `not-json`, `not-qanchor`, `newer-version`, `unsupported-version`, `invalid` with a reason that names the record the way a person counts ("Wallet 2 of 2 ("Withdraw tests") has no address.").
  * `lib/storage/db.ts` gains `readRecords()` (every store in one transaction) and `replaceRecords()` (clear and write every store in one transaction, so a failure changes nothing). The theme is written only after that transaction commits.
  * `/settings`: Appearance (the theme control) and Data (`lib/tools/settings/DataSection.svelte`: Export backup, Import backup…, the "Replace all data?" dialog). Errors are a focused alert that names the file and the reason and says nothing was changed. With storage unavailable, both buttons are disabled with the reason.
  * Settings is the first entry in the sidebar's nav, pinned to the bottom above the theme control; the index page still lists tools only.
  * Found while checking the page by hand: the parsed backup was held in deeply reactive state, and IndexedDB cannot clone a Svelte proxy, so every import failed with "could not be written". Fixed with `$state.raw`; the import E2E tests fail if it comes back.
  * Tests: `backup.test.ts` (26 unit tests: export shape, round trip, extra fields dropped, every rejection reason), 3 more in `db.test.ts` (read all stores, replace all stores, quota rollback across stores), `tests/e2e/settings.spec.ts` (15 per browser: nav link, export contents and theme, the comparison dialog then replace-all, export to import round trip, Cancel and Escape, five bad files with nothing written, the file chooser from the keyboard, storage unavailable, axe on the page and on the dialog). Mutation-tested: deeply reactive state, no clear on replace, Cancel that imports, an unnamed newer version, and a theme that is not applied each fail a test. A redundant `autofocus` on Cancel was removed after its mutation survived: the browser already focuses the first button.
  * In Firefox, choosing a file after axe has run in the page crashes the page (Playwright/Firefox, not the app); the dialog scan therefore chooses the file before scanning.
  * Initial JS for `/`: 43.47 KB gzip (was 42.83 KB; the Settings link in the shell).

* **T-012 (done):**
  * `lib/core/amount/decimal.ts`: `parseAmount(input, decimals, { trim })` returns base units as a `bigint` or an error value; `formatAmount(base, decimals)` writes a plain decimal (no exponent, no separators, no trailing fractional zeros). Converting between units of a family is parse at one unit's decimals, format at the other's; no separate converter is needed.
  * Accepted: digits with at most one `.`, including `.5`, `5.`, and leading zeros (`007`) [ASSUMPTION: a bare leading or trailing point is accepted so typing `1.` in the converter shows no error mid-keystroke]. Trailing fractional zeros carry no precision, so `1.50` is valid with 1 decimal.
  * Rejected, as error codes, most specific first: `empty`, `comma` (even in `-1,5` and `1, 000`, so FR-031 AC-4's separator hint always shows), `whitespace` (inside the number, or around it unless `trim` is set), `scientific` (`1e-7` is scientific, not negative), `plus-sign`, `negative`, `not-a-number` (including full-width digits, `_`, `Infinity`), and `too-precise` with the unit's maximum. Error copy with unit names belongs to the pages (T-013, T-016).
  * Decimals outside 0 to 36 throw a `RangeError`: they are a caller bug, since the decimals field is validated before parsing. `formatAmount` accepts negative values for computed boundaries such as balance minus fee (T-015).
  * Tests: `decimal.test.ts` (62 unit tests: PRD examples, D = 0 and D = 36, 2^256 − 1 at 0, 18, and 36 decimals, round trips, every rejection rule). Mutation-tested: no trailing-zero strip, check order (negative before scientific, comma after whitespace), whitespace check removed, trim ignored, no zero padding, trailing zeros kept, a 37-decimal limit, a bare `.`, and a lost minus sign each fail a test.

* **T-013 (done):**
  * `lib/core/units/families.ts`: the five families (Ethereum ether/gwei/wei, Bitcoin BTC/sats, Solana SOL/lamports, Tron TRX/sun, Custom token token/base units), each unit stated by its decimals relative to the smallest unit; `convert()` is `parseAmount` at the typed unit and `formatAmount` at every unit, with surrounding whitespace trimmed (EC-013). `parseDecimals()` accepts a whole number from 0 to 36.
  * `lib/tools/units/UnitConverter.svelte` on `/units` (design S-04): the field being typed in keeps the text as typed and every other field shows the exact converted value; an invalid value shows its error under that field and leaves the others unchanged (FR-031 AC-1); clearing a field clears all (AC-2). Error copy lives in `lib/tools/units/messages.ts` and names the unit ("wei has no decimal places.").
  * Custom token: a Decimals field [ASSUMPTION: defaults to 18, the most common ERC-20 value]; changing it reconverts from the field last typed in; invalid decimals show "Decimals must be a whole number from 0 to 36." and convert nothing until fixed. [ASSUMPTION] switching the family starts from empty fields, since a value means a different amount on another chain.
  * Five families do not fit a segmented control on a phone, so below 640 px a select with the same state replaces it (design section 6 and S-04 updated; the segmented control now allows 2 to 5 options). `CopyButton` gains `disabled`, so an empty field cannot "copy" nothing.
  * The tool registry (`lib/config/tools.ts`) gains an `icon` per entry; the sidebar renders it (`swap` added to `Icon`). The converter is the first nav entry and the first item on the index; README status updated.
  * Menu open animation (design 2.4) on the small-screen menu: a keyframe animation on `.menu[open] .menu-panel`, not a transition, because a closed `<details>` keeps its content styled, so `@starting-style` never applies (found by the E2E test). Reduced motion sets its duration to 0.
  * Tests: `families.test.ts` (29) and `messages.test.ts` (8) unit tests; `tests/e2e/units.spec.ts` (33 per browser: nav and index, PRD examples per family, 0.1 ether, 2^256 − 1 wei, eight invalid inputs with the other fields unchanged, clear, trim, family switch, custom token both ways, decimals change, invalid and zero decimals, copy, keyboard path, Enter, phone select, small-screen menu by pointer and keyboard, menu animation with and without reduced motion, two axe scans). Mutation-tested: overwriting the typed field, clearing the others on error, keeping values across families, no reconversion on a decimals change, converting with invalid decimals, an always-enabled copy button, no menu animation, and an unlinked error each fail a test. A `preventDefault` on submit was removed after its mutation survived: a form with several fields and no submit button is never submitted by Enter.
  * Frame rate (Chrome trace, 1x and 4x CPU throttle): menu open, family thumb, and typing a 78-digit value all present frames at about 60 fps, p95 frame interval 16.7 ms; longest main-thread task 39 ms.
  * Initial JS for `/`: 44.03 KB gzip (was 43.47 KB; the nav entry and its icon).

* **T-014 (done):**
  * All seven preset values match their sources: ETH 18, BTC 8, SOL 9, TRX 6, USDT on Ethereum 6, USDT on Tron 6, USDT on BNB Smart Chain 18. Tokens were read on-chain (`decimals()`, `symbol()`, `name()`) through the default endpoints in architecture section 5 and TronGrid; native units come from ethereum.org, Bitcoin Core, the Solana SDK, and the TRON developer docs. Every source link is in `docs/decisions.md` (2026-11-14).
  * Reported to the owner: USDT on BNB Smart Chain is Binance's bridged token, not issued by Tether, and its address is confirmed by the on-chain read and the Trust Wallet registry rather than a Binance or Tether page. The decimals are unaffected.
  * No code change. T-016 can use the values as written in FR-020 AC-2.



## Findings while planning

* **F-1: theme preference cannot live in IndexedDB.** FR-002 AC-1 requires the stored theme to apply before first paint, but IndexedDB is asynchronous and cannot be read by a blocking pre-paint script. Resolved: the theme is stored in `localStorage` (key `qanchor.theme`) and exported under `settings` (owner, 2026-11-12; `docs/architecture.md` section 3.1, ADR-014).
* **N-1:** storage tests run in real browsers through Playwright instead of a Node IndexedDB shim, so no extra dev dependency is needed. Pure logic (migrations as data transforms, import guards) stays in Vitest. Revised in T-010: the write and rollback rules (a quota error, a failing record in a batch, a schema upgrade in another tab) cannot be triggered in a real browser on demand, so they are unit-tested with `fake-indexeddb`; browser-specific failures (blocked or missing IndexedDB) stay in Playwright (`docs/decisions.md`, 2026-11-13).

## Owner actions

* Review the checklist content (T-032) before it merges.
* Connect the GitHub repository to Cloudflare Pages in your Cloudflare account (T-024); it cannot be done from here.
* Approve each task's merge, as agreed.
