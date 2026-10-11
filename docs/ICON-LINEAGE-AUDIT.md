# AI System 6 Icon Lineage Audit

<!-- doc-claims: historical | audited: 2026-09-18 -->

## Audit record and verdict

| Field | Value |
| --- | --- |
| Code baseline | `35eb63f814145d8e9719f0421ac34f48179c85f5` (`main` at audit start, 2026-08-13) |
| Audited target | Classic / System 6, Platinum / Mac OS 9.0, Aqua / Mac OS X 10.2 Jaguar, Mac OS X 10.6.8 Snow Leopard, OS X 10.10 Yosemite, macOS Tahoe 26 Liquid Glass |
| Runtime inventory | 56 semantic ids × 6 appearances |
| Acceptance priority | 16 lineage cores first; the other 40 remain P2 until individually reviewed |
| Score source | Expert evidence review of runtime mappings, family ledgers, builders, current pixels, and local historical references |
| Blind-review status | Anonymous mix boards can be generated, but no independent human blind reviewer has submitted results |
| Overall verdict | **FAIL / work remains.** The audit does not lower the 4/4/4 threshold to call the family complete. |

The baseline had complete runtime coverage, but coverage was being confused with
historical acceptance. The most serious problem was a false Finder lineage:
Platinum through Liquid Glass were expressed as variations of a compact
Macintosh instead of following each target era's Finder history. The same
ledgers also allowed `accepted-generated` to read like
historical validation, while several modern families were one generated master
plus deterministic size derivatives.

The implementation work associated with this audit closes that P0 lineage
without treating generation as evidence. Classic Finder remains a smooth,
native-anatomy-guided Retina SVG. Platinum, Jaguar, Snow Leopard, Yosemite, and
Liquid Glass Finder now use separately reviewed ImageGen v2 redraws grounded in
the target-era references; their runtime, compact tiers, ledgers, and review
boards resolve the same accepted pixels. All six Finder cells are
`reference-validated`. All six MultiFinder cells are provenance class C:
current-era Finder identity plus multiplicity, `historically-reviewed`, and
explicitly not native replicas.

The same final-overlay discipline now also closes Review Desk's five modern
cells. Platinum is P-C; Jaguar, Snow Leopard, Yosemite, and Liquid Glass are
P-B. All five are `historically-reviewed`, not `reference-validated`, because
no native Review Desk icon is claimed; their blind-mix status remains
`not-run`. The compact 32 and 16 px tiers are independent optical redraws, and
Liquid Glass is composed from true `backing`, `manuscript`, and `correction`
sources rather than a colour split of a baked master.

Searcher now follows the same honest separation of authoring and evidence.
Platinum, Jaguar, Snow Leopard, and Yosemite are promoted as P-B,
`historically-reviewed` runtime reinterpretations with independent optical 32
and 16 px artwork. They are not native replicas or `reference-validated`, and
their blind-mix status is `not-run`. Liquid Glass Searcher remains on its prior
runtime art with historical status `pending` because its 16 px hierarchy did
not pass the promotion review.

ClioTalk now closes two additional cells without reviving the fixed
two-balloon metaphor. Yosemite is a P-B free-form conversation sheet with
independent optical 32/16 artwork. Liquid Glass is a P-B layered conversation
panel with independent `enclosure`, `panel`, `conversation`, and `provisional`
sources at 128/64/32/16; every Default tier exactly recomposes from those
sources. Both are `historically-reviewed`, non-native, and
`blindMixStatus: not-run`. Platinum, Jaguar, and Snow Leopard remain pending.

These closures do not approve the whole 56-object system. Eleven priority
cores retain all of their recorded scores and statuses; Searcher remains open
in Liquid Glass, ClioTalk remains open in Platinum/Jaguar/Snow Leopard, and all
40 lower-priority objects stay explicitly open until individually reviewed.

## Controlling decisions

### Continuity means identity, not a frozen composition

The durable contract is:

- `semanticIdentity`: what product or system role the object communicates;
- `identityAnchors`: at most one or two recognition cues;
- `historicalPrototype`: the real target-OS object, when one exists;
- `genre`: system identity, application, utility, document, hardware,
  removable media, or small UI symbol;
- `eraTranslation`: how the same role is redrawn in that era;
- `allowedChanges`: silhouette, container, perspective, material, palette,
  detail density, shadow, and small-size construction.

`metaphorKey` is therefore not permission to preserve an entire physical
composition forever. A real target-OS prototype wins whenever mechanical
cross-era similarity conflicts with history.

### Classic smooth-SVG project exception

The product owner explicitly selected smooth, scalable SVG for Classic so the
runtime remains clean on Retina displays. This is a project rendering exception
to the repository's normal native-pixel guidance; it is **not** described as an
exact bitmap or pixel replica.

The exception does not relax the evidence requirement. When native evidence
exists, the smooth redraw must preserve the native object's anatomy: silhouette,
part relationships, occupied proportion, asymmetry, negative space, state/mask
meaning, and relative optical scale. It must not replace an observed object
with a generic smooth symbol. Separate 32 and 16 SVGs may simplify or move
details for optical reading; both must remain recognisably grounded in the same
native prototype.

### Generation is an authoring method, not evidence

