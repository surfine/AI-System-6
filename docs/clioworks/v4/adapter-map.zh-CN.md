<!-- canonical-source: docs/clioworks/v4/adapter-map.md -->
<!-- source-sha256: 39499e84808e7c7d8ab04db9319bd1f9abd5a4ece3694aa5436821e1f40083c7 -->

> 英文版为准。本文档仅供人类参考。

# ClioWorks v4 — V4-00 實際工作區映射與差異

日期：2026-10-10。狀態：V4-00 交付物（對應 `contracts/tasks.json` V4-00
`integrationOwnership`）。本文件只做差異與介面映射，不重審 v3 已通過的
主題/屏幕，不作為 v4 任何新設計的批准（設計審批仍 `pending_review`）。

依據：`ClioWorks-Creator-Integration-v4.zip`（00-EXECUTOR-PROMPT、
01-CREATOR-INTEGRATION-SPEC、docs/、contracts/）。執行者決策（2026-10-10，
Aaron）：依 tasks.json 全推 V4-00→V4-11；五上游已 clone 並釘版；工作在目前
分支工作樹上直接進行，不開新分支、不 reset。

## 一、實際 HEAD、分支與研究基線的關係

| 項 | 值 |
| --- | --- |
| 工作區 | `the executor workspace` |
| 實際 HEAD | `f2809c2f7f16331364b2fff10aee2058164f762f`（2026-10-10 10:11，`feat(clioworks): ClioWorks v3 interaction kit native integration`） |
| 前一提交 | `0e111644c`（2026-10-10 07:13，macOS 27 修復，1.0.57 發行線） |
| 研究基線 `478d6c49…` | **不在本地歷史**（公開 main 快照，未 fetch；執行者本地 v3 線未與其對齊）。v4 不以它為 reset 目標，只以本地 HEAD 為基線。 |
| 未提交路徑 | `.zcodeignore`、`internal/evidence/drafts/site-copy-20261010/`、`site-zh-typography-20261010/`、`internal/media/`、`internal/skills/`、`tooling/promo-catalog.py` — 全部與 ClioWorks 無關，v4 保留不碰。 |
| 上游存放 | `external/clioworks-upstreams/`（`external/` 已在 `.gitignore` 第 76 行，不進主倉追蹤） |

## 二、上游鎖與可用驗證環境

`contracts/upstreams.lock.json` 五倉已 clone 並 checkout 到鎖定提交
（逐一 `rev-parse HEAD` 核對，全部 PINNED OK，提交日期均 2026-10-09）：

| 上游 | 鎖定提交 | 角色（spec §9） | 構建前提 |
| --- | --- | --- | --- |
| VibeOffice | `4c011173838de5d65e8ea0407684ba820a277273` | Quire/Ledger/Lectern 原生編輯 + OPC 保留式寫入 | 純 Web（public/ + tools/），無 Cargo；LOSSLESS_SAVE.md 已知靜默丟失待修/阻斷 |
| wordcraft | `a1caf22a0b4faa4675a2d6dbcc24e0516b300e30` | 支持文稿排版、共享 PDF 佈局（crates/layout） | Rust workspace，edition 2024；`cargo check -p wordcraft-layout --target wasm32-unknown-unknown` 通過 |
| gridcraft | `13664fe66b952e7abcd68e2371c1d4f34f990dac` | 已選工作簿實際重算（crates/calc） | 同上 `gridcraft-calc` check 通過；`apps/gridcraft-web` 經 Trunk 完整 build 出 wasm |
| deckcraft | `84acb49895c8190396b686c1eb9f20c730e48633` | 支持子集放映邏輯（crates/anim） | 同上 `deckcraft-anim` check 通過 |
| pdfcraft | `fb46909e3f034b61a1b420333e508f7d172d4027` | 頁面與批注修改（organize） | Rust workspace，version 0.5.0；`pdfcraft-organize` check 通過；v3 簽核標 PdfCraft `not_start` |

## 二之一、Rust/WASM 工具鏈（2026-10-10 裝設）

透過官方 rustup 安裝（`/tmp/rustup-init.sh` sha256
`7d0ea0f8eba7fa1ebfe998091cd7ec4501e33ec5ca6b884eb4d894d7da5170af`）：

- `rustc 1.99.0 (b940084d7 2026-09-28)`、`cargo 1.99.0`、rustup 1.29.1，
  aarch64-apple-darwin；`rustup target add wasm32-unknown-unknown` 已加。
