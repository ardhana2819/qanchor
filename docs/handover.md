# QAnchor: Handover

* Date: 2026-11-29
* State: Phase 1 (blockchain toolkit, dummy data) and Phase 2 (QA workspace) are complete, merged to `main`, and deployed to <https://qanchor.pages.dev>. Phases 3 and 4 are not started and have no FR IDs yet.

## Where things are

| Need | Look in |
| --- | --- |
| What the product does and why | `docs/prd.md` (requirements with US-, FR-, NFR-, EC- IDs) |
| How it looks and behaves | `docs/design.md` (screens S-xx, journeys J-xx) |
| How it is built | `docs/architecture.md` (storage schema, network endpoints, workers) |
| Every task and its status | `docs/plan.md` (T-001 to T-075, all done) |
| Why something is the way it is | `docs/decisions.md` (dated log, then ADR-001 to ADR-015) |
| Project rules for contributors | `CLAUDE.md` |

Code layout under `src/lib`: `core` holds pure logic (chains, dummy data, QA rules), `storage` the IndexedDB layer and backup, `net` the RPC and REST clients, `workers` the Web Workers for heavy work, `tools/<tool>` each tool's UI, and `ui` the shared components (all states on `/components`). Pages are in `src/routes`. Imports use `#lib/*`.

## Run and check locally

Node version from `.nvmrc`. After `npm install`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run lint` | Prettier and ESLint |
| `npm run check` | svelte-check (types) |
| `npm test` | Vitest unit tests |
| `npm run build` then `npm run size` | Static build and the bundle budget (initial JS <= 80 KB gzip) |
| `npm run test:e2e` | Playwright in Chromium, Firefox, and WebKit, with axe scans. Builds and serves the app itself; install browsers once with `npx playwright install chromium firefox webkit` |

Run ESLint with `--ignore-pattern '.claude/**'` if local agent worktrees exist under `.claude/`.

## CI and deploy

* GitHub Actions on every PR: one job for lint, typecheck, unit, build, and bundle size, and one E2E job per browser. Cloudflare Pages adds a preview deployment per PR.
* Every merge to `main` deploys to production. Cloudflare does not wait for CI, so merge only when CI is green.
* Firefox retries a failed test once in CI (decision T-023); Chromium and WebKit never retry. A test that passes on its retry shows as flaky in the run summary: treat a new one as a bug to look at, not noise.

## E2E state and rules

* As of 2026-11-29 no known flaky test is left. The two groups seen in recent CI runs (Firefox axe crashes, Firefox download names) are fixed; see `docs/decisions.md`, 2026-11-29.
* Before an axe scan, wait with `toHaveCount(1)`, not `toBeVisible()` or `toBeEnabled()`: those make Playwright's Firefox crash during the scan (`scanA11y` in `tests/e2e/helpers.ts` says why).
* Read a downloaded file's name with `savedNames()` or `download.suggestedFilename()`, never from the saved path: Firefox renames a repeated download to `name-1.ext`.
* Seed data through the helpers in `tests/e2e/helpers.ts` (`putRecords`, `seedCases`, `testCase`, `testRun`, …) instead of clicking through the UI.
* Locally on macOS, about 20 keyboard-only tests fail in WebKit unless System Settings > Keyboard > Keyboard navigation is on. CI on Linux is unaffected.

## Open owner actions

From `docs/plan.md`, "Owner actions":

* Review the checklist content (T-032); it merged without that review.
* Open the explorer transaction pages and the two faucet pages by hand (T-035); automation stops at their bot check.
* In a real Chrome, try Download all on a bug report with two or more screenshots and record whether every file is saved and whether Chrome asks to allow automatic downloads (T-057, T-065).

Still unverified: the Jira wiki markup escaping rules (decision T-058), because no Jira Server or Data Center was available to test them.

## Next

Phase 3: generate test cases from a PRD (PDF, DOCX, Markdown) with ambiguity questions and a traceability matrix, through the user's own Claude API key. It starts with discovery and a PRD update that gives it FR IDs, as Phase 2 did (`CLAUDE.md` section 1). Phase 4 (demo mode) follows.