Image generation is an efficient and permitted way to make candidates and
period-plausible originals. It may establish an authoring status such as
`generated-draft` or `technically-clean`. It cannot establish a historical
status by itself.

Historical status is a separate axis:

| Axis | Allowed meaning |
| --- | --- |
| Authoring | `generated-draft`, deterministic redraw, hand/vector redraw, derivative |
| Technical | alpha/bounds/size/manifest checks passed or failed |
| Historical | `pending`, `historically-reviewed`, `reference-validated` |
| Runtime | reachable runtime asset, Theme Lab-only review asset, or evidence-only reference |

The string `accepted-generated` can mean an accepted source for a deterministic
build. It must never be expanded to mean historically approved.

## Method

1. Freeze the code baseline and enumerate the 56 runtime ids, manifests, family
   ledgers, source archives, builders, Theme Lab mappings, and current pixels.
2. Compare README claims, family entries, manifests, and the asset actually
   selected by runtime. A ledger entry is not credited when a later overlay
   replaces its pixels.
3. Apply this evidence order: real target-OS resources/screenshots; period Apple
   documentation; verifiable period implementation; historical screenshot
   archive; modern recreation; visual inference.
4. Review the 16 cores horizontally for semantic continuity and vertically for
   era authenticity and family harmony.
5. Inspect 32 and 16 as artwork, not filenames. A derivative is recorded as a
   derivative even if it is technically clean.
6. Keep historical Apple pixels in local evidence only. No reference crop,
   extracted resource, or traced Apple path becomes a redistributable runtime
   asset.

## Provenance classes

To avoid collision with the A/B/C scoring dimensions below, provenance is
written as **P-A**, **P-B**, and **P-C**.

- **P-A — native prototype reconstruction:** a directly corresponding target
  system object exists; comparison against that object is required.
- **P-B — period analog adaptation:** no exact product exists, but a close
  contemporary application or object supplies grammar.
- **P-C — original period-plausible design:** no defensible direct analog; the
  test is whether it belongs beside genuine period icons without looking sent
  back from 2026.

| Core id | Classic | Platinum | Jaguar | Snow Leopard | Yosemite | Liquid Glass | Controlling identity / analog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `finderApp` | P-A | P-A | P-A | P-A | P-A | P-A | Target OS Finder/system identity |
| `multiFinderApp` | P-C | P-C | P-C | P-C | P-C | P-C | Current-era Finder identity + multiplicity; no native icon claimed |
| `folder` | P-A | P-A | P-A | P-A | P-A | P-A | Target OS generic folder |
| `hardDisk` | P-A | P-A | P-A | P-A | P-A | P-A | Target OS mounted disk/volume |
| `trash` | P-A | P-A | P-A | P-A | P-A | P-A | Target OS empty Trash |
| `document` | P-A | P-A | P-A | P-A | P-A | P-A | Target OS generic document |
| `fileFloppy` | P-B | P-B | P-B | P-B | P-B | P-B | Period redraw of a stable product metaphor |
| `projectDisk` | P-B | P-B | P-B | P-B | P-B | Labeled durable project volume |
| `projectDisc` | P-B | P-B | P-B | P-B | P-B | Period optical/archive medium |
| `searcher` | P-B | P-B | P-B | P-B | P-B | Search/discovery utility; magnifier anchor |
| `teachText` | P-B | P-B | P-B | P-B | P-B | Period text editor / writing document |
| `scrapbook` | P-A | P-B | P-B | P-B | P-B | P-B | Native Scrapbook ancestry; selected-clipping album thereafter |
| `assistant` | P-C | P-B | P-B | P-B | P-B | P-B | Conversation/correspondence analog; provisional-output cue is product-specific |
| `controlPanel` | P-A | P-A | P-A | P-A | P-A | P-A | Control Panel / System Preferences / Settings |
| `reviewDesk` | P-B | P-C | P-B | P-B | P-B | P-B | Writer-controlled marked-manuscript proofing and correction; no native icon claimed |
| `docMap` | P-C | P-C | P-C | P-C | P-C | Document structure expressed as a branching map |

## Findings by era and lineage

### Finder and MultiFinder — P0 closed

The baseline board proves the failure clearly: the five post-Classic versions
continued a compact-computer chassis instead of following the target Finder
prototype. That continuity was invented by this project, not inherited from
Finder history.

The required contract is:

- Classic: smooth SVG whose anatomy is guided by System `ICN# 3`; no exact
  pixel-replica claim.
- Platinum: the Mac OS 9 folder/system-identity treatment with a Finder face,
  not a recoloured System 6 compact computer.
- Jaguar and Snow Leopard: the era's front-on, two-field smiling Finder face,
  with their own divider, lighting, palette, and material density.
- Yosemite: the brighter, flatter 10.10 split-face construction, without
  importing a family-wide modern squircle rule.
- Liquid Glass: blue identity enclosure plus a separate translucent face layer,
  ink features, and Tahoe-specific material treatment.
- MultiFinder: current-era Finder identity plus multiplicity. It is P-C unless
  a direct native icon is found; two beige machines are not a permanent rule.

The Finder reference board must show current runtime art above and the real
local reference below. Reference pixels remain evidence-only.

Current implementation status now matches that contract:

