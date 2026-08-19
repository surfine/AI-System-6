# Appearance QA Matrix

AI System 6 release-supported Appearance surface is all six appearances:

| Surface            | Classic / System 6 | Platinum | Aqua | Snow Leopard | Yosemite | Liquid Glass |
| --- | --- | --- | --- | --- | --- | --- |
| Boot               | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Start Here         | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Finder             | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Applications       | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Project Hard Disk  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| File Floppy        | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Draft Desk         | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Writing Studio     | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TeachText          | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Review Desk        | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ClioTalk           | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Control Panel      | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| System Modal       | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Menu Bar           | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Phone Layout       | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

All six are release appearances (registry `releaseReady: true`) exposed in the
Control Panel Appearance selector and the Special menu; none is gated behind a
research switch. The four historical appearances are additionally held to
their pinned canonical references by `npm run verify:theme-lab:fidelity`, which
checks two separate tiers: the recorded-run `tolerances` (regression) and the
shared `FIDELITY_FLOOR` (absolute distance from the era target). Each specimen
declares where it stands in its `floor` ledger, so a board can never report
"canonical" while it sits far from its reference. See
[THEME-FAMILY-CONTRACT.md](THEME-FAMILY-CONTRACT.md) section 9.

Current floor standing (2026-08-17, measured, not estimated):

| Board | Specimens | Meets the floor | Recorded gap | Unusable reference |
| --- | --- | --- | --- | --- |
| Platinum | 20 | 12 | 5 | 3 (icon material, photo-thumbnail crops) |
| Aqua | 16 | 16 | 0 | 0 |
| Snow Leopard | 17 | 17 | 0 | 0 |
| Yosemite | 19 | 6 | 13 | 0 |
| Yosemite 2x | 5 | 4 | 1 | 0 |

### Control-state coverage

Every board pins a disabled or focus state where a pinned canonical source
carries one. Two of those specimens found real painter defects, which is what
the state coverage is for:

| State | Platinum | Aqua | Snow Leopard | Yosemite |
| --- | --- | --- | --- | --- |
| disabled button | `button-disabled` (meets floor) | `button-disabled` (meets floor) | — | — |
| disabled row | — | `list-row-disabled` (meets floor) | — | — |
| disabled checkbox / radio | — | — | `checkbox-disabled`, `radio-disabled` (meets floor) | — |
| focus ring | — | `search-field-focused` (meets floor, exact) | `search-field-focused` (meets floor) | `search-field-focused` (meets floor) |

The Aqua and Snow Leopard focus rings were correct all along — Aqua measures
0/0/0 against its native 10.2 capture. Only the Theme Lab could not show them:
its resting search-field rule sits at specificity (0,2,1), so it outranked the
shared painted-focus rule (0,2,0) for Snow Leopard and tied the Aqua focus
recipe (0,2,1) and won on document order. Real `:focus` was never affected,
because the era `:focus` recipes sit at (0,2,2). The fix adds one lab-scoped
rule in `apps/desktop/styles/66-theme-lab.css` that supplies only the ring, so each era keeps
its own search-field radius, padding, and background.

Open state gaps, with the reason each one is not pinned yet:

- **Platinum focus ring.** The Mac OS 9 focus frame is in the cached Sherlock 2
  capture, which is not a pinned source. Pinning it needs its canonical URL
  established; it must not be guessed.
- **Yosemite disabled state.** No pinned 10.10 source contains a disabled
  control. Either pin the About This Mac capture (its disabled zoom lamp) or the
  GTK-clone insensitive assets, at the same evidence tier as the other Yosemite
  control references.
- **Hover, every era.** No pinned static capture contains a pointer-hover
  state. The menu highlight, which is the closest era equivalent, is already
  covered by `menu-selected` / `menu-selected-item`. A hover specimen needs a
  new evidence source and a hover step in the harness; inventing one would be
  fake fidelity.

### Yosemite reference audit (2026-08-17)

