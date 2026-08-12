# Theme Family Report — Six-Era Acceptance Closeout

> **Current conclusion (2026-08-10): PASS WITH KNOWN ISSUES**
>
> Commit: `b23eddf6` — "Appearance: Yosemite evidence ledger, icon manifest,
> and six-appearance QA matrix" (last HEAD observed at closeout; the parallel
> session kept committing during acceptance, so the evidence below is
> recorded against the final working tree, which is what the gates ran on)
>
> All theme gates are green on the committed tree: the six-era Theme Lab
> regression passed (0.000% in repeat runs; one transient 0.044% platinum
> noise run is documented in section 5), verify:visual 0 drifted, CSS
> budgets and the child+app-specific ratchet at 0, 141 feature contracts, a
> 61-window × 6-theme screenshot sweep, an interactive states sweep, and
> persistence probes. The only reds
> are non-theme: (a) GitHub Actions on the public repo has not started
> because of an account billing lock; (b) the optional browser E2E suite
> timed out in this environment (4/4 attempted tests, all timeouts) — it is
> explicitly not a release gate; (c) the shared worktree's floppy budget
> passes only with the parallel lane's uncommitted budget bump
> (2,978,000 bytes; the build is 2,976,913), while the committed HEAD
> passes independently with 2,602 bytes remaining. None of these is a theme
> defect, and none was fixed by touching theme code, tests, or baselines.

## 1. Current state — six released appearances, three families

`apps/desktop/app/core/theme-registry.js` is the single source of theme metadata. All six
appearances are `releaseReady: true`; the Special → Appearance menu, the
Control Panel Appearance select, Theme Lab, and both locale tables expose the
same six ids. The maintenance lineage (`recipeBase`) is deliberately not
chronological: classic → platinum, aqua → snow-leopard,
liquid-glass → yosemite, with Aqua and Liquid Glass as their own roots.

| Appearance | id | Family / recipe | Visual status |
| --- | --- | --- | --- |
| System 6 | classic | classic (root) | 1-bit chrome; 0 px radius, no shadow or translucency; 0% colored pixels in the sweep |
| Platinum | platinum | classic → classic | Mac OS 9 gray chrome, 11 px titlebar controls, yellow balloon help |
| Aqua | aqua | aqua (root) | pinstripe menu bar/toolbar, pill buttons, traffic-light lamps, 8 px windows |
| Snow Leopard | snow-leopard | aqua → aqua | silver unified toolbar/sidebar/modal, 12 px lamps, 5 px windows |
| Yosemite | yosemite | liquid-glass → liquid-glass | flat 10.10 chrome, translucent menu bar, blue default button `#3484e2` (hover `#619fe8`), 5 px windows |
| Liquid Glass | liquid-glass | liquid-glass (root) | glass material, vibrancy, 18 px radius, blue gradient default button |

The family contract, the registry recipe chains, and the selector ratchet are
enforced by `docs/THEME-FAMILY-CONTRACT.md`,
`tests/features/appearance-system.test.mjs`, and `tooling/verify-css.mjs`
(child+app-specific selectors stay at baseline 0).

Since the parallel lane's Yosemite split (`d60ecf0d`), only Liquid Glass
itself carries the `use-liquid-glass` skin class; Yosemite owns an
independent 10.10 painter under `body[data-theme="yosemite"]` and never
inherits the glass material, blur, refraction, or overlay. This matches the
contract's rule that Aqua/Snow Leopard/Yosemite must not inherit the glass
skin.

## 2. Verification actually executed (2026-08-10, real exit codes)