| Cell | Runtime status | Historical status |
| --- | --- | --- |
| Classic Finder | Smooth Retina SVG retained | `reference-validated` — completed |
| Classic MultiFinder | Smooth current-era Finder identity plus multiplicity | `historically-reviewed` — P-C; no native replica claim |
| Platinum–Liquid Glass Finder | Approved, target-era ImageGen v2 redraws selected by runtime | `reference-validated` — completed |
| Platinum–Liquid Glass MultiFinder | Approved current-era Finder identity plus multiplicity | `historically-reviewed` — P-C; no native replica claim |

The rejected first-generation candidate sheet and programmatic overlay remain
negative authoring evidence only. The approved v2 redraws receive runtime and
historical credit only because each was separately compared with its target-era
reference, reviewed at large and compact sizes, and promoted through the final
runtime overlay.

Classic Finder is completed under the Retina exception. The non-runtime
one-bit evidence reconstruction matches System `ICN# 3` with
`referenceDiffPixels = 0`. The shipped 32 px smooth SVG is separately measured
against that authority: two-pixel tolerant F1 `0.9159`, maximum bounding-box
edge delta `2 px`. It follows the observed ICN# anatomy and has no invented
smiling screen. Those measurements validate a close smooth anatomical redraw;
they do not turn the runtime SVG into an exact-pixel claim.

### Classic / System 6

The baseline already advertised a smooth SVG family, which agrees with the
owner's latest Retina decision. The failure was not “SVG versus bitmap”; it was
that broad generated/geometric output could overwrite native-guided core
anatomy while still sounding historically complete.

Acceptance now requires two distinct claims:

- native-evidence objects: smooth anatomical reconstruction, compared with the
  resource/screenshot and never called exact pixels;
- product-only objects: generated or deterministic P-B/P-C candidates whose
  period fit remains a separate review decision.

Finder selection remains artwork plus mask/inversion logic. Native proportions
must not be normalised merely to make all 56 silhouettes equally large.

Completed Classic evidence/runtime split:

- exact one-bit reconstruction: comparison authority only, `diff = 0`;
- smooth 32/16 Retina SVG: runtime representation with separate optical sizes;
- native-guided runtime objects: `reference-validated` only after the anatomy
  comparison passes;
- product-only objects: technically complete, historical status still pending
  unless separately reviewed.

### Platinum / Mac OS 9

The family has plausible integer-grid ingredients, but “accepted ImageGen” is
not a full-family historical review. The risk signals are excessive lavender,
uniform dark outlining, over-regular geometry, and shallow volume that becomes
either “System 6 + gray” or a Windows-95-like bevel.

The controlling comparison remains 32 and 16 at integer zoom, with selective
keyline, upper-left highlight, lower-right structural shade, compact optical
density, and independently readable small artwork. The approved Finder v2
redraw now follows the Mac OS 9 lavender folder and lower-left face-panel
prototype. Finder and MultiFinder are rendered directly for the 42, 32, and 16
target canvases with size-owned bounds and contrast; they are not the broad
family's old compact-computer derivatives. Review Desk separately owns a P-C
Platinum proofreader application with independent optical 32 and 16 px redraws.
Searcher now separately owns a P-B hard-pixel search utility at 42 px plus
independent optical 32 and 16 px drawings. The remaining 11 unchanged priority
objects and the complete generated family still require object-by-object
blind-mix and reference review.

### Jaguar / Mac OS X 10.2

The 56-object overlay is technically complete but genre-poor. An audit of the
core pixels found a strong blue/cyan convergence (about 94.6% by the audit's
blue/cyan-family measure), which is a warning that user applications, utilities,
documents, hardware, and removable media are being treated as one theme pack.

Jaguar Finder now uses the approved low rectangular split-face Aqua plaque and
passes the native 10.2 prototype comparison. Runtime dispatch selects the
per-object 16 px asset for mini/menu/control-strip and Finder-list contexts,
32 px for ordinary contexts, and 128 px for desktop/large/Retina contexts;
the sprite and manifest are compatibility/review artifacts. Finder and
MultiFinder own directly constructed optical assets at all three runtime
tiers. Those two cells no longer inherit the broad family's compact-computer
composition or derivative-size claim. Review Desk separately owns a P-B Jaguar
copy-stand application and independent optical 32 and 16 px redraws. Searcher
now separately owns a P-B jewel-cobalt lens and result-card relationship, with
independent optical 32 and 16 px drawings. The remaining 11 unchanged priority
objects still need genre-specific perspective, material, and compact-size
review.

### Snow Leopard / Mac OS X 10.6.8

The baseline README correctly admits that 512/128/32/16 were deterministic
derivatives of one accepted master. That honesty is useful, but it is not the
requested final state. A 512 derivative does not prove high-resolution material
detail, and a 16 derivative does not prove compact legibility.

Finder now follows the mature 10.6 split face and curved black profile divider.
Runtime dispatch selects per-object 16, 32, or 128 px assets by the same compact,
ordinary, and desktop/large/Retina context policy; the sprite and manifest are
compatibility/review artifacts. Finder and MultiFinder have directly
constructed and optically reviewed 512, 128, 32, and 16 px assets. Review Desk
separately owns a P-B professional proofing-board application; its 32 and 16 px
drawings remove paper texture and fine rows instead of blurring the large
master. Searcher now separately owns a P-B clear-lens and indexed-ledger
relationship whose independent optical 32 and 16 px drawings remove texture
and fine detail. The other cores still need real multi-size review or optical artwork
where texture, lens, pencil, dash, page layer, or shadow collapses. Until then
the rest of Snow Leopard remains vulnerable to looking like Jaguar with quieter
saturation rather than a mature 10.6 family.

