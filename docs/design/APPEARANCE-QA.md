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

Current floor standing (2026-08-11, measured, not estimated):

| Board | Specimens | Meets the floor | Recorded gap | Unusable reference |
| --- | --- | --- | --- | --- |
| Platinum | 20 | 12 | 5 | 3 (icon material, photo-thumbnail crops) |
| Aqua | 16 | 11 | 5 | 0 |
| Snow Leopard | 17 | 10 | 7 | 0 |
| Yosemite | 19 | 4 | 15 | 0 |
| Yosemite 2x | 5 | 1 | 4 | 0 |

### Control-state coverage

Every board pins a disabled or focus state where a pinned canonical source
carries one. Two of those specimens found real painter defects, which is what
the state coverage is for:

| State | Platinum | Aqua | Snow Leopard | Yosemite |
| --- | --- | --- | --- | --- |
| disabled button | `button-disabled` (meets floor) | `button-disabled` (gap: no capsule) | — | — |
| disabled row | — | `list-row-disabled` (gap: no row shape) | — | — |
| disabled checkbox / radio | — | — | `checkbox-disabled`, `radio-disabled` (gap: blue fill kept) | — |
| focus ring | — | `search-field-focused` (meets floor, exact) | `search-field-focused` (meets floor) | `search-field-focused` (meets floor) |

The Aqua and Snow Leopard focus rings were correct all along — Aqua measures
0/0/0 against its native 10.2 capture. Only the Theme Lab could not show them:
its resting search-field rule sits at specificity (0,2,1), so it outranked the
shared painted-focus rule (0,2,0) for Snow Leopard and tied the Aqua focus
recipe (0,2,1) and won on document order. Real `:focus` was never affected,
because the era `:focus` recipes sit at (0,2,2). The fix adds one lab-scoped
rule in `styles/66-theme-lab.css` that supplies only the ring, so each era keeps
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

Yosemite is the open fidelity debt: 15 of 19 specimens do not reach the floor,
and its control references are GTK-clone assets rather than native 10.10
captures. System 6 and Liquid Glass have no historical screenshot target and
keep their design contract plus regression baseline; no fake fidelity board is
created for them.
`npm run verify:appearance-apps` separately renders Finder, Page Setup,
TeachText, Scrapbook, Liquid Cover, and Endfield Terminal under every
appearance, proving that ordinary and visually-special apps receive the same
system title-bar painter without conflating that propagation check with either
pixel regression or historical fidelity.

QA criteria per surface: no clipping, no unreadable text, no wrong contrast,
no broken focus, no wrong icon, and no malformed window chrome.
