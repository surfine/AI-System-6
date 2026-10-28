# ClioWorks upstream adoption

One row per upstream. "Vendored" means source lives in this repo; "reference answer only" means the upstream is read to write acceptance tests, and no code or WASM is copied.

| Upstream | Licence | Status |
| --- | --- | --- |
| VibeOffice | Apache-2.0 | Vendored, deviations listed below. Pin `32ff53a5da0e75ebac11acdb0251cd3d8c7bf408` (release v2026.10.18-32ff53). Lives in `apps/desktop/app/vendor/vibeoffice/{common,quire,ledger,lectern}`. |
| GenOffice | see upstream | No source vendored. Its audit adapter is our own. |
| wordcraft | see upstream | Reference answer only. Behaviour becomes acceptance tests, no code vendored, no WASM. |
| gridcraft | see upstream | Reference answer only. Behaviour becomes acceptance tests, no code vendored, no WASM. |
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
| `common/zip.js:424` `preserveUntouched()`, `:515` `consistent()`, `:615` `idleBaseline()` | Added: after an edit, a part-level three-way merge of the original file, the writer's output for the unedited model (the baseline, written once per document in idle time after open, or at open where there is no frame loop; a save before it is ready saves as before) and its output for the edited model. A part the two writes agree on keeps the original stored bytes, or stays absent or present as in the original; only parts whose written bytes moved come from the writer. The merged package is used only if `consistent()` finds the cross-part references between kept and written parts intact: relationships the owner names, content types, and the identities parts refer to across parts (comment, note, list, style, number-format, sheet, author and slide ids; positional shared strings and cell formats; comment paragraph ids); otherwise the plain writer output stands. On the R1 corpus its decision equals a full codec re-read-and-rewrite check on all 24 edited files. An edit that ends where it started returns the original file. The three adapters (`clioworks-v3/{quire,ledger,lectern}-adapter.js`) call it from `encodeCurrent`. A `patch` hook may change a kept part minimally: the Ledger adapter adds `fullCalcOnLoad="1"` to a kept `xl/workbook.xml` while a formula is saved without its cached result, as the writer always does. Known limit: the Quire writer renumbers comment ids densely (0,1,2,4 becomes 0,1,2,3), so a document with gaps in its comment ids is written whole. |
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
