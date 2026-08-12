# Theme Family Contract

AI System 6 maintains exactly **three appearance families**, not six
independent themes. A new app, panel, dialog, or system control is written
once against the shared object grammar and the family it belongs to; the
derived appearances receive their era automatically.

| Family | Parent appearance | Derived appearance |
| --- | --- | --- |
| Classic | Classic / System 6 | Platinum |
| Aqua | Aqua | Snow Leopard |
| Liquid Glass | Liquid Glass | Yosemite |

This contract is the standing rule set for every theme edit. It is enforced
by the registry (`app/core/theme-registry.js`), the CSS budgets
(`scripts/css-budget.json`, `scripts/verify-css.mjs`), and the feature
contracts (`tests/features/appearance-system.test.mjs`).

## 1. Lineage, not second themes

`app/core/theme-registry.js` is the single source of theme metadata:

- `family` names the three maintenance roots (`classic`, `aqua`,
  `liquid-glass`).
- `recipeBase` names the parent recipe. A child starts from the parent and
  owns an explicit delta: `classic → platinum`, `aqua → snow-leopard`,
  `liquid-glass → yosemite`. Aqua and Liquid Glass are their own roots.
- The registry projects `data-theme`, `data-theme-family`, and
  `data-theme-base` on `html` and `body` before first paint.
- `getRecipeChain(themeId)` returns the ordered lineage; cycles are a
  registry bug and throw.

Only the Liquid Glass family carries the `use-liquid-glass` skin class.
Aqua and Snow Leopard own their rules directly under
`body[data-theme="..."]`; they must not inherit the glass skin.

## 2. What a child inherits from its parent

Derived appearances inherit, without re-implementation:

```text
DOM structure
interaction behavior
layout semantics
component structure
application integration
responsive behavior
accessibility
state handling
```

A child overrides only where the era genuinely differs:

```text
geometry
font
color
border
bevel
gradient
shadow
selection
scrollbar
iconography
window chrome
era-specific material
```

## 3. Where theme code lives

- `styles/00-foundation.css` — the only top-level token block (`:root`).
  Classic default values stay here.
- `styles/65-appearance-themes.css` — era parameter tables, family recipes,
  and child deltas. A per-era selector is allowed here only, is capped by
  `appearanceThemeSelectorLimit`, must reference a real base primitive, and
  may not be duplicated across themes.
- `styles/70-liquid-glass.css` — Liquid Glass material only.
- The Appearance file may be mechanically split into family-owned files
  (for example `styles/67-aqua-appearance.css`) when parallel workflows
  collide. A split is **zero visual diff** and its own commit; it never
  carries a redesign.
- `styles/66-theme-lab.css` — one shared Theme Lab component stylesheet, not
  six implementations. Every selector in it is scoped to the lab, so the sheet
  is built as its own `styles.theme-lab.css` bundle and loaded with the lazy
  Theme Lab module rather than at boot. Keep it out of `styleRuntimePaths`: it
  is the largest sheet in the repository and no boot needs it.

The parent chain is a maintenance lineage, not a second active CSS class.
Family-shared recipes use `body[data-theme-family="..."]`; a child's own
block wins by higher-specificity `body[data-theme="..."]`.

## 4. App CSS never knows a child theme

Application CSS consumes semantic system roles:

```css
.some-app-toolbar {
  background: var(--toolbar-bg);
  border-bottom: var(--toolbar-border);
}
.some-app-list .is-selected {
  background: var(--selection-bg);
  color: var(--selection-fg);
}
```

When a family recipe is genuinely needed, use the family axis:

```css
body[data-theme-family="classic"] .some-system-pattern { ... }
```

Never:

```css
body[data-theme="platinum"] .draft-desk ...
body[data-theme="platinum"] .reader ...
body[data-theme="platinum"] .clio-talk ...
```

If a new app requires `body[data-theme="platinum"] .new-app`, stop: the app
is not consuming the shared primitives or semantic tokens.

## 5. System roles over app-specific tokens

Repeated visual semantics are lowered into system roles instead of being
written per app and per era:

```text
--system-raised-surface        --system-inset-surface
--system-frame-border          --system-inset-border
--system-primary-divider       --system-secondary-divider
--system-selection-bg          --system-selection-fg
--system-disabled-fg
--system-group-box-border
--system-toolbar-surface       --system-status-surface
```

App tokens (`--message-divider`, `--review-divider`, `--scrap-divider`) map
to the role that owns the visual meaning. The family then answers one
question ("what does a Mac OS 9 secondary divider look like?") instead of
one question per app.

First live mapping (value-preserving, zero visual diff):

```text
--system-primary-divider
    Classic  : 1px solid var(--ink)
    Liquid   : 1px solid rgba(16, 17, 20, 0.1)

--pane-actions-border-bottom  = var(--system-primary-divider)
--documents-toolbar-border   = var(--system-primary-divider)
```

`--system-secondary-divider` is live: the dotted/light app dividers
(`--message-divider`, `--action-row-divider`, `--import-row-border-bottom`,
`--scrap-list-item-divider`, `--clio-assembly-divider`,
`--chat-transcript-article-border`) all alias the role, and each family owns
one value (Classic/Platinum: `1px dotted var(--shade-dark)`; Liquid:
`1px solid rgba(16, 17, 20, 0.1)`). Verified contained: the Theme Lab
regression stays 0-pixel for all six eras, the Classic/Liquid computed
snapshot is stable, and the default window-state pixel sweep shows no
measurable change (the previous per-app value drift — e.g. Liquid Scrapbook
at `0` vs the 0.1 hairline — was folded into the family value deliberately).