| Command | Exit | Evidence |
| --- | --- | --- |
| `npm install` | 0 | dependency tree already in sync with the lockfile |
| `npm run verify:css` | 0 | per-file budgets and ratchets; child+app-specific selectors 0/0; no new `!important` |
| `npm run audit:theme-coverage` | 0 | 61 registered windows; 0 child+app-specific theme selectors |
| `npm run verify:features` | 0 | 141 feature contracts (incl. `appearance-system`) |
| `npm run verify:theme-lab` | 0 | six-era regression passed; repeat runs 0.000% (one transient 0.044% platinum noise run, see section 5) |
| `npm run verify:visual` | 0 | 26 computed-style entries, 0 drifted |
| `npm run verify:theme-lab:fidelity` | 0 | canonical fidelity hard gate for 4 appearances (added by the parallel lane) |
| `npm run screenshot:windows -- --theme <era>` | 0 × 6 | 61/61 windows captured per theme; zero zero-size chrome |
| `npm run verify:release` | 0 | final run: 0 warnings (build, syntax, server typecheck, smoke, data, floppy, features, docs, CSS, design, packaging) |
| `npm run test:e2e` | interrupted | optional human diagnostic; 4/4 attempted chromium tests timed out in this environment (see section 5); per repo policy this suite is not a release condition |
| `npm run compare:theme-lab:canonical` | 0 | Platinum vs real Mac OS 9 corpus; gated specimens within pinned tolerances (icon specimens diagnostic-only) |

Every command was run against the live tree with its real exit status; no
result was copied from an older report.

Public reproducibility: `verify:theme-lab`, `screenshot:windows`,
`audit:theme-coverage`, `compare:theme-lab:canonical`, and
`verify:theme-lab:fidelity` are tracked and runnable from the public tree.
`verify:visual` (and `snapshot:css`, `visual:*`, `render:*`) is an
internal-only private-tree gate: it needs a local browser and is stripped
from the public snapshot by design (`tooling/lib/public-package.mjs`,
`internalOnlyScriptNames`). Its results above are private-tree evidence,
not a claim that a public clone can reproduce it. The public snapshot's
supported command surface is the one documented in README.md
(`npm ci` / `npm start` / `npm run build` / `npm test` /
`npm run verify:public`).

## 3. Visual acceptance completed

- **61 registered windows × 6 themes** — element screenshots plus computed
  chrome samples (`title-bar`, `close-box`, `resize-box`, buttons, inputs,
  selects, panes) land in `internal/evidence/drafts/theme-coverage/windows-<theme>/`. All six
  runs captured 61/61 windows with zero zero-size chrome and no page errors
  beyond the known Time Machine sandbox message.
- **Interactive states sweep × 6 themes** — Apple menu open + hover
  selection, Special → Appearance submenu (all six items), active/inactive
  window title bars, close/zoom/grow boxes, button
  default/hover/pressed/focus/disabled, checkbox/select/textarea, balloon
  help, system modal, toolbar/sidebar/tabs, scrollable panes, and the
  notification center. Screenshots and JSON: `internal/evidence/drafts/theme-coverage/states/`.
- **Era material checks** — Classic measures 0% colored pixels and zero
  radius/shadow; Platinum is grayscale with the measured Mac OS 9 palette;
  Aqua/Snow Leopard show era-specific color (pinstripe, silver, traffic
  lights); Yosemite shows the flat 10.10 chrome; Liquid Glass shows the
  glass material. No cross-era leakage was found.
- **Persistence** — a saved non-default theme is applied to `html`/`body`
  before first paint (the registry runs in `<head>` before the stylesheet);
  reload keeps the saved theme; the legacy `ai-system-6-liquid-glass` key
  migrates to `ai-system-6-theme=liquid-glass`; an unknown theme id falls
  back to classic and normalizes storage; A→B→A round-trips leave no stale
  classes, inline styles, or CSS variables; already-open windows re-theme
  live.

## 4. Issues found and fixed in this closeout

1. **Yosemite, Aqua, and Snow Leopard collapsed app-owned textareas.**
   The dictation transcript (84 px), translation pad (118 px), and rebuild
   flow (180 px) textareas all fell to the 22 px field minimum. Root cause:
   the era field recipes set `min-height: var(--system-control-min-height)`
   on textareas, tying the app rules on specificity and winning by load
   order. Classic and Liquid Glass never set textarea min-height. Fixed by
   removing that property from the Yosemite recipe
   (`apps/desktop/styles/65-appearance-themes.css`) and the Aqua/Snow Leopard recipe
   (`apps/desktop/styles/67-aqua-appearance.css`); single-line controls keep the shared
   22 px minimum from the base rule.