- `trunk 0.21.14`、`wasm-bindgen-cli 0.2.129`（`cargo install --locked`）。
- 版本相容性：`--edition=2024` 空 crate 編譯通過。
- WASM 檢查全過（exit 0）：
  `cargo check -p {gridcraft-calc, wordcraft-layout, deckcraft-anim,
  pdfcraft-organize} --target wasm32-unknown-unknown`。
- GridCraft 完整前端鏈實證：`apps/gridcraft-web` 以 Trunk release 建出
  `dist/web/gridcraft-web-f1287856b890d146_bg.wasm`（14,723,813 B，sha256
  `e87d95814668d24649b857bd2dd8a0e05f41afa994bcda883ea82b5203443473`）
  與同名 JS loader（wasm-bindgen），wasm-opt 套用成功。
  → 「Rust 工具鏈缺失」不再是 v4 阻塞項。

環境缺口（記入 not_run，不阻塞 V4-01 之前的主倉側工作）：

- 無 Microsoft Office → INTEROPERABILITY §9 的 Office 驗收項保持 not_run。
- v4 包 `npm test`/`test:format`/`check_browser` 已在包側通過（57/21/22），
  但主倉接線、真實 IDB 事務、Office、Safari/IME 均未驗。

## 三、v3 現狀（只核對接線點，不重審）

v3 整合在 HEAD `f2809c2f7`，全部整合碼僅在 fixture 路徑
（`?fixture=clioworks-v3`）可達：

- `apps/desktop/app/vendor/clioworks-v3/`：core/dom/components/theme-bridge/
  host-mount/more-menu + 三個真引擎 adapter（teachtext/chart/stage）。
  **沒有** VibeOffice/OOXML 寫入路徑；chart/stage adapter 包的是主倉既有
  ClioChart/ClioStage 引擎，不是 gridcraft/deckcraft。
- 樣式：`styles/92-clioworks-native.css` → lazy `styles.clioworks-native.css`
  （`style-manifest.mjs:91-94` 註冊，loader 為 fixture.js）；不佔開機預算。
- 簽核包：`internal/evidence/drafts/clioworks-v3-20261010/`（V3-A..D 通過；
  **V3-E 待公共 host port 穩定後展開**；PdfCraft not_start）。

## 四、NATIVE-ADAPTER-MAP 逐條核對（實際源碼）

| 映射表聲稱 | 核對結果 | v4 接法要點 |
| --- | --- | --- |
| `features/selection-services.js` 構造 Reader/TeachText 選區上下文 | 存在（527 行）。`readerSelectionContext`/`teachTextSelectionContext` 等基於 `window.getSelection` 與 text control | 需新增 NativeEditorAdapter 選區描述入口（V4-02）；iframe 內選區不得從外猜 |
| `features/reader.js`、`file-disk.js` 打開文件意圖 | reader.js 無 docx/xlsx/pptx 處理。`fileDiskKindFromName`：xlsx→`"table"`，docx/pptx/rtf→`"document"`；掛載即讀純文本（`buildMountedFileDiagnostic` 對 fileBodies 取文本塊）| **現狀只有「純文本掛載」一條路**。V4-01 需在打開處分「編輯文件 / 作為資料閱讀」，原包引用保留，禁止經純文本 importer 覆蓋源文件 |
| `features/scrapbook.js` | 存在（1923 行） | V4-02 保留原句+定位+顯式選擇資產；打開即保留不是默認 |
| `core/text-quote.js` | 存在（134 行） | 引文/cue 用穩定 ID+前後文；匹配不唯一不取第一個 |
| `core/review-comments.js` | 存在（353 行） | V4-06 原批注追加、回稿比較獨立建議；不覆蓋/偽造作者 |
| `core/edit-embeds.js` | 存在（173 行） | V4-04 副本+來源+adopted/kept；建派生影響索引（V4-05），不建 live-link 第二主模型 |
| `core/edit-history.js` | 存在 | 各編輯器各有歷史；補償撤銷不倒退全桌面 |
| `core/state-stores.js`、`storage-transactions.js` | 存在（575/184 行）。單提交槽 `enqueue`，commit 持有整個 baseline→persist→converge；write fence 在 keyval `__ai_system6_write_fence__`，epoch 遞增，stale 拒絕 | v4 協調提交必須复用此隊列與圍欄：隊列外準備候選、隊列內重讀版本、同一真實 IDB 事務驗證讀依賴集合（V4-05） |
| `features/video-docmap.js` | 存在（449 行） | 來源時間+blockIds 進參考定位；不冒充成片時間 |
| `features/dictation-pad.js` | 存在（696 行） | 採用淨稿到當前擁有者，保留原轉錄關聯 |
| `features/project-cd-print.js`、`word-export.js` | 存在（773/1376 行），共享 Page Setup | V4-09 固定快照傳遞接此，不另選版式 |
| `core/theme-registry.js` | 存在（790 行） | v3 theme-bridge 已接；不建第二份註冊表 |
| 服務端 importers | `apps/server/server/importers/office.js` 是**純文本抽取**（extractWordXmlText 等） | 只能作閱讀投影來源；絕不能成為 DOCX 打開後的保存鏈 |

