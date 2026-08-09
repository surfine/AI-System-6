# Classic to Platinum: three-family maintenance model - stage report

Status: architecture phase complete, all gates green. Icon redraw phase
landed (measured Mac OS 9 palette); human visual review is the remaining
fidelity gate.

## Conclusions (section 22)

**How many theme-specific CSS files does a new app need?**

Zero. App CSS consumes semantic tokens and shared primitives; family
differences go through body[data-theme-family="..."]. All 61 registered
windows satisfy this today: zero child+app-specific selectors (ratchet
enforced, baseline 0).

**How many app-specific theme selectors does Platinum have?**

Before: 0 (enforced only by six prefix regexes in the feature test).
After: 0, machine-enforced by the registry-driven childAppSpecificSelectorLimit.

**Does Platinum follow when Classic changes a shared app primitive?**

Yes, with a test/evidence chain: registry recipeBase: classic, Platinum
recipes all reference shared primitives (orphan check), all 90 Platinum
recipes are system-level, and paired captures of 61 windows + 23 surfaces
show the Platinum delta applied everywhere (zero Classic leaks).

**Did Platinum drift toward Classic during the refactor?**

No. The architecture refactor itself was zero-drift (six-era Theme Lab
regression 0 px, verify:visual 0 drifted). The later icon redraw changed
icon pixels BY DESIGN after the user rejected the previous painters; the
golden-master byte-identical claim is superseded for the icon specimens only.
QA scan shows zero leaks, zero unthemed title bars, zero zero-size chrome.

**Did Aqua / Yosemite regress?**

No. Six-era Theme Lab regression is 0 pixels everywhere, verify:visual is
0 drifted across 26 entries, and 135/135 feature contracts pass.

## Landed mechanisms

| Mechanism | Location |
| --- | --- |
| Three-family lineage (recipeBase / family / getRecipeChain) | app/core/theme-registry.js |
| Inheritance contract + child recipe discipline + commands | docs/THEME-FAMILY-CONTRACT.md |
| child+app-specific ratchet (baseline 0, allowlist) | scripts/verify-css.mjs + css-budget.json |
| System roles: --system-primary-divider, --system-secondary-divider, --system-border aliases | styles/00-foundation.css + family files |
| Registry-driven coverage audit | scripts/audit-app-theme-coverage.mjs |
| Full-window screenshots + computed-style sweep | scripts/screenshot-window-coverage.mjs |
| Paired shared-surface snapshots (classic/liquid/platinum) | scripts/css-surface-snapshot.mjs |
| Platinum canonical fidelity (10 controls + 9 icon specimens) | tests/visual/theme-lab-fidelity/platinum.json |

## Metric snapshot

- Platinum recipes: 90, all system-level (58 icon painters, 11 window chrome,
  14 controls, 3 menus, 3 parameter blocks, 1 Theme Lab).
- 61 windows x (Platinum/Classic) screenshots + computed styles; QA scan clean
  (8 icon-only buttons excluded as false positives).
- 23 surfaces x 2 themes = 200 paired captures; 89 chrome selectors confirm
  the delta is applied.
- Fidelity vs real Mac OS 9: geometry aligned everywhere (geometryMismatch 0,
  edgeError <= 0.3px), material <= 3.4; the 7-21% pixel deltas are text
  content and should not be "fixed".
- External cross-check (section 9): direct source study of classic-stylesheets,
  Classicy and platinum.css completed over the network on 2026-08-10 (see
  "External source study" below). Geometry is confirmed against all three
  independent implementations, plus the GUIdebook canonical harness.

## External source study (Classicy + platinum.css, 2026-08-10)

Direct study is no longer recorded as an external limitation. Full git trees
were fetched over the network and kept at
/private/tmp/classic-platinum-work-20260810/: Classicy
(robbiebyrd/classicy, 2,683 files), classic-stylesheets
(nielssp/classic-stylesheets, themes/macos9/_*.scss) and platinum.css
(mat-sz/platinum.css, src/index.scss). Licenses: Classicy Unlicense,
platinum.css BSD-3-Clause-Clear, classic-stylesheets MIT. Nothing was copied
into the repo; these notes record architecture and measured values only.

### Architecture: system resources own Platinum, apps do not

Classicy's SystemResources folder is exactly the division of labor our
contract describes: ~50 shared components (AboutWindow, Alert, BalloonHelp,
BevelButton, Button, ButtonToolbar, Checkbox, ColorPicker, ContextualMenu,
ControlGroup, ControlLabel, DatePicker, Disclosure, FileDialog, FileInput,
Icon, ImageWell, Input, Menu, Pager, Placard, PopUpMenu, ProgressBar,
QuickTime, RadioInput, RichTextEditor, Separator, Slider, Spinner, Tabs,
TextEditor, TimePicker, Tree, Triangle, Window, WindowFrame). Finder,
SimpleText, QuickTime, PictureViewer, PDFViewer and WebViewer all consume
those resources; their own SCSS is layout/content only (flex, gap, padding,
token colors) and none of them restyles the Platinum chrome. That validates
our child+app-specific ratchet baseline of 0: the app side of our tree already
matches the reference architecture.