### Yosemite / OS X 10.10

The baseline avoids claiming that every object must be a squircle, but the
generated family still converges strongly on blue/cyan (about 85.3% by the same
audit measure). The main contamination checks are later-macOS containers,
SF-Symbol-like uniform strokes, contemporary AI gradients, excessive symmetry,
and loss of object-specific silhouettes.

The approved 10.10 Finder redraw now uses the lower, wider blue/light split-face
construction and avoids a later family-wide squircle rule. Finder is
`reference-validated`; Finder and MultiFinder own directly constructed
128/64/32/16 optical assets. Runtime selects 16 px for compact system contexts,
32 px for ordinary contexts, and 128 px for desktop/large/Retina contexts;
the manifest is compatibility/review metadata rather than a single runtime
source. Review Desk separately owns a P-B free-form manuscript stack: the coral
bracket remains at 16 px while the cyan caret is deliberately dropped. Searcher
now separately owns a P-B free-form shallow cyan lens and one result slip, with
independent optical 32 and 16 px drawings. The rest of the family remains under
review: “clean modern flat SVG” is not equivalent to “a 2014 Mac application.”

### Liquid Glass / macOS Tahoe 26

At baseline, each object was authored from one baked `128-default` raster and
the 64/32/16 plus Dark/Clear files were deterministic derivatives. Final runtime
dispatch nevertheless selects the stored per-object, per-appearance tier:
16 px for compact system contexts, 32 px for ordinary contexts, 128 px for
desktop/large/Retina contexts, and 64 px where explicitly requested. It no
longer downsamples one 128-default file for every surface. Prompts that ask
ImageGen to paint glass, refraction, specular, and shadow into one flat source
are valid draft prompts, but they do not establish a layered source
architecture.

Finder now uses the approved Tahoe blue enclosure and separate translucent
face/profile construction. Its source architecture records independent
`base`, `panel`, and `ink` layers, recomposes them in that order, and does not
treat a baked glass master as the layer source. Finder is
`reference-validated`; Finder and the class-C MultiFinder composition own
directly constructed 128/64/32/16 optical assets for Default, Dark, and Clear.
This closes the two P0 cells without pretending the rest of the family is a
fully layered system. Review Desk and ClioTalk, described separately below,
are the only additional objects with independently drawn semantic layers; the
remaining 52 objects receive no such credit. Searcher is one of those 52: its Liquid Glass
cell remains on the prior broad runtime and retains `pending` status after its
16 px hierarchy failed promotion.
Tahoe 26 final screenshots control visual calibration when later Apple
documentation differs.

### Review Desk — five modern cells promoted

Before this pass, the row was effectively locked to an over-clean compound
proofing shorthand, including a page-plus-lens relationship that could collapse
into Searcher. Compact exports retained paragraph lines, paper texture, or
subpixel cues from the large source instead of deciding what a 16 px
proofreading application actually needed.

The final row keeps only two stable anchors: a marked manuscript and a visible
inspection or correction action. The five promoted runtime cells reinterpret
those anchors by era:

- Platinum: P-C, a crisp proofreader clipboard/application;
- Jaguar: P-B, an early-Aqua desk-like copy stand and marked sheet;
- Snow Leopard: P-B, a mature professional proofing board;
- Yosemite: P-B, a free-form shallow manuscript with a coral correction
  bracket, without a squircle or SF-symbol construction;
- Liquid Glass: P-B, a layered manuscript/correction object whose
  `backing`, `manuscript`, and `correction` canvases are independently drawn at
  128, 64, 32, and 16 px and recompose the Default runtime pixels exactly.

Every modern cell owns an era-specific 32 and 16 px optical redraw rather than
a mechanical reduction. All five are runtime assets and
`historically-reviewed`; none is `reference-validated`, a native replica, or an
exact-pixel claim. `blindMixStatus` remains `not-run`, so these conservative
expert visual passes must not be presented as an independent blind result. The
previously passing Classic Review Desk remains unchanged.

### Searcher — four modern cells promoted, Liquid Glass pending

The stable identity is search/discovery through a magnifying lens plus a
visible search relationship; a page behind the lens is not a frozen physical
metaphor. Platinum now uses a hard-pixel search utility, Jaguar a jewel-cobalt
lens with a result card, Snow Leopard a clear lens with an indexed ledger, and
Yosemite a free-form shallow lens with one result slip. Each owns independent
optical 32 and 16 px artwork and is P-B, `historically-reviewed`, non-native,
and `blindMixStatus: not-run`.

Liquid Glass receives no promotion credit. Its generated master clarifies the
result hierarchy at large size, but the true 16 px review collapses that
hierarchy. It therefore stays on the broad runtime family with
`historicalReviewStatus: pending` until both a compact redraw and auditable
semantic layers pass.

### ClioTalk

The product meaning is strong: user/model duality and a visible cue that model
output remains provisional. The exact two-balloon composition is not itself a
permanent anchor.

