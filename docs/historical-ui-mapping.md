# Historical UI Mapping

This document constrains how AI System 6 surfaces that have **no direct
historical counterpart** are drawn in the five appearances (Classic /
Platinum / Aqua / Snow Leopard / Yosemite, plus Liquid Glass as the
non-historical glass skin). It is a working contract for execution agents:
**capabilities may come from 2026, but the visual grammar must belong to the
target era.**

Companion evidence: `drafts/appearance-external-research.md` (Quaqua / 512
Pixels / GTK / web-donor measurements), `tests/visual/theme-lab-fidelity/*`
(harness + review boards).

---

## 1. Execution rules when there is no historical reference

1. **Direct historical counterpart exists** -> reproduce it. Window chrome,
   menu bar, menu, toolbar, button, default button, checkbox, radio, text
   field, search field, popup button, tabs, segmented control, scrollbar,
   list, source list / sidebar, selection, dialog, sheet, progress
   indicator must match the real system or a mature reproduction
   (Quaqua / GTK theme / historical product CSS), pixel-level where the
   harness can measure it.
2. **No same-name control, but a similar contemporary Apple app exists** ->
   borrow its layout and organization, not its feature names. See the era
   reference matrix in section 2.
3. **No similar software at all** -> use only UI primitives that existed in
   the target era, recombined. Never invent a modern surface because the
   feature itself is modern.

Modern capability semantics, data structures, and workflows stay modern.
The controls, geometry, typography, spacing, hierarchy, window organization,
affordances, and material must be era-native.

**Two acceptance criteria are separate:**

- **A. System controls with a direct reference** -> reference accuracy:
  reference screenshot, overlay, pixel diff (theme-lab-fidelity harness).
- **B. AI System 6-unique surfaces** -> historical plausibility: the
  question is not "does it match a screenshot", but "if this screenshot were
  mixed into a real gallery of that era, what would give it away as 2026?".
  Fix each anachronism found.

**No "unified design language" may override historical difference.** The
shared DOM and shared component architecture are allowed; the visual
expression of the same concept may differ per era (e.g. Attached Sources:
framed list in Mac OS 9, Aqua list/drawer in Jaguar, source-list/table in
Snow Leopard, translucent sidebar in Yosemite).

**Non-multimodal execution model rules:** a model that cannot view
screenshots must not declare visual completion from prose. It reads
reference implementations, edits CSS, runs Theme Lab and the diff harness,
fixes the largest measured errors, and assembles un-referenced surfaces only
from confirmed shared recipes plus this mapping. It never decides "this
probably looks like 2002" on its own.

---

## 2. Era reference matrix

| Era | Reference applications to study | Canonical sources |
| --- | --- | --- |
| Mac OS 9 | Finder, Sherlock, Control Panels, SimpleText, QuickTime Player, AppleWorks, Navigation Services dialogs | Guidebook Gallery screenshots; existing Platinum fixture + fidelity manifests |
| Mac OS X 10.2 Jaguar | Finder, Sherlock, System Preferences, TextEdit, Mail, Address Book, Preview, QuickTime Player, standard Cocoa dialogs | Quaqua 9.1 Jaguar look (sprites + guide screenshots); 512 Pixels Aqua library |
| Mac OS X 10.6 Snow Leopard | Finder, System Preferences, Safari, Mail, TextEdit, Preview, iTunes, iCal, Address Book, standard Cocoa dialogs | 512 Pixels 10.6 library (1x, 2010 Mac mini); Quaqua 9.1 Snow Leopard look |
| OS X 10.10 Yosemite | Finder, System Preferences, Safari, Mail, TextEdit, Preview, iTunes, standard dialogs / sheets / popovers | 512 Pixels 10.10 library (2x Retina); Yosemite-gtk / McOS-YS as structural cross-checks |

For every era, "how does the app organize information" matters more than
feature names: how panes split, how the toolbar is ordered, how the sidebar
is grouped, how selection works, how search is entered, how the detail view
presents, where the action button sits, how dialogs confirm.

---

## 3. Component -> historical mother mapping

### ClioTalk (conversation / transcript)

| Era | Historical mother | Real primitives to use |
| --- | --- | --- |
| Mac OS 9 | SimpleText / AppleWorks document + Navigation Services | window, scroll view, text view, text field, push button, default button, status text; transcript rows are plain document lines |
| Jaguar | Cocoa transcript/document + Aqua input controls (TextEdit / Mail compose) | Aqua window, scroll view, text view, text field, push button / default button, status text |
| Snow Leopard | Cocoa document window; source-list/detail where appropriate (Mail) | toolbar, source list, table, text view, NSSearchField only where search belongs |
| Yosemite | Standard content view + translucent sidebar where appropriate (Mail / Notes) | toolbar, translucent sidebar, table/text view, standard buttons |