Repeated frame-border spellings already alias the existing `--system-border`
role (18 app tokens: review, outline, draft, field, icon, tdi, memory-card
families). Value-preserving in every scope: Classic resolves through the
same one-unit ink rule, Liquid keeps each token's own pinned override, and
modern-fonts still resolves 1.5 units.

## 6. What a child recipe may and may not do

A child owns **system-level recipes** for its identity:

```text
platinum-titlebar-stripes
platinum-window-frame
platinum-bevel-button
platinum-default-button
platinum-tabs
platinum-scrollbar
platinum-balloon-help
platinum-selection
```

A child must **not** own application recipes:

```text
platinum-draft-desk-card
platinum-reader-sidebar
platinum-clio-button
platinum-cmf-toolbar
```

`verify:css` enforces this: a child-theme selector whose base references a
registered app-window class is counted by `childAppSpecificSelectorLimit`
and may only decrease (baseline 0). A genuine system-level historical
exception is allowed only through `childAppSpecificAllowlist` in
`scripts/css-budget.json`, with the justification written in the commit.

## 7. Parent changes test the children

Changing a family tests the whole branch automatically:

```text
Classic family  ->  Classic + Platinum
Aqua family     ->  Aqua + Snow Leopard
Liquid Glass    ->  Liquid Glass + Yosemite
shared kernel   ->  all six
```

The Classic → Platinum paired regression is the canonical fidelity harness
(`npm run compare:theme-lab:canonical`) plus the Theme Lab snapshot
(`npm run verify:theme-lab`). A shared-infrastructure change is its own
commit, carries no child-specific values, and runs the six-theme regression.

## 8. Golden master

The current Platinum output is the golden master. Architecture refactors
must produce the **same visual result with less maintenance coupling**;
fidelity corrections against real Mac OS 9 references are a separate,
later step. When the shared Theme Lab DOM intentionally changes, refresh
each theme's `contentSha256` in its fidelity fixture in the same change —
never leave a fixture fingerprint stale.

## 9. Two visual tiers, never merged

A stable snapshot proves nothing about correctness: a wrong design holds a
perfect regression baseline. The two tiers answer two different questions and
live in different places.

| Tier | Question | Where | Fails when |
| --- | --- | --- | --- |
| Regression | Is today the same as yesterday? | `tests/visual/theme-lab/*.png`, and each specimen's `tolerances` | The output moved from the recorded run |
| Canonical fidelity | Is this actually the target era? | `FIDELITY_FLOOR` in `scripts/theme-lab-fidelity-contract.mjs`, and each specimen's `floor` ledger | A specimen is further from its pinned historical reference than the floor allows |

The floor is one shared constant for every era and every specimen, derived from
the metric definitions and **never** from our own output:

```text
geometryMismatch  <= 0.05   at most 5% of the reference silhouette may be absent
edgeErrorPx       <= 1.5    the outline sits within 1.5px at 1x
                            (multiplied by the board's deviceScaleFactor)
materialError     <= 12     interior colour within 12 of 255 (about 4.7%)
```

Every gated specimen carries a `floor` ledger:

```text
{ "status": "met" }
{ "status": "gap", "failing": ["materialError"], "note": "<historical reason>" }
{ "status": "unreliable-reference", "exempt": ["materialError"], "note": "<why the crop cannot support it>" }
```

- A metric that is **not** listed must meet the floor. The gate fails otherwise.
- A metric under `failing` is a recorded distance from the target, with its
  reason. It is honest bookkeeping, not permission.
- A metric under `exempt` means the pinned crop cannot measure it at all (for
  example a photo-thumbnail reference). This is the only escape, and it needs a
  written reason.
- When a `failing` metric starts to meet the floor, the gate **fails** until the
  ledger is corrected, so an improvement can never hide behind a stale entry.

Never widen a tolerance, add a `failing` metric, or reach for `exempt` to turn a
board green. Fix the painter, or improve the reference and re-measure.

## 10. Verification

```sh
npm run verify:css                      # budgets, ratchets, selector limits
npm run verify:theme-lab                # six-era Theme Lab regression snapshots
npm run verify:theme-lab:fidelity       # canonical fidelity: 4 eras + Retina board
npm run compare:theme-lab:canonical     # one board, with review artifacts
npm run audit:theme-coverage            # registry-driven app coverage audit
npm run screenshot:windows              # every registered window, one theme
npm run snapshot:css -- --theme platinum --label <step>   # shared surfaces
npm run verify:features -- appearance-system   # registry + contract tests
npm run verify:features -- theme-lab-fidelity-contract   # fixture + floor schema
```

The coverage evidence is registry-driven: `audit:theme-coverage` answers the
selector/token questions, `screenshot:windows` captures every registered
window's chrome + empty state, and `snapshot:css` (now also `--theme
platinum`) captures the shared surface set. Paired Classic + Platinum runs of
the same labels are the machine-readable before/after for parent changes.

The goal: a developer thinks in three families, most apps consume semantic
tokens only, and adding ten more apps never means ten more child-theme
patches.
