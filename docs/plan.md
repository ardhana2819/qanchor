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
| T-001 | Scaffold SvelteKit (TypeScript, Svelte 5, adapter-static, `prerender = true`, `trailingSlash = 'never'`), folder skeleton from architecture section 2, `.nvmrc`, npm scripts, ESLint (incl. `no-console`, `lib/core` import restriction), Prettier, svelte-check | FR-001 (partial), NFR-022 | none | Build output has `index.html` and `404.html`; lint, format check, and typecheck pass | `npm run build`, `npm run lint`, `npm run check` | Low | todo |
| T-002 | Test harness: Vitest with one unit test (`lib/core/result.ts`); Playwright for Chromium, Firefox, WebKit against `vite preview`, with one E2E (index page shows its heading) | NFR-007 | T-001 | Both suites pass locally in all three browsers | `npm test`, `npm run test:e2e` | Low (WebKit install on CI) | todo |
| T-003 | CI workflow (lint, typecheck, unit, build, bundle size, E2E) and `scripts/check-bundle-size.mjs` | NFR-001, NFR-020, ADR-009 | T-002 | PR shows all CI jobs green; the size script prints the measured gzip size and fails when the limit is lowered on purpose | GitHub Actions run; local run with a low limit | Low | todo |
| T-004 | Spike: CSP in hash mode with the inline theme script, `static/_headers`, and `404.html` fallback | FR-002 AC-1, NFR-017, NFR-022, ADR-007, ADR-011 | T-001 | Built pages carry a CSP meta tag that includes the theme script's hash; no CSP violations in the console in three browsers; findings written to `docs/decisions.md` | Inspect build output; Playwright console check | **High**: the `kit.csp` behaviour for `app.html` scripts is unverified | todo |

### M1 Slice 1a