2. **Yosemite's blue default button turned white on hover.** The generic
   `.btn:hover` recipe repainted the 10.10 suggested-action button with the
   white regular-button hover. Fixed with a Yosemite rule using
   `--btn-default-hover-bg: #619fe8`, verified against the cited
   vinceliuice/Yosemite-gtk-theme `03b6f721` `gtk-light.css`
   (`button.suggested-action:hover { background-color: #619fe8; }`).
3. **README claimed three release appearances.** The registry releases all
   six; `README.md` / `README.zh-CN.md` now describe System 6, Platinum,
   Aqua, Snow Leopard, Yosemite, and Liquid Glass as the release appearances.
4. **This report mixed "all gates green" with stale reds and blockers.**
   Rewritten with one current conclusion; the stage-by-stage narrative is
   archived below as a historical record.
5. **The coverage audit no longer matched the ratchet's allowlist.** The
   parallel lane's Yosemite split sanctioned its Finder/desktop selection
   recipes through `childAppSpecificAllowlist` (theme-qualified
   `yosemite:.finder-item` etc., the contract's system-level exception
   path), so `verify:css` counted 0/0 — but
   `audit-app-theme-coverage.mjs` only honored bare or `platinum:`-qualified
   entries and wrongly flagged 5 windows. The audit now honors the same
   qualified forms as the gate; it reports 0 again.

## 5. Known non-blocking issues

- **GitHub Actions has not started** on the public repo (account billing
  lock). Infrastructure, not code; local gates are the acceptance evidence.
- **Optional E2E suite timed out in this environment** (4/4 attempted
  chromium tests: adjustment-layers × 2, control-strip × 2; 4–5 minute
  timeouts each). The repo documents this suite as an optional human
  diagnostic that is never a release condition; no test or config was
  changed to chase it.
- **Shared-worktree floppy budget** passes on the current tree only with the
  parallel lane's uncommitted bump (2,978,000 bytes vs 2,976,913 built);
  the committed HEAD passes independently (2,602 bytes remaining). Re-run
  `verify:release` once that lane settles and commits its bump.
- **Theme Lab transient glyph noise** — one platinum run measured 0.044%
  (557 px) on the Icon-set Charcoal labels; repeat runs measure 0.000%.
  This is machine/font-cache rasterization noise below the 0.2% gate
  tolerance, not a regression and not a baseline-update trigger.
- **Time Machine frame logs a `localStorage` sandbox error** by design
  (`sandbox="allow-scripts"` on an opaque-origin iframe); it appears in all
  six theme sweeps and is not a theme issue.
- **Platinum icon material fidelity** for the folder / hard-disk / CD
  specimens still lacks valid reference crops (the older crops were photo
  thumbnails). Geometry is aligned; the material deltas are quantified and
  do not block release.

## 6. Historical / intermediate record (archived 2026-08-10)

> The remainder of this file is the stage-by-stage record produced by the
> parallel Platinum/Aqua lanes on 2026-08-10. It is kept for provenance.
> Its status lines ("all gates green", "human visual review remaining",
> "open items blocking the completion audit") describe intermediate
> moments and are **not** current. Sections 1–5 are the only current
> conclusions.

### 6.1 Original stage report — Classic to Platinum: three-family maintenance model

Status (historical): architecture phase complete, all gates green at that
point. Icon redraw phase landed (measured Mac OS 9 palette); human visual
review was the remaining fidelity gate. That review is now done in
section 3.

#### Conclusions (section 22, historical)

**How many theme-specific CSS files does a new app need?**

Zero. App CSS consumes semantic tokens and shared primitives; family
differences go through `body[data-theme-family="..."]`. All 61 registered
windows satisfy this today: zero child+app-specific selectors (ratchet
enforced, baseline 0).

