# ClioWorks upstream adoption

One row per upstream. "Vendored" means source lives in this repo; "reference answer only" means the upstream is read to write acceptance tests, and no code or WASM is copied.

| Upstream | Licence | Status |
| --- | --- | --- |
| VibeOffice | Apache-2.0 | Vendored, deviations listed below. Pin `32ff53a5da0e75ebac11acdb0251cd3d8c7bf408` (release v2026.10.18-32ff53). Lives in `apps/desktop/app/vendor/vibeoffice/{common,quire,ledger,lectern}`. |
| GenOffice | see upstream | No source vendored. Its audit adapter is our own. |
| wordcraft | see upstream | Reference answer only. Behaviour becomes acceptance tests, no code vendored, no WASM. |
| gridcraft | MIT OR Apache-2.0 (Copyright (c) 2026 ArtCraft Team and the GridCraft contributors) | Pure worksheet functions are ported in batches (owner ruling 2026-10-31, overturning "no upstream code" for this); each batch has an entry under "gridcraft function batches". Everything else stays reference answer only, no WASM. The calc engine is not replaced. |
| deckcraft | see upstream | Reference answer only. Behaviour becomes acceptance tests, no code vendored, no WASM. |
| pdfcraft | see upstream | Reference answer only. Behaviour becomes acceptance tests, no code vendored, no WASM. |
| photocraft | see upstream | Reference answer only. Behaviour becomes acceptance tests, no code vendored, no WASM. |
| vectorcraft | see upstream | Reference answer only. Behaviour becomes acceptance tests, no code vendored, no WASM. |
| lightcraft | see upstream | Reference answer only. Behaviour becomes acceptance tests, no code vendored, no WASM. |
| artcraft | MIT OR Apache-2.0 (relicensed 2026-10-10) | Reference answer only. Behaviour becomes acceptance tests, no code vendored, no WASM. |
| pdfjs-dist (pdf.js) | Apache-2.0 | Installed 6.3.289 (npm dependency, not vendored). The **legacy** build (`legacy/build/pdf.min.mjs`, `pdf.worker.min.mjs`: Safari >= 18, Chrome >= 125) is what `/app/vendor/pdf.min.js` and `pdf.worker.min.js` serve and the web release copies (owner ruling SUITE-1, 2026-10-24); the default build is not shipped. `cmaps/` (~1.6 MB) and `standard_fonts/` (~0.8 MB) ship with the release at `/app/vendor/pdfjs-cmaps/` and `/app/vendor/pdfjs-standard-fonts/`, fetched one file at a time on demand, never in the boot floppy (owner ruling SUITE-3, 2026-10-24). Used by Reader's original-page view (N1) and the public-web PDF import; the server importer already used the legacy build. |
| @cantoo/pdf-lib | MIT | Vendored 2.11.1: the single UMD build at `apps/desktop/app/vendor/pdf-lib/pdf-lib.min.js` (sha256 `2294a0bb8742d8948ae2d49a60cb6a3600c0b5deae6de198e57fb368d1b79ba9`, 616,746 bytes) with its `LICENSE`, loaded on demand only when Reader's 整理页面 mode or a table extraction runs (owner ruling SUITE-2, 2026-10-24, page operations). Never an npm dependency; fetched with `npm pack` and copied, not installed. Saves are incremental updates (`forIncrementalUpdate` + `save`): the original bytes stay a prefix and only the changed page tree and pages are appended, so a deleted page's objects remain in the original section. A page move detaches the leaf through `catalog.removeLeafNode` because `removePage` also deletes the page object. The prefix is measured on every save; if it ever fails, the original is kept as a backup. |

## VibeOffice deviations

Paths are under `apps/desktop/app/vendor/vibeoffice/`. Everything else is upstream byte for byte. Line numbers are for the current pin.