The baseline six-era board was continuous to the point of anachronism. Jaguar
and Snow Leopard still read like later messaging logos; at 16 px their dashed
provisional edge can collapse into noise or disappear. Platinum also still
needs a period-specific conversation/correspondence treatment.

Yosemite now uses a P-B free-form transcript sheet with two distinct
interlocutor marks and a separate model-owned provisional tab. Its 32 and 16 px
artwork is drawn optically rather than mechanically reduced. Liquid Glass now
uses a P-B glass conversation panel with independent `enclosure`, `panel`,
`conversation`, and `provisional` sources at 128/64/32/16, plus Default, Dark,
and Clear outputs. Both cells are `historically-reviewed` but neither claims a
native prototype, exact replica, reference validation, or completed blind mix.
The Platinum/Jaguar/Snow Leopard cells remain FAIL and pending.

### Toolbar and sidebar boundary

The ledgers say that application, toolbar, and sidebar/source-list art are
separate families. This audit did not prove that every runtime call site obeys
that boundary. No large application icon receives credit as compact toolbar art
merely because a browser can resize it.

## 16-core score matrix

Each cell is **A/B/C = Semantic Continuity / Era Authenticity / Family
Harmony**, each from 0 to 5. `PASS` requires all three values to be at least 4.
These are conservative expert evidence-review scores, not the results of a
human blind study. A score does not upgrade an asset's provenance or historical
status; reference validation must still be recorded independently.

In particular, a 4/4/4 visual `PASS` may coexist with a ledger value of
`historicalReviewStatus: pending`: the score records the reproducible expert
visual judgement in this audit, while the status records whether the evidence,
reference-comparison, and blind-mix closure has actually been completed.

| Core object | System 6 | Platinum | Jaguar | Snow Leopard | Yosemite | Liquid Glass |
| --- | --- | --- | --- | --- | --- | --- |
| Finder | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/5/4 PASS | 5/5/4 PASS | 5/4/4 PASS |
| MultiFinder | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Folder | 5/5/5 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Hard Disk | 5/5/5 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Trash | 5/5/5 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Document | 5/5/5 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| File Floppy | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Project Hard Disk (`projectDisk`) | 5/4/4 PASS | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL |
| Project CD (`projectDisc`) | 4/3/3 FAIL | 4/4/4 PASS | 4/4/4 PASS | 4/4/4 PASS | 4/4/4 PASS | 4/4/4 PASS |
| Searcher | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/3/3 FAIL |
| TeachText | 5/4/4 PASS | 5/4/4 PASS | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL |
| Scrapbook | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| ClioTalk (`assistant`) | 5/4/4 PASS | 5/3/3 FAIL | 5/2/3 FAIL | 5/2/3 FAIL | 5/4/4 PASS | 5/4/4 PASS |
| Control / Settings | 5/4/4 PASS | 5/4/4 PASS | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL |
| Review Desk | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| DocMap | 5/4/4 PASS | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL |

Result: **73 of 96 core era cells pass this expert review; 23 fail.** Finder,
MultiFinder, Folder, Hard Disk, Trash, Document, File Floppy, Scrapbook, and
Review Desk now clear the threshold in all six eras. The score increased by
exactly twenty-two cells: the five formerly failing post-Classic Finder cells,
all six formerly failing MultiFinder cells, the five promoted modern Review
Desk cells, four promoted Searcher cells from Platinum through Yosemite, and
the promoted Yosemite and Liquid Glass ClioTalk cells. No score for the
remaining 11 priority objects changed. The overall result remains
FAIL: Liquid Glass Searcher and the other failures below are still open.

## What betrays a modern redraw

The strongest 2026 tells in the remaining core are:

| Object/family | Betrayal | Required correction |
| --- | --- | --- |
| ClioTalk in Platinum/Jaguar/Snow | contemporary app-logo balloons or generic correspondence; dashed cue collapses at 16 | choose period communication/correspondence grammar and redraw the provisional cue optically |
| Liquid Glass Searcher | the large result hierarchy collapses into an unreadable 16 px reduction | author a true compact hierarchy and auditable Liquid Glass layers before promotion |
| Project Hard Disk | label/container remains too compositionally stable | begin from each era's volume prototype, then add one restrained project cue |
| DocMap | perfect branch/node geometry reads as a modern diagram icon | keep the document-structure identity but use era-native drawing irregularity and density |
| Jaguar family | shared cyan/gloss/perspective across object genres | restore genre-specific object, material, and perspective rules |
| Yosemite family | modern uniformity, later containers, or symbol-like strokes | restore 10.10 free-form object silhouettes and shallow object-owned depth |
| Liquid Glass family outside Finder, Review Desk, and ClioTalk | glass baked into a flat master | extend the auditable semantic-layer discipline object by object; do not generalise these three objects' status to the other 52 icons |

## Small-size artwork status