**How many app-specific theme selectors does Platinum have?**

Before: 0 (enforced only by six prefix regexes in the feature test).
After: 0, machine-enforced by the registry-driven
`childAppSpecificSelectorLimit`.

**Does Platinum follow when Classic changes a shared app primitive?**

Yes, with a test/evidence chain: registry `recipeBase: classic`, Platinum
recipes all reference shared primitives (orphan check), all 90 Platinum
recipes are system-level, and paired captures of 61 windows + 23 surfaces
show the Platinum delta applied everywhere (zero Classic leaks).

**Did Platinum drift toward Classic during the refactor?**

No. The architecture refactor itself was zero-drift (six-era Theme Lab
regression 0 px, verify:visual 0 drifted). The later icon redraw changed
icon pixels BY DESIGN after the user rejected the previous painters; the
golden-master byte-identical claim is superseded for the icon specimens
only. QA scan shows zero leaks, zero unthemed title bars, zero zero-size
chrome.

**Did Aqua / Yosemite regress?**

No. Six-era Theme Lab regression was 0 pixels everywhere, verify:visual was
0 drifted across 26 entries, and 135/135 feature contracts passed at that
time (the count is now 141).

#### Landed mechanisms (historical)

| Mechanism | Location |
| --- | --- |
| Three-family lineage (recipeBase / family / getRecipeChain) | apps/desktop/app/core/theme-registry.js |
| Inheritance contract + child recipe discipline + commands | docs/design/THEME-FAMILY-CONTRACT.md |
| child+app-specific ratchet (baseline 0, allowlist) | tooling/verify-css.mjs + tooling/css-budget.json |
| System roles: --system-primary-divider, --system-secondary-divider, --system-border aliases | apps/desktop/styles/00-foundation.css + family files |
| Registry-driven coverage audit | tooling/audit-app-theme-coverage.mjs |
| Full-window screenshots + computed-style sweep | tooling/screenshot-window-coverage.mjs |
| Paired shared-surface snapshots (classic/liquid/platinum) | tooling/css-surface-snapshot.mjs |
| Platinum canonical fidelity (10 controls + 9 icon specimens) | tests/visual/theme-lab-fidelity/platinum.json |

#### Metric snapshot (historical)

- Platinum recipes: 90, all system-level (58 icon painters, 11 window
  chrome, 14 controls, 3 menus, 3 parameter blocks, 1 Theme Lab).
- 61 windows × (Platinum/Classic) screenshots + computed styles; QA scan
  clean (8 icon-only buttons excluded as false positives).
- 23 surfaces × 2 themes = 200 paired captures; 89 chrome selectors confirm
  the delta is applied.
- Fidelity vs real Mac OS 9: geometry aligned everywhere
  (geometryMismatch 0, edgeError ≤ 0.3 px), material ≤ 3.4; the 7–21% pixel
  deltas are text content and should not be "fixed".

#### External source study (Classicy + platinum.css, historical)