Every Yosemite gap was traced back to the pixels it is measured against. Six
specimens pointed at crops that did not contain the control they claimed to
measure, because the three sources pinned at the time -- a Finder window, an
Apple menu and the System Preferences General pane -- hold no push button, text
field, dialog, backdrop window or selected list row. Four more 10.10 captures
from the same 512 Pixels library are now pinned, and the affected specimens were
re-registered against the real controls:

| Specimen | Old reference | New reference | Effect |
| --- | --- | --- | --- |
| `textfield` | blank window background | Get Info "Add Tags" field | material 36.7 -> 0, **meets the floor** |
| `button-default` | a corner of the Appearance pop-up's blue swatch | Force Quit default button | material 78.4 -> 17.2, silhouette now exact |
| `inactive-titlebar` | *active* red/yellow lamps | Mail backdrop window | material 66.4 -> 12.3, silhouette now exact |
| `list-selected` | tops of the Finder folder icons | Force Quit selected row | exposed a real painter defect, now fixed: material 91.8 -> 10.2 |
| `dialog` | the same blank background strip | Empty Trash alert body | now a real gap: the fixture alert carries different content, so the silhouette differs by layout |
| `menu-selected` | crop started 6pt above the highlighted row | same capture, re-registered | material 45.5 -> 6.2 |

The wrong reference had also produced a wrong token. Yosemite's
`--theme-lab-list-selected-bg` was `#97ddfd` "measured from the real 10.10
Finder capture" -- but that capture is in icon view with nothing selected, and
`#97ddfd` is the folder icon's tab, the very pixels the old crop covered. A
focused 10.10 list selection is solid `#116cd6` with white labels, measured from
the Force Quit list. The token now carries that value and the fixture reads 10.2.

Two specimens still have no valid evidence:

- `button-pressed` -- a pressed push button is a transient state that no static
  capture in the library holds.
- `segmented-control` -- the reference is a pop-up button while the fixture side
  is a checked radio input; the two sides measure different controls. The Finder
  toolbar view-mode group is the real 10.10 segmented control and is the
  candidate reference once the fixture side is pointed at a segmented control.

The sidebar pair had the same fault and the same cure. Both specimens pinned
the *same* unselected Downloads slice from the active Finder window, so the
inactive one was comparing an inactive fixture against an active native sidebar,
and neither could see a selection. They are now pinned to the Applications
capture (active window, selected row) and the Mail backdrop window (the only
inactive window in the source set). The fixture painted its source-list
selection product blue; both captures show a flat `#cecece` fill with dark
labels in *both* window states -- what changes with window state is the
sidebar's vibrancy, not the selection colour. Material fell 26.7 -> 7.8 and
26.8 -> 8.5. The silhouette stays a gap because the native source list carries
eight rows, section headers and row icons against the fixture's three plain
rows, and the `backdrop-filter` assertions remain the normative contract for
the active/inactive distinction.

Two more are registration or evidence-quality caveats rather than painter debt:
`search-field` compares a mid-slice of a 325pt native field with a centred
placeholder against a 150pt fixture field with a left-aligned one;
`checkbox-checked` and `radio-checked` compare against GTK-clone glyphs rather
than native 10.10 art.

Yosemite is the open fidelity debt: 13 of 19 specimens do not reach the floor.
Its window and control references are native 10.10 captures; only the checkbox,
radio and title-button glyphs still compare against GTK-clone assets. System 6 and Liquid Glass have no historical screenshot target and
keep their design contract plus regression baseline; no fake fidelity board is
created for them.
Liquid Glass is being recalibrated to macOS 27 Golden Gate through the existing
theme IDs and material tokens; it does not introduce a new theme or family.
`npm run verify:appearance-apps` separately renders Finder, Page Setup,
TeachText, Scrapbook, Cover Glass, and Endfield Terminal under every
appearance, proving that ordinary and visually-special apps receive the same
system title-bar painter without conflating that propagation check with either
pixel regression or historical fidelity.

QA criteria per surface: no clipping, no unreadable text, no wrong contrast,
no broken focus, no wrong icon, and no malformed window chrome.