| Era | 32/16 status | Audit result |
| --- | --- | --- |
| Classic | Separate smooth SVGs are the chosen target; native-evidence anatomy remains visible at both sizes | PASS for Finder and class-C MultiFinder; remaining product-only glyphs still need object review |
| Platinum | Finder/MultiFinder are constructed directly for 42/32/16; Review Desk and Searcher own final 42/32/16 assets with independent optical 32/16 redraws | PASS for Finder/MultiFinder/Review Desk/Searcher optical tiers; full-family validation pending |
| Jaguar | Finder/MultiFinder are constructed directly for 128/32/16; Review Desk and Searcher own large 128 tiers plus independent optical 32/16 redraws; runtime dispatch uses 16 compact, 32 ordinary, and 128 desktop/large/Retina | PASS for Finder/MultiFinder/Review Desk/Searcher; the other compact tiers remain under review |
| Snow Leopard | Finder/MultiFinder are constructed directly for 512/128/32/16; Review Desk and Searcher own 512/128 large tiers plus texture-free optical 32/16 redraws; runtime dispatch uses 16/32/128 by context | PASS for Finder/MultiFinder/Review Desk/Searcher; large richness and compact optical work remain open for the other cores |
| Yosemite | Finder/MultiFinder are constructed directly for 128/64/32/16; Review Desk, Searcher, and ClioTalk own independent optical 32/16 redraws; runtime dispatch uses 16/32/128 by context | PASS for Finder/MultiFinder/Review Desk/Searcher/ClioTalk; other compact tiers remain under review |
| Liquid Glass | Finder/MultiFinder are constructed directly for 128/64/32/16 across appearances; Review Desk and ClioTalk independently draw semantic sources at all four tiers and verify exact Default recomposition; runtime dispatch uses 16/32/128 by context and 64 when requested | PASS for Finder/MultiFinder/Review Desk/ClioTalk; the other 52 icons remain without independently audited semantic-layer sources |

The most visible compact ClioTalk failure remains in Jaguar/Snow Leopard's
dashed provisional reply. Other high-risk cues are Liquid Glass Searcher's
result hierarchy, DocMap's branches,
writing instruments, and labels on Project Hard Disk.

## Era-native blind-mix review

The board protocol mixes eight current runtime assets with eight evidence-only
real references, applies a deterministic shuffle, hides names and provenance,
and asks a reviewer which additions look later. This is a valid review setup;
it is not a blind result until an independent reviewer records choices before
seeing the key.

No such independent review exists at this audit freeze. The following are
**unblinded expert risk predictions**, recorded so they cannot later be
misreported as blind findings:

| Era | Most likely later additions | Reason |
| --- | --- | --- |
| Classic | complex product-only compounds | smooth regularity and normalised proportions can depart from native System anatomy |
| Platinum | generated product utilities outside Finder/MultiFinder/Review Desk/Searcher | uniform lavender/keyline treatment and overly perfect geometry |
| Jaguar | TeachText, ClioTalk, DocMap | cyan convergence, shared gloss, and weak genre separation |
| Snow Leopard | the remaining compound product icons | derivative sizes and insufficient object-specific material richness |
| Yosemite | DocMap and other unreviewed product utilities | later-macOS symbol/container cues and uniform graphic cleanliness |
| Liquid Glass | baked cores outside the approved Finder, Review Desk, and ClioTalk lineages | flat painted glass rather than auditable semantic layers and appearance rendering |

Required next result: at least one reviewer who did not build the boards must
submit anonymous sample numbers and confidence before receiving the provenance
key. Until then the blind-mix gate is **NOT RUN**.

## Intentional anachronism

`fileFloppy` is the only approved intentional anachronism in the 16-core set:

```json
{
  "id": "fileFloppy",
  "intentionalAnachronism": true,
  "reason": "File Floppy is a stable product-level metaphor for temporary context."
}
```

In later eras it must read as that era's deliberate redraw of a floppy, not as
a claim that floppy disks were still the standard system removable medium.
Project CD is not granted the same blanket exception; its medium must remain
credible for the target era or be documented as an archival/export choice.

## Before/after and review artifacts

All Apple/reference pixels in these boards are evidence-only. Only regenerated
runtime rows that resolve from `apps/desktop/assets/themes/<era>/icons/` may be
cited as current.