## 五、v4 新增設計差異（相對 v3，不重審已通過項）

1. **CreatorPorts**（`contracts/ports.d.ts`）：documents/editors/confirmation/
   coordinator/locate/interop/delivery 七口，掛在 v3 既有協調模塊下的依賴注入
   集合；Approval 為不可偽造的宿主內權威（unique symbol），不接受
   `confirmed:true` 或自稱 user 的外部消息。
2. **`src/integration.js` 候選邏輯**（sha256 `af3d415b…`）：canonical/
   projectImpacts/preparePlan/validatePlan/createGrantVault/executePlan/
   threeWayBlocks/buildRelease/formatDecision/captionSrt。生產調 native
   adapter 的模型操作；fingerprint/seal 是內部規範化文本，公開摘要由宿主對
   實際字節計算——回歸測試已鎖。
3. **`src/creator-layout.css`**（sha256 `8037e1e7…`）：僅佈局，消費系統分隔線；
   正式界面只加載 v3 已集成原生樣式 + 此文件。demo/*、lab.css、
   reference-appearances.css、頂部八頁切換條禁止進產品。
4. **`tools/ooxml_guard.py`**（sha256 `7619b27c…`）：局部修改哨兵。fixtures
   三組（DOCX 改一 run / XLSX 改 D5 / PPTX 改一頁標題）為合成輸入；
   candidate 不得被當作運行結果，產品輸出須真實編輯器重產第三份再比。
5. **18 屏幕（V4-S01..S18）**：實現狀態混合——多數為設計合同；S02/S03/
   S04/S06/S07/S08/S09/S11/S12 有本包有限原型；全部需在真實宿主重驗，
   不得直接把上游窗口當臨時替代。
6. **LOSS-01..05 上游缺陷清單**（VibeOffice LOSSLESS_SAVE.md 公開待辦）：
   必須作為負向回歸輸入；找不到輸入記 blocked，不得另造簡單圖表冒充修復。

## 六、第一可驗收增量（spec §13）

在真正 AI System 6 中：打開本包 XLSX → 改一處非公式文本 → 保留未改公式與
自定義 XML；隨後在 ClioWrite 選一段文字保留到來源/引用鏈並能返回原位置。
V4-01 先做這條，不先建抽象層。

## 七、風險與 not_run 登記（V4-00 時點）

- ~~Rust 工具鏈缺失~~（2026-10-10 已裝設並實證，見「二之一」）：四引擎的
  `cargo check --target wasm32-unknown-unknown` 全過，gridcraft-web 完整
  建出 wasm。
- 真實 OOXML 編輯路徑在主倉不存在；VibeOffice 尚未進主倉（public/ 三應用，
  需選定掛載邊界與懶加載清單，且保留其 OPC 保留基礎）。
- 真實 IndexedDB 跨文件原子批次、寫圍欄接管、Office/Safari/IME/語音對齊、
  性能能耗：全部 not_run。
- 設計審批 pending_review：隔離/fixture 路徑先行，正式入口按項目審批約定落地。

## 八、本輪命令與證據（V4-00 執行記錄）

- `git log -1` → HEAD `f2809c2f7`（exit 0）。
- `git merge-base --is-ancestor 478d6c49… HEAD` → 非祖先（exit 1，預期：
  公開基線未 fetch）。
- 五倉 `git clone --filter=blob:none` + `git checkout <locked sha>` →
  五個 `rev-parse HEAD` 與 lock 完全一致（exit 0）。
- `rustc/cargo/rustup` 探測 → 缺失（記 blocked）。
- 映射表聲稱的 13 個主倉模塊逐一 `grep`/`wc` 核對存在與職責（見第四節）。

限制：未運行 v4 包測試於主倉樹內；未驗證上游構建；未觸碰未提交的
site-copy 等他人改動；本文件不批准任何 v4 新設計。