Forbidden for ClioTalk everywhere except Liquid Glass: chat bubbles,
floating input cards, pill send buttons, oversized rounded panels.

### Searcher (`find_path`)

| Era | Historical mother | Real primitives |
| --- | --- | --- |
| Mac OS 9 | Sherlock + Finder | search field (plain text field + button), result list, status line, cancel |
| Jaguar | Sherlock + early Aqua search controls | Aqua search field, result table/list, status text |
| Snow Leopard | Finder / Safari search field + result list | NSSearchField recipe, result table, toolbar placement |
| Yosemite | Finder / Safari toolbar search + source-list conventions | toolbar search field, translucent sidebar, result table |

### Review Desk

All eras: split view + table/list + inspector/detail pane + standard
toolbar/actions. Era expression: Mac OS 9 -> framed list + fixed detail
pane (no split-view chrome of the Aqua kind); Jaguar -> Aqua split view /
drawer; Snow Leopard -> source-list + inspector (Mail style); Yosemite ->
split view with translucent sidebar.

### DocMap

All eras: outline view + source list + scroll view + disclosure triangles +
inspector/detail pane. Mac OS 9 uses the Finder list-view disclosure
triangle idiom; Jaguar+ use NSOutlineView-style rows.

### Model Picker

All eras: popup button + preferences-style selection; a list/table only
where the target era would put a list. Never a floating card or a modern
sheet of pills.

### Attached Sources / Context (`contextPanel`)

| Era | Historical expression |
| --- | --- |
| Mac OS 9 | framed list / Finder-like item list |
| Jaguar | Aqua list / drawer / pane |
| Snow Leopard | source-list / table / inspector |
| Yosemite | translucent sidebar / modern list |

### Notifications (System Messages)

| Era | Historical expression |
| --- | --- |
| Mac OS 9 | standard alert + status item; no notification center |
| Jaguar | standard alert + status item (menu bar extra) |
| Snow Leopard | standard alert + status item; no Notification Center before 10.8 |
| Yosemite | notification-center-style list panel + banner alerts (10.10 has NC) |

### Settings

All eras: the Control Panel / System Preferences idiom of the target era:
Mac OS 9 -> Control Panels window with small controls; Jaguar -> System
Preferences with toolbar categories; Snow Leopard -> System Preferences with
sidebar categories; Yosemite -> System Preferences sidebar + content.

### Other AI System 6 surfaces (compact)

| Surface | Historical mother (all eras unless noted) |
| --- | --- |
| Reader | document window: text view + list of sources |
| Scrapbook | document window with item grid/list; Mac OS 9 Scrapbook window idiom |
| Question Sheet | standard dialog + form fields (Navigation Services) |
| Writer Guide | help/document window with sections |
| Memory Cards | list + detail pane (table/list + inspector) |
| ClioStage | document window + standard controls |
| CMF Studio | document window + inspector/detail pane |
| Translation Pad | document window + split view + fields |
| Dictation | dialog/alert + status text |
| Endfield Terminal | terminal-style text view window (Jaguar Terminal idiom) |
| Soundscape | control-panel-style window: sliders + buttons |

---

## 4. Cross-era forbidden patterns

Any of these in a non-Liquid-Glass appearance is an anachronism to fix:

- modern chat bubbles (including rounded message bubbles in ClioTalk)
- pill-shaped controls everywhere; oversized radii
- floating cards / glass cards / floating toolbars
- modern web-dashboard layouts and dense card grids
- iOS-style sidebars and bottom sheets
- spacing and padding that belongs to 2020s web
- fonts that do not exist in the era (see `--theme-ui-font` per theme)
- toolbar hierarchy or button placement that contradicts the era's
  conventions (e.g. a "send" pill where the era would use a push button)
- modal/dialog structure that contradicts the era (e.g. sheets where the
  era had dialogs, popovers where the era had drawers)

---

## 5. Provenance and updating this mapping

When a more accurate historical mother is found, update this document and
record the reference source (URL + capture scale + date) in the same edit.
All measurements consulted for the current recipes live in
`drafts/appearance-external-research.md`; the fidelity manifests pin the
canonical sources and crop coordinates.