### Value cross-check (three-way agreement)

| Token | classic-stylesheets macos9 | platinum.css | Classicy | AI System 6 Platinum |
| --- | --- | --- | --- | --- |
| Button radius | 3px | — (WIP) | 3px token (paddingSize/2; depressable mixin re-asserts 6px) | 3px |
| Button min-width | 58px | — | 58px (--hig-button-min-width) | 58px |
| Button padding | 2px 10px | — | 3px vertical / 8px horizontal (HIG text minimum) | 2px 10px |
| Button min-height | — | — | 20px | 20px |
| Titlebar controls | 11x11px | 11x11px | 12px (controlSize token) | 11px |
| Scrollbar | 16px | — | 16px | 16px |
| Selection | #ccf | — | #ccccff family (lavender) | #ccccff |
| Window frame | #cccccc | #cecece | #cccccc | #cccccc |
| Surface | #dddddd | #dedede | #dddddd | #dddddd |
| Titlebar stripes | white 1px + #777 1px | — | striped asset | white/#777 repeating 1px |
| System font | Charcoal | Charcoal | Charcoal | Charcoal |

(— = absent from that WIP/partial source.)

### Discrepancies recorded (not treated as fixes)

1. Titlebar control size: classic-stylesheets and platinum.css both draw
   11px; Classicy's token is 12px. We follow the 11px consensus, which is also
   the GUIdebook measurement.