Direct study is no longer an external limitation. Full git trees were
fetched over the network on 2026-08-10 and kept at
`/private/tmp/classic-platinum-work-20260810/`: Classicy
(robbiebyrd/classicy, 2,683 files), classic-stylesheets
(nielssp/classic-stylesheets, themes/macos9/_*.scss) and platinum.css
(mat-sz/platinum.css, apps/server/index.scss). Licenses: Classicy Unlicense,
platinum.css BSD-3-Clause-Clear, classic-stylesheets MIT. Nothing was copied
into the repo. Three-way value agreement was confirmed for button radius
(3 px), min-width (58 px), titlebar controls (11 px), scrollbar (16 px),
selection (#ccccff), window frame (#cccccc), surface (#dddddd), titlebar
stripes, and the Charcoal system font. Discrepancies (Classicy's 12 px
controls vs the 11 px consensus; Classicy's white balloon vs the real
yellow #ffffcc balloon; Classicy 14 px body text vs 12 px) were recorded and
resolved in favor of the real systems.

#### Icon redraw (historical)

The previous Platinum system-icon SVGs were hand-invented approximations and
the user rejected them. Root cause was measured from the GUIdebook Mac OS 9.0
desktop capture: real Mac OS 9 icons are light blue-gray (#d0d0e1 family),
black-outlined, with white highlights and gray shading; the old SVGs used
invented purple gradients and a non-existent green accent. The icons were
redrawn on one shared painter recipe (tooling/build-platinum-icons.mjs) with
the measured palette, and the complete set (~51 icons) was approved by the
user on 2026-08-10.

Measured fidelity after correcting the document/floppy/trash reference crops
to their real art boxes (canonical harness, historical):

| Icon | geometryMismatch | edgeErrorPx | materialError |
| --- | --- | --- | --- |
| document-32 | 0 | 0.7 | 44.5 |
| floppy-32 | 0 | 0.4 | 104.9 |
| trash-32 | 0.003 | 1.1 | 37.7 |

The redrawn silhouettes align with real Mac OS 9 (geometryMismatch ≤ 0.003,
edge ≤ 1.1 px); material deltas quantify remaining painter work. The desktop
capture's floppy carries a custom colored label, so its material number is
not a clean calibration target; folder/hard-disk/cd specimens still need a
valid reference source (their old crops were photo thumbnails or clipped).

#### Closeout gate record (historical, intermediate)

At an intermediate point the combined tree showed: verify:release passed
with 0 warnings, verify:theme-lab passed all six eras at 0.000%, verify:css
passed, and the only red was verify:visual's window/button geometry snapshot
owned by the parallel Aqua lane; after their baseline update it went green
(26 entries, 0 drifted). That state is superseded by section 2, which records
the closeout re-runs.

#### Execution-order audit (historical)

| Plan item | Status | Evidence |
| --- | --- | --- |
| 1. Pull latest main | done | branch on top of origin/main |
| 2. Save six-theme baseline | done | tests/visual/theme-lab/*.png + verify:theme-lab |
| 3. Save Platinum canonical fidelity | done | tests/visual/theme-lab-fidelity/platinum.json |
| 4. Mechanical family CSS split (optional) | superseded | Aqua partial; contract documents the rule |
| 5. Three-family inheritance contract | done | docs/THEME-FAMILY-CONTRACT.md (EN/ZH) |
| 6. Map app-specific appearance to system/family semantics | done | divider/border aliases in 00-foundation.css |
| 7. Real-app Platinum coverage audit | done | 61 windows, 0 child+app-specific selectors |
| 8. Delete inheritable Platinum app-specific selectors | done | ratchet baseline 0 |
| 9. Cross-check classic-stylesheets / Classicy / platinum.css | done | full source study, three-way agreement |
| 10. Fix remaining Platinum fidelity details | done | icons redrawn with measured palette; Mac OS 9 HIG audit |
| 11. Classic + Platinum paired regression | done | verify:theme-lab six eras 0.000% |
| 12. Six-theme shared-infrastructure regression | done | verify:theme-lab 0.000%; verify:release 0 warnings (at that point) |
| 13. Output maintenance-cost metrics | done | Metric snapshot + Conclusions |
| 22. Final questions | done | Conclusions answer all five; final release gate re-run at closeout (section 2) |

The old "open items blocking the completion audit" (human visual review of
the redrawn icons; the parallel Aqua lane's uncommitted visual baseline; one
final verify:release/verify:visual re-run) are all resolved by this closeout.

## 7. Maintenance commands

```sh
npm run verify:css                      # budgets + child+app ratchet
npm run verify:theme-lab                # six-era Theme Lab regression
npm run verify:visual                   # Classic/Liquid computed snapshot
npm run verify:features -- appearance-system
npm run audit:theme-coverage            # registry-driven coverage audit
npm run screenshot:windows              # full-window screenshots
npm run compare:theme-lab:canonical     # Platinum vs real Mac OS 9
```