| ID | Task | FR/US/NFR | Depends on | Definition of done | How to verify | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-005 | Design tokens and base CSS from `docs/design.md` section 2; Inter Latin subset; `prefers-reduced-motion` | NFR-006, NFR-009, ADR-010 | T-001 | `app.css` tokens match the design brief for both themes; font file size recorded in this plan | Visual check against `prototype/`; file size from build output | Low | todo |
| T-006 | App shell: sidebar with shipped tools only, skip link, landmarks, footer commit ID, toolkit index, not-found page, small-screen top bar | FR-001 AC-1 to AC-4, AC-6, AC-7; NFR-021; US-010 | T-005 | Every route's static HTML contains heading and navigation; unknown URL shows the not-found state; nav works by keyboard | E2E: deep-link reload, unknown URL, Tab through nav; inspect built HTML | Low | todo |
| T-007 | Theme control (System / Light / Dark), pre-paint script, follows OS changes, persisted | FR-002, US-011 | T-004, T-006 | No light flash in dark mode on any prerendered page; choice survives reload (stored in `localStorage`, finding F-1); System follows OS changes live | E2E with `colorScheme` emulation in three browsers | Medium | todo |
| T-008 | UI primitives from design section 6: Button, IconButton, Field, Text/Number input, Select, Checkbox group, Segmented control, Tabs, Badge, Callout, Toast + live region, Empty state, Data table, Dialog | NFR-008, NFR-009, NFR-010 | T-005 | Each component has its states from design section 6; focus ring visible; screen-reader names present | E2E on the first pages that use them; axe scan | Low | todo |
| T-009 | Output actions: Copy, Copy all, Download (CSV/JSON), clipboard-denied fallback | FR-004, EC-023 | T-008 | Copy puts the exact value on the clipboard and announces it; denied clipboard shows the error and keeps the value selectable | E2E with clipboard permissions granted and denied | Medium (clipboard APIs differ per browser) | todo |
| T-010 | Storage layer: `idb` schema v1, migration runner, unavailable detection + banner, quota errors, `versionchange` handling | NFR-016, EC-001, EC-002, EC-003, ADR-014 | T-006 | Unit tests for migrations; banner appears when IndexedDB is blocked; a quota error leaves existing data intact | Vitest for migration transforms; real-browser E2E for IndexedDB behaviour (note N-1), including blocked storage | Medium | todo |
| T-011 | Settings page: Appearance and Data sections; JSON export; import with validation, summary dialog, replace-all | FR-003, US-010, EC-020, ADR-008 | T-008, T-010 | Export file has app, schemaVersion, exportedAt, data; invalid, unknown-version, or truncated files write nothing and name the reason | Unit tests for guards; E2E export → import round-trip | Low | todo |
| T-012 | BigInt decimal helpers in `lib/core/amount`: parse and format with D = 0 to 36, rejection rules (comma, `+`, scientific notation, negative), whitespace trimming where allowed | FR-021 AC-6, FR-030 AC-3/AC-4, FR-031, EC-012, EC-013, ADR-003 | T-002 | 78-digit values round-trip exactly; every rejection rule has a test | Vitest | Low | todo |
| T-013 | Unit converter page: families (ether, BTC, SOL, TRX, custom token), live conversion, field errors | FR-030, FR-031, FR-032, US-004 | T-009, T-012 | AC examples from the PRD produce the exact strings; `0.5 wei` and `1,5` show their errors without updating other fields | Vitest for conversions; E2E for typing and errors | Low | todo |
| T-014 | Spike: verify token decimals for the amount presets against primary sources (contract or official docs) | FR-020 AC-2 [VERIFY] | none | Each preset value has a source link recorded in `docs/decisions.md`; any mismatch reported to the owner before T-016 | Review of recorded sources | Low | todo |
| T-015 | Amount edge-case generator in `lib/core/amount` | FR-020 AC-3, FR-021, EC-012 | T-012 | Every case listed in FR-021 AC-1 to AC-3 is produced; omitted cases are reported with a reason; D = 0 produces no fractional cases | Vitest | Low | todo |
| T-016 | Amount edge cases page: presets, inputs, table, export | FR-020, FR-022, US-003 | T-009, T-014, T-015 | Export preserves input strings byte for byte, including whitespace and separators | E2E download content check | Low | todo |
| T-017 | Encoding core: EIP-55, Base58Check, bech32 / bech32m, hex | NFR-014 | T-002 | Published EIP-55, BIP-173, BIP-350, and Base58Check vectors pass | Vitest | Low | todo |
| T-018 | Chain modules for EVM, Tron, Solana: derive from a CSPRNG key, validate, risky samples (zero address, all-lowercase, off-curve Solana address) | FR-010 AC-2, AC-6; FR-011 AC-5; EC-004, EC-006; NFR-012, NFR-013 | T-017 | Every derived address passes its validator; key bytes are zero-filled after use; no seeded randomness in key paths | Vitest, including a test that keys come from `crypto.getRandomValues` | Medium | todo |
| T-019 | Bitcoin module: P2PKH, P2SH, P2WPKH, P2TR (BIP-341 tweak), mainnet and testnet | FR-010 AC-2, AC-5 | T-017 | BIP-341 and BIP-350 vectors pass; generated addresses round-trip through the validator for every type and network | Vitest | **High**: hand-written Taproot tweak | todo |
| T-020 | Invalid variants per chain, look-alike variants, variant applicability | FR-011 AC-2 to AC-4, EC-007 | T-018, T-019 | An automated test generates every variant for every applicable chain/type/network and asserts the selected validator rejects it; look-alikes pass their source chain | Vitest | Medium | todo |
| T-021 | Address worker and Generate tab: form, worker job, results table, export | FR-010 AC-1, AC-3, AC-4; FR-011 AC-1; FR-012; US-001, US-002; NFR-005, NFR-012, NFR-019 | T-009, T-020 | 500 addresses generate without a main-thread long task over 200 ms; count limits enforced; export records have all FR-012 fields | E2E; performance trace for N = 500 | Medium | todo |
| T-022 | Validate tab: live verdict, multiple matches, named defects, whitespace and invisible characters | FR-014, US-012, EC-007 | T-008, T-020 | Each AC of FR-014 has an E2E case; no network request is made | E2E with request recording | Low | todo |
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
| T-031 | Dummy data worker and page: fields, count, seed, options, preset, progress, 100-row preview, seed display, fake-data note | FR-080, FR-081 AC-8, FR-082 AC-2, US-009; NFR-005 | T-008, T-029, T-030 | 10,000 rows generate with no main-thread long task over 200 ms; export covers all rows | E2E; performance trace for N = 10,000 | Medium | todo |
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

## Findings while planning

* **F-1: theme preference cannot live in IndexedDB.** FR-002 AC-1 requires the stored theme to apply before first paint, but IndexedDB is asynchronous and cannot be read by a blocking pre-paint script. Resolved: the theme is stored in `localStorage` (key `qanchor.theme`) and exported under `settings` (owner, 2026-11-12; `docs/architecture.md` section 3.1, ADR-014).
* **N-1:** storage tests run in real browsers through Playwright instead of a Node IndexedDB shim, so no extra dev dependency is needed. Pure logic (migrations as data transforms, import guards) stays in Vitest.

## Owner actions

* Review the checklist content (T-032) before it merges.
* Connect the GitHub repository to Cloudflare Pages in your Cloudflare account (T-024); it cannot be done from here.
* Approve each task's merge, as agreed.