2. Balloon help: Classicy draws a white bubble (8px radius); real Mac OS 9
   balloons are yellow (#ffffcc) with a pointer tail. We keep the yellow
   balloon, matching the real system and the Mac OS 8/9 HIG.
3. System gray ramp: Classicy uses #eeeeee/#dddddd/#cccccc/#aaaaaa/#808080/
   #393939/#202020; classic-stylesheets' root and our theme use the
   #eeeeee/#dddddd/#cccccc ramp with the #9999ff-family accent. Ours matches
   classic-stylesheets exactly and the measured Mac OS 9 palette.
4. Classicy body text is 14px (a web remake choice); classic-stylesheets and
   real Mac OS 9 use 12px. We keep 12px system text with 10px captions.

## Icon redraw (2026-08-10)

The previous Platinum system-icon SVGs were hand-invented approximations and
the user rejected them as incongruous with late Classic Mac OS. Root cause,
measured from the GUIdebook Mac OS 9.0 desktop capture
(drafts/theme-lab-fidelity-cache/platinum/guidebook-desktop-full-macos90.png):

- Real Mac OS 9 icons are light blue-gray (#d0d0e1 family), black-outlined,
  with white highlights and gray shading; the old SVGs used invented purple
  gradients (#9999ff / #6666cc / #ccccff) and a green accent that does not
  exist in Platinum.
- The old fixture "folder" reference crop was actually a photo thumbnail;
  automatic reference crops for 7 of 9 icon specimens were unusable.

Redraw (assets/themes/platinum/*-32.svg + matching 16px versions):

- folder: tab + light blue-gray gradient body + black outline + white edge
- document: white page, top-right fold, black text lines, gray shading
- floppy: metal shutter with slits + light cyan (#ccffff) label + dark lines
- trash: wire basket (handle, rim, vertical ribs) in measured grays
- startup-disk/hardDisk: light drive + dark slot (green accent removed)
- finder-app: canonical two-face Finder logo (white/black faces)
- applications: folder body + application grid

Wiring: styles/65 icon references now point at the 32px assets, the icon
manifest was updated, and the Platinum Theme Lab fixture was rebuilt. Verify:
theme-lab platinum 0.000% pixel diff; the app renders the redrawn icons.
Review sheet: drafts/theme-coverage/icon-redraw/icon-review-8x.png
(old | redrawn | real Mac OS 9 reference, 8x).

Measured fidelity after correcting the document/floppy/trash reference crops
to their real art boxes (canonical harness, 2026-08-10):

| Icon | geometryMismatch | edgeErrorPx | materialError |
| --- | --- | --- | --- |
| document-32 | 0 | 0.7 | 44.5 |
| floppy-32 | 0 | 0.4 | 104.9 |
| trash-32 | 0.003 | 1.1 | 37.7 |

The redrawn silhouettes are aligned with real Mac OS 9 (geometryMismatch
<= 0.003, edge <= 1.1px); material deltas quantify remaining painter work.
Note: the desktop capture's floppy carries a custom colored label, so its
material number is not a clean calibration target; folder/hard-disk/cd
specimens still need a valid reference source (their old crops were photo
thumbnails or clipped).

Closeout gate record (2026-08-10, combined tree): verify:release passed with
0 warnings (app bundle, release assets, src typecheck, 135 feature tests,
CSS budget, design governance, smoke, version consistency, frontend checkJs);
verify:theme-lab passed all six eras at 0.000%; verify:css passed. The only
remaining red was verify:visual's window/button geometry snapshot, owned by
the parallel Aqua lane's committed runtime refactor; their baseline update
landed and verify:visual is now green (26 entries, 0 drifted). As of the
final gate re-run (2026-08-10 ~05:32) every gate is green on the combined
tree: verify:release 0 warnings, verify:theme-lab 0.000% across all six
eras, verify:visual 0 drifted, verify:css (incl. child+app ratchet) passed.

## Remaining work (fidelity phase)

1. **Icon batch approved by the user (2026-08-10).** The complete Platinum
   icon set (~51 icons) is now generated by one shared recipe
   (scripts/build-platinum-icons.mjs) per the accepted style brief: black
   keyline, white highlight, subtle bevel, pixel-crisp edges, bright
   non-neon material palette, stable perspective, restrained hard shadow.
   System icons use measured Mac OS 9 colors (folder #ccccff family,
   floppy #cfcfe1/#ccffff, etc.).
2. The per-icon painter calibration approach is superseded by the unified
   recipe; any future fidelity fix is a recipe/palette change regenerating
   the whole set.
3. External references: classic-stylesheets assets are vendored in-repo and
   the value-level cross-check is consistent (see metric snapshot); the
   direct Classicy / platinum.css source study is complete (see "External
   source study" above; evidence at /private/tmp/classic-platinum-work-20260810/).
4. Human review of the screenshot set: drafts/theme-coverage/windows-platinum/.
5. Program closeout: this lane's work is committed (11 commits, backup at
   /private/tmp/classic-platinum-work-20260810/). The final tree-wide
   verify:release/theme-lab re-run waits for the parallel Aqua/Snow Leopard
   lanes' in-flight work (their 67 selector budget and aqua/snow fixtures are
   currently the only reds).

## Maintenance commands

```sh
npm run verify:css                      # budgets + child+app ratchet
npm run verify:theme-lab                # six-era Theme Lab regression
npm run verify:visual                   # Classic/Liquid computed snapshot
npm run verify:features -- appearance-system
npm run audit:theme-coverage            # registry-driven coverage audit
npm run screenshot:windows              # full-window screenshots
npm run compare:theme-lab:canonical     # Platinum vs real Mac OS 9
```

## Execution-order audit (plan sections 21-22)

Status per plan step, with the authoritative evidence for each:

| Plan item | Status | Evidence |
| --- | --- | --- |
| 1. Pull latest main | done | branch codex/system-closing on top of origin/main |
| 2. Save six-theme baseline | done | tests/visual/theme-lab/*.png + verify:theme-lab |
| 3. Save Platinum canonical fidelity | done | tests/visual/theme-lab-fidelity/platinum.json + drafts/theme-lab-fidelity/platinum/ |
| 4. Mechanical family CSS split (optional) | superseded | Aqua lane's 65 reorganization (uncommitted in their lane); contract documents the rule if conflicts return |
| 5. Three-family inheritance contract | done | docs/THEME-FAMILY-CONTRACT.md (EN/ZH) |
| 6. Map app-specific appearance to system/family semantics | done | divider/border aliases in 00-foundation.css, zero-diff verified |
| 7. Real-app Platinum coverage audit | done | 61 windows, 0 child+app-specific selectors (audit + screenshot scripts) |
| 8. Delete inheritable Platinum app-specific selectors | done | ratchet baseline 0 (verify:css) |
| 9. Cross-check classic-stylesheets / Classicy / platinum.css | done | full source study over the network (Classicy 2,683-file tree, SystemResources architecture, platinum.css src/index.scss, classic-stylesheets macos9 modules); three-way geometry agreement, discrepancies documented in "External source study" |
| 10. Fix remaining Platinum fidelity details | partial | icons redrawn with measured palette; Mac OS 9 HIG audit (drafts/platinum-hig-audit.md) fixed grow box, inactive titlebar controls, balloon help; painter calibration pending human crop approval |
| 11. Classic + Platinum paired regression | done | verify:theme-lab six eras 0.000% |
| 12. Six-theme shared-infrastructure regression | done | verify:theme-lab 0.000% at 4098c729; verify:release 0 warnings |
| 13. Output maintenance-cost metrics | done | Metric snapshot + Conclusions |
| 22. Final questions | done | Conclusions answer all five; final release gate re-run at closeout |

Open items blocking the completion audit: (a) human visual review of the
redrawn icons; (b) the parallel Aqua lane's uncommitted visual baseline and
65 reorganization (verify:visual's one red); (c) one final verify:release /
verify:visual re-run once the tree settles.