| Artifact | Purpose | Status at audit document freeze |
| --- | --- | --- |
| `internal/evidence/drafts/finder-multifinder-era-redraw/finder-multifinder-six-era-review-board.png` | baseline Finder/MultiFinder failure comparison | Present; evidence-only diagnostic, not an accepted before state |
| `internal/evidence/drafts/clio-talk-era-redraw/clio-talk-six-era-review-board.png` | six-era ClioTalk continuity inspection | Present; proves over-fixed composition and compact risk |
| `internal/evidence/drafts/era-icons/icon-continuity-board.png` | legacy full-family continuity board | Present; evidence-only before state |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-finder-lineage-candidates.png` | rejected first-generation candidate sheet | Present; negative authoring evidence only, never historical evidence or runtime proof |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-candidates-v2/` | approved and rejected v2 authoring-candidate workspaces by object | Present; candidate acceptance and historical status remain separate |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-candidates-v2/review-desk/` | five Review Desk masters, exact prompts/provenance, and the large/true-16 light/dark candidate board | Present; P-C Platinum and P-B modern authoring direction, with no native-artwork claim |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-candidates-v2/searcher/searcher-v2-runtime-optical-board.png` | promoted Platinum/Jaguar/Snow Leopard/Yosemite Searcher runtime tiers at true 32/16 | Present; four P-B reinterpretations pass compact review, while Liquid Glass remains excluded |
| `apps/desktop/assets/themes/liquid-glass/icons/src/priority-lineage-layers/reviewDesk-<size>-<layer>.png` | Review Desk `backing`/`manuscript`/`correction` source architecture at 128/64/32/16 | Present; all twelve sources are independently drawn and exact Default recomposition is test-gated |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-candidates-v2/cliotalk/clio-talk-v3-small-size-review.png` | ImageGen v3 ClioTalk candidate and compact comparison | Present; Yosemite/Liquid pass authoring review, while Jaguar/Snow remain rejected evidence |
| `apps/desktop/assets/themes/liquid-glass/icons/src/priority-lineage-layers/assistant-<size>-<layer>.png` | ClioTalk `enclosure`/`panel`/`conversation`/`provisional` architecture at 128/64/32/16 | Present; all sixteen sources are independently drawn and exact Default recomposition is test-gated |
| `tooling/build-approved-priority-lineage.mjs`; `tests/features/approved-priority-lineage.test.mjs` | final Review Desk, admitted Searcher, and admitted ClioTalk runtime ownership, provenance rebuild, hash/compact/distinction/layer checks | Present; focused feature verification passes |
| `internal/evidence/drafts/icon-lineage-audit/finder-lineage-approved-runtime-vs-evidence.png` | approved modern Finder/MultiFinder runtime, target-era evidence, and optical tiers | Present; current P0 acceptance board |
| `internal/evidence/drafts/icon-lineage-audit/cross-era-current-runtime.png` | 16 cores × 6 current runtime families | Present; rebuilt from final runtime mappings |
| `internal/evidence/drafts/icon-lineage-audit/family-<era>-current-runtime.png` | six 16-core era-family boards | Present; all six resolve final runtime pixels |
| `internal/evidence/drafts/icon-lineage-audit/finder-lineage-current-runtime-vs-evidence-only.png` | current Finder over real local references | Present; shows the corrected six-era identity sequence |
| `internal/evidence/drafts/icon-lineage-audit/blind-mix-<era>-evidence-only.png` | anonymous 8+8 mix protocol | Present; no independent human result implied |
| `internal/evidence/drafts/icon-lineage-audit/before-after-full-current-runtime.png` | baseline core rows versus current runtime | Present; rebuilt after accepted Finder, Review Desk, four-era Searcher, and two-era ClioTalk runtime changes without upgrading other cores |
| `internal/evidence/drafts/icon-lineage-audit/before-after-finder-current-runtime.png` | Finder diagnostic comparison | Present; current runtime after state plus evidence-only comparison |

The board builder uses the maintainer's existing historical-evidence cache from
the source workspace as a controlled **read-only fallback**, because those
ignored research files are not materialised inside every linked worktree. It
writes only review boards into this worktree. No fallback reference file is
copied into an icon directory, manifest, package, or runtime asset.

The key before/after changes are conceptual as well as visual:

| Before | After / required state |
| --- | --- |
| physical metaphor locked across all eras | one or two identity anchors; target-OS prototype may change the composition |
| post-Classic Finder as a compact Mac | each era now follows its own Finder prototype; Tahoe owns separate `base`, `panel`, and `ink` sources |
| Review Desk as one page-plus-lens compound with mechanically reduced detail | marked manuscript plus correction action reinterpreted per era; optical 32/16 redraws, with Tahoe `backing`/`manuscript`/`correction` sources |
| Searcher as one page-plus-lens composition with material swaps | Platinum through Yosemite now use distinct era genres and optical 32/16 paintings; Liquid Glass remains pending instead of inheriting credit |
| ClioTalk as one solid/dashed two-balloon logo | Yosemite uses a free-form transcript sheet; Tahoe uses a layered conversation panel; Platinum/Jaguar/Snow remain pending rather than inheriting credit |
| Classic smoothing could erase native anatomy | Retina SVG remains smooth, but native-evidence anatomy controls the redraw |
| `accepted-generated` sounded historical | authoring, technical, historical, and runtime states are orthogonal |
| compact tiers treated as export presets | direct optical sizes credited only where they actually exist |
| Liquid Glass material baked into one master | Finder, Review Desk, and ClioTalk now have independently audited semantic-layer sources; only those individually converted objects receive layered-source credit |

## Documentation/runtime consistency

Every final ledger entry must answer all of these without inference:

1. How was the asset authored?
2. Does a direct historical prototype exist? If not, what is the nearest analog?
3. Which source or local reference was used?
4. Which sizes are independently drawn and which are derivatives?
5. Was a real blind-mix review run?
6. Was it compared to a reference, or only technically checked?
7. Is it selected by runtime, review-only, or evidence-only?

At baseline, the answers drifted:

- the continuity ledger locked Finder and ClioTalk compositions too tightly;
- `era-icon-reference.json` described reviewed cores while later generated
  overlays could replace those pixels;
- Aqua, Snow Leopard, and Yosemite READMEs honestly called sizes derivatives,
  while other ledger language could sound like native-size acceptance;
- Platinum and the ImageGen run ledger conflated accepted source art with
  historical completion;
- Liquid Glass documented a layer model in a core ledger while the complete
  runtime family still selected baked generated masters.

The audit is consistent only when the final build order, manifests, family
entries, README text, and the pixels shown on current-runtime boards all agree.
The rejected first-generation Finder/MultiFinder overlay receives no status
credit; only the approved v2 redraws selected by the final runtime overlay may
appear as accepted pixels in boards and ledgers. Review Desk, the four admitted
Searcher cells, and the two admitted ClioTalk cells follow the same final-owner
rule through the separate priority-lineage overlay; their broad generated archive remains preserved as
archive provenance rather than claiming the final runtime pixels.

## Historical references and copyright boundary

| Era | Local controlling evidence | External citation |
| --- | --- | --- |
| Classic | `.claude/skills/system6-ui-review/assets/System 6.0.8 - System Startup.img`; `internal/evidence/drafts/era-icons/classic-core-reference-board.png`; System resource ledger/build inputs | [Infinite Mac source repository](https://github.com/mihaip/infinite-mac); bundled image SHA-256 `d1129d50e08064124ecba7423544f753650ceb2b064a3e447f86ef5ce3d6fba2` |
| Platinum | `internal/evidence/drafts/theme-lab-fidelity-cache/platinum/`; `internal/evidence/drafts/era-icons/platinum-core-reference-board.png` | [GUIdebook Mac OS 9.0](https://guidebookgallery.org/screenshots/macos90); [Inside Macintosh Finder icon-family plate](https://dev.os9.ca/techpubs/mac/Toolbox/graphics/FI-SL-01.jpg) |
| Jaguar | `internal/evidence/drafts/theme-lab-fidelity-cache/aqua/guidebook-desktop-full.png`; `.../aqua/icons/` | [GUIdebook Mac OS X 10.2](https://guidebookgallery.org/screenshots/macosx102); [512 Pixels Jaguar library](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-2-jaguar/) |
| Snow Leopard | `internal/evidence/drafts/snow-leopard-icon-reference/captures/`; `.../iconsets/FinderIcon.iconset/icon_128x128.png` | [Snow Leopard-era icon HIG mirror](https://leopard-adc.pepas.com/documentation/UserExperience/Conceptual/AppleHIGuidelines/XHIGIcons/XHIGIcons.html); [512 Pixels Snow Leopard library](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-6-snow-leopard/) |
| Yosemite | `internal/evidence/drafts/yosemite-icon-reference/web/`; `internal/evidence/drafts/theme-lab-fidelity-cache/yosemite/` | [512 Pixels Yosemite library](https://512pixels.net/projects/aqua-screenshot-library/os-x-10-10-yosemite/) |
| Liquid Glass | `internal/evidence/drafts/liquid-glass-reference/captures/512pixels/`; `.../captures/macworld-21-icons/`; local WWDC transcript cache | [Apple app-icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons/); [Apple Icon Composer](https://developer.apple.com/icon-composer/) |

Historical screenshots, extracted resources, and Apple artwork are local review
evidence only. Runtime assets are independent project redraws/adaptations, not
redistributed reference pixels.

## Explicit failures and remaining work

The following are **not passed**:

1. Twenty-three of the 96 core era cells score below 4/4/4.
2. Project Hard Disk, Project CD in Classic, Liquid Glass Searcher, TeachText after Platinum,
   ClioTalk in Platinum/Jaguar/Snow Leopard, modern Control/Settings, and DocMap need era-specific
   redraw/review work.
3. Platinum/Jaguar/Snow Leopard ClioTalk's 16 px provisional cue is not reliably legible.
4. Outside Finder/MultiFinder/Review Desk, admitted Searcher cells, and admitted ClioTalk cells, most Jaguar, Snow Leopard, Yosemite,
   and Liquid Glass compact tiers are still derivatives rather than accepted
   optical artwork.
5. Outside Finder/MultiFinder/Review Desk, admitted Searcher, and admitted ClioTalk, Snow Leopard's 512 tiers are not
   proven richer masters.
6. Liquid Glass is not a fully layered 56-object system. Finder has accepted
   `base`/`panel`/`ink` sources; Review Desk has accepted
   `backing`/`manuscript`/`correction` sources at all four optical tiers;
   ClioTalk has accepted `enclosure`/`panel`/`conversation`/`provisional`
   sources at all four tiers; MultiFinder is an accepted class-C composition,
   while the other 52 objects
   receive no independently audited layered-source credit.
7. Platinum's full generated family has not completed object-by-object
   historical comparison.
8. No independent human blind-mix result exists.
9. Runtime use of separate application, toolbar, and sidebar/source-list
    families has not been exhaustively traced.
10. The remaining 40 semantic objects have runtime coverage but **240 pending
    lineage reviews** (40 objects × 6 eras). They must not inherit the core's
    score or status.
11. The rebuilt cross-era and era-family boards cover the priority 16. A
    complete 56-object era-board review and per-modified-icon before/after
    ledger are not yet complete; the core boards must not be presented as that
    broader deliverable.

The next work order is semantic identity → prototype/analog → genre → silhouette
→ perspective → optical bounds → material → lighting → palette → shadow →
detail density → compact hinting. Micro-pixel or colour polish does not start
until the earlier decisions are correct.

The audit closes only when both questions can be answered “yes” without
qualification: does each column belong to its real Mac era, and does each row
read as the same product naturally redrawn over forty years?