| Where | Why |
| --- | --- |
| `common/opc.js:1063` `auditCarry()` | Added: lists opaque parts a save would orphan and whether they can be carried. Read-only, used by the adapter's inspect(). |
| `common/opc.js:1180` | An opaque part nothing regenerated still refers to is carried, not dropped. Silent loss of unknown content is not allowed. A malformed graph still fails closed and is reported. |
| `quire/docx-write.js:647` | Re-emit the captured `w:latentStyles` verbatim. |
| `quire/docx-write.js:663` | Re-emit the captured `unhideWhenUsed` flag. |
| `quire/docx-read.js:408` | Keep `unhideWhenUsed` so the writer does not drop it. |
| `quire/docx-read.js:481` | Keep the original `w:latentStyles` raw XML. |
| `quire/docx-read.js:676` | Prefer the suite's portable XML serializer when present. |
| `lectern/pptx-read.js:10` | Prefer the shared portable `xmlTree` parser when present. |
| `lectern/comments.js:57` | Local addition (ClioWorks M2-A): add and reply to comments, kept on the slide as data and written at save. Existing comment parts stay byte for byte. Not marked "deviation" in the source. |
| `common/zip.js:211` `entry.raw()` (and `cen`, the central record offset, passed by `readCentral`) | Added for part preservation: an entry's local record (header, data, data descriptor) and central record as stored, or null when it cannot be copied safely (repair path, encrypted, zip64). |
| `common/zip.js:357` `write()` | A file given as `{ raw }` is copied byte for byte; only its central record's offset moves. Other files are written as upstream does. |
| `common/zip.js:424` `preserveUntouched()`, `:515` `consistent()`, `:615` `idleBaseline()` | Added: after an edit, a part-level three-way merge of the original file, the writer's output for the unedited model (the baseline, written once per document in idle time after open, or at open where there is no frame loop; a save before it is ready saves as before) and its output for the edited model. A part the two writes agree on keeps the original stored bytes, or stays absent or present as in the original; only parts whose written bytes moved come from the writer. The merged package is used only if `consistent()` finds the cross-part references between kept and written parts intact: relationships the owner names, content types, and the identities parts refer to across parts (comment, note, list, style, number-format, sheet, author and slide ids; positional shared strings and cell formats; comment paragraph ids); otherwise the plain writer output stands. On the R1 corpus its decision equals a full codec re-read-and-rewrite check on all 24 edited files. An edit that ends where it started returns the original file. The three adapters (`clioworks-v3/{quire,ledger,lectern}-adapter.js`) call it from `encodeCurrent`. A `patch` hook may change a kept part minimally: the Ledger adapter adds `fullCalcOnLoad="1"` to a kept `xl/workbook.xml` while a formula is saved without its cached result, as the writer always does. The Quire writer keeps each comment's original `w:id` (see the `quire/docx-write.js` `cmtId` row), so a document with gaps in its comment ids merges like any other. |
| `lectern/pptx-read.js` `transitionFrom()` | Added (ClioStage motion): the Markup Compatibility pass keeps only the Fallback transition, which carries no `p14:dur`; the duration is read from the captured original (`K.alternate(tr).xml`). Without it a saved duration read back as the speed word's default. |
| `lectern/pptx-write.js` `transitionXML()` | Added (ClioStage motion): a transition whose explicit duration differs from its speed word's default is written as PowerPoint writes it, `mc:AlternateContent` with `p14:dur` in the Choice and the plain element as Fallback. Contract: `tests/features/clioworks-stage-motion.test.mjs`. |
| `quire/docx-write.js:961` `cmtId` | Added (N2c): keep each comment's original numeric `w:id` instead of renumbering densely; a comment whose id is not numeric takes the next id above the largest numeric one. Replies and `commentsExtended` / `commentsIds` paraId links then still match the original file, and a gappy document (D20: 0, 3, 7, 9) now merges with part preservation. Not marked "deviation" in the source. Contract: `tests/features/clioworks-n2c-headerfooter.test.mjs`. |
| `common/zip.js:14` | Added at the repin: English fall-through `L.t` / `L.N`. Upstream defines them in `common/i18n.js` (not vendored), but vendored files now call them, some while loading. |
| `common/core.js:698` | Added at the repin: read the page language only when the host document has `getAttribute` (bare test documents do not). A browser takes the upstream branch. |
| `ledger/xlsx-write.js:46` | Lone-surrogate escaping without a regex lookbehind, because WebKit before 16.4 (macOS 12) fails to parse it. Not marked "deviation" in the source. |
| `quire/render.js:21` | Added at N2a (owner ruling SUITE-6, 2026-10-24): Chinese entries in the per-font line-height table (宋体/SimSun 1.1406, 宋体-简/Songti SC and 苹方-简/PingFang SC 1.4, 思源宋体/Source Han Serif SC with Noto Serif CJK SC/Noto Serif SC 1.437), so when a document's Chinese font is missing and a substitute draws it, the line height stays pinned to the font the DOCUMENT names instead of inflating by the substitute's metrics. Values are hhea ascender−descender+lineGap over unitsPerEm: Songti.ttc and PingFangSC-\*.otf measured on the build machine; SimSun and Source Han Serif from the owner ruling (`internal/plans/CLIOWORKS-SUITE-SPEC.zh-CN.md`, the N2 row and SUITE-6) — this machine has no font file for them. Fonts with no file to measure (SimHei, FangSong/仿宋_GB2312, KaiTi/楷体_GB2312, Microsoft YaHei, DengXian, 方正小标宋简体) keep the upstream 1.17 default. Contract: `tests/features/clioworks-n2a-cjk-line-height.test.mjs`. |
| `quire/render.js:49` `fontSubstitutions()` | Added at N2a (data for N12's Get Info / print preview substitution note, owned by another lane): a pure function over the document model listing the fonts it names that this machine cannot draw itself, the family that draws each, and the line factor pinned to the requested name. The availability check is injectable (`available`: a family predicate or Set/array) so Node tests run it without a browser; without it, the browser path is `L.fontStandIn`, and where no check exists (the bare fixture vm) it reports no substitution rather than guessing. Contract: `tests/features/clioworks-n2a-cjk-line-height.test.mjs`. |
| `L.ops.shiftRange` (runtime, from `clioworks-v3/ledger-structure.js`) | Added at N5a: upstream keeps its range shifter in `ledger/ops.js`, which is not vendored, yet `ledger/tables.js` calls `L.ops.shiftRange` when a table's ref moved with a structural edit. The structure module fills that one entry, only if absent; no other `L.ops` member is defined. Pivot tables and slicers are not shifted (owner decision); the writer is told before the change and in the first-save list. |

Added file: `quire/portions.js` is new upstream (Apache-2.0, derived from Apache OpenOffice) and `render.js` calls `R.lineBoxes` from it, so it is vendored unchanged and loaded right after `render.js` in `quire-adapter.js`.

Host side, not vendored: the editing layer now starts every press with `L.ui.drag` (upstream `common/ui.js`, not vendored). `quire-adapter.js` exports a small `dragHost` (drag, dragCancel, dragging) and `features/clio-write.js` puts it into its `L.ui`.

## 2026-10-28：VibeOffice 重钉版随附的 zip.js 头注释为公开发布净化一行

上游 puff.c 的 zlib 许可注释在版权行下带作者联系邮箱（zlib 上游的公共信用行）。
公开发布快照的维护者信息扫描会拦下它。处置：删除邮箱、保留「Mark Adler」署名与
完整版权行（zlib 第 3 条要求的 notice 未动）。这是发布净化的机械改动，不改任何
代码行为；上游原文件在私有仓库未动。需作者知悉（vendor 改动按约应经批准）。

## gridcraft function batches

Owner ruling 2026-10-31: porting pure functions from the upstream gridcraft (MIT OR Apache-2.0) is allowed, in batches, each recorded here with its licence notice. The evaluator stays the vendored VibeOffice one (`vibeoffice/ledger/calc.js`); a batch only registers functions into its table. Ported code lives in `apps/desktop/app/vendor/clioworks-v3/` (not under `vibeoffice/`, so the VibeOffice byte-for-byte rule is untouched) and loads lazily at the end of `CALC_MODULES` in `ledger-adapter.js`: no boot bytes. Contract: `tests/features/clioworks-g1-function-coverage.test.mjs` (formula, expected value, tolerance, source per row; a red row blocks the batch).

Licence notice carried in each ported file: GridCraft, Copyright (c) 2026 ArtCraft Team and the GridCraft contributors, MIT License or Apache License 2.0 at the user's option (upstream `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`).

### Batch 1 (2026-10-31): statistics and finance functions the evaluator lacked

Upstream: https://github.com/storytold/gridcraft, commit `75f7056e1b96f7ce30f402310221ca1a6d083a17` (2026-10-30).

Finding that shaped the batch: the audit's count of 362 was `def('...')` calls; the evaluator's real table has 519 names, so every Excel statistics and finance function already existed except those below, which were registered as keep-the-saved-value stubs (or absent). Batch 1 is therefore exactly those.

| Ported file (new) | Upstream source | Functions | Changed |
| --- | --- | --- | --- |
| `clioworks-v3/ledger-fn-batch1.js` | `crates/functions/src/financial/securities.rs` (`odd_first`, `odd_last`, `oddfprice`, `oddfyield`, `oddlprice`, `oddlyield`) | ODDFPRICE, ODDFYIELD, ODDLPRICE, ODDLYIELD | Arithmetic and bracketing/bisection kept; dates and day counts use the evaluator's `numfmt` and `C.days360`; the coupon count is derived by walking quasi-periods from maturity rather than upstream's `coupons()`. |
| same | `crates/functions/src/financial.rs` (`EURO_RATES`, `euroconvert`) | EUROCONVERT | Rate table and rounding rules kept; the saved-value stub is replaced. Rounding to the target's decimals is half away from zero on the scaled value. |
| same | `crates/functions/src/math.rs` (`percentof`) | PERCENTOF | Sums use the evaluator's `C.nums`. |
| same | `crates/functions/src/ets.rs` (series building, axis detection, seasonality detection, initial states, filter, Nelder-Mead fit, forecast, forecast SD) | FORECAST.ETS, FORECAST.ETS.CONFINT, FORECAST.ETS.SEASONALITY, FORECAST.ETS.STAT | Translated function by function; the Forecast Sheet `Timeline` helper is not ported. Norm quantile comes from the evaluator (`C.special.normInv`). |

Differences from Excel, all inherited from upstream and stated there: Excel's ETS optimiser is undocumented, so fitted alpha/beta/gamma and the last digits of a forecast on noisy data can differ from Excel; the contract asserts only exact data (straight lines, exactly repeating seasons) and the documented errors. Documented examples for ODDF*/ODDL*/EUROCONVERT match Microsoft's printed values at the digits printed.

Still stubs after batch 1 (no data to compute from, or cloud/native): GETPIVOTDATA, the CUBE functions, WEBSERVICE, FILTERXML, RTD, STOCKHISTORY, CALL, REGISTER.ID, SQL.REQUEST, IMAGE, TRANSLATE, DETECTLANGUAGE, COPILOT, PY. Not yet existing: TRIMRANGE.

### Batch 2 (2026-10-31): REGEX*, GROUPBY, PIVOTBY

Upstream: same commit `75f7056e1b96f7ce30f402310221ca1a6d083a17`. Per the owner's "features first" direction the contract keeps a few representative rows per function.

| Ported file (new) | Upstream source | Functions | Changed |
| --- | --- | --- | --- |
| `clioworks-v3/ledger-fn-batch2.js` | `crates/functions/src/text.rs` (`regextest`, `regexextract`, `regexreplace`, `template`, `convert_replacement`) | REGEXTEST, REGEXEXTRACT, REGEXREPLACE | The pattern runs on the JavaScript `RegExp` engine (flags `gu`, plus `i` for case-insensitive), not Rust's `regex` crate: Rust-only syntax (for example inline flag groups, `\p{..}` classes with Rust names) is #VALUE! or behaves differently. Replacement templates (`$1`, `${name}`, `$$`) follow upstream. |
| same | `crates/functions/src/dynamic.rs` (`parse_agg`, `aggregate`, `prepare`, `distinct_keys`, `groupby`, `pivotby`) | GROUPBY, PIVOTBY | Layout, headers, totals, sorting and filtering as upstream. The function argument is read lazily so a bare `SUM`, a name string, a code number or a LAMBDA all work (upstream uses a host special form for the LAMBDA). The `relative_to` argument of PIVOTBY is accepted by upstream and ignored; here it is not accepted past the tenth argument. |

No spill-semantics change: both return a plain array. Known and unchanged: the evaluator's existing spill writes a blank result cell as 0 (Excel leaves it empty), and a one-column array spilled into a wider array formula range repeats across the columns instead of giving #N/A. Not ported: TRIMRANGE.
