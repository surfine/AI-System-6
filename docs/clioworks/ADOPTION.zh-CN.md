<!-- canonical-source: docs/clioworks/ADOPTION.md -->
<!-- source-sha256: 0cfaa313333ad593152b8e748a7e36c8ccce1b5696fdf15adb96d1c6a1b82184 -->

> 英文版为准 ・ 仅供人类参考

# ClioWorks 上游采用情况

每个上游一行。「Vendored」表示源码在本仓库内；「仅作参考答案」表示只读取上游来编写验收测试，不复制任何代码或 WASM。

| 上游 | 许可 | 状态 |
| --- | --- | --- |
| VibeOffice | Apache-2.0 | 已 vendored，偏离项见下。固定在 `32ff53a5da0e75ebac11acdb0251cd3d8c7bf408`（release v2026.10.18-32ff53），位于 `apps/desktop/app/vendor/vibeoffice/{common,quire,ledger,lectern}`。 |
| GenOffice | 见上游 | 未 vendored 任何源码。它的审计适配器是我们自己的。 |
| wordcraft、gridcraft、deckcraft、pdfcraft、photocraft、vectorcraft、lightcraft | 见上游 | 仅作参考答案。行为变成验收测试，不 vendored 代码，不带 WASM。 |
| artcraft | MIT OR Apache-2.0（2026-10-10 重新授权） | 仅作参考答案。行为变成验收测试，不 vendored 代码，不带 WASM。 |
| pdfjs-dist（pdf.js） | Apache-2.0 | 已安装 6.3.289（npm 依赖，不 vendored）。`/app/vendor/pdf.min.js` 与 `pdf.worker.min.js` 提供的、Web 发布所复制的是 **legacy** 构建（`legacy/build/pdf.min.mjs`、`pdf.worker.min.mjs`：Safari ≥ 18、Chrome ≥ 125），这是 Aaron 2026-10-24 对 SUITE-1 的裁定；默认构建不再发布。`cmaps/`（约 1.6 MB）与 `standard_fonts/`（约 0.8 MB）随发布放在 `/app/vendor/pdfjs-cmaps/` 与 `/app/vendor/pdfjs-standard-fonts/`，按需逐个文件取用，永不进启动软盘（SUITE-3，同日裁定）。用于 Reader 的原页视图（N1）与公开 Web 端的 PDF 导入；服务端导入器本来就用 legacy 构建。 |
| @cantoo/pdf-lib | MIT | 已 vendored 2.11.1：单个 UMD 构建位于 `apps/desktop/app/vendor/pdf-lib/pdf-lib.min.js`（sha256 `2294a0bb8742d8948ae2d49a60cb6a3600c0b5deae6de198e57fb368d1b79ba9`，616,746 字节），随附 `LICENSE`，仅在 Reader 的整理页面模式或提取表格运行时按需加载（SUITE-2 裁定，2026-10-24，页面操作）。绝不作为 npm 依赖；用 `npm pack` 取包后复制，不安装。保存为增量更新（`forIncrementalUpdate` + `save`）：原件字节保持为前缀，只追加改动过的页面树与页面，所以删掉的页面对象仍留在原件部分。移动页面用 `catalog.removeLeafNode` 摘下叶节点，因为 `removePage` 会连页面对象一起删掉。每次保存都实测前缀；万一不成立，就把原件保留为备份。 |

## VibeOffice 偏离项

路径均在 `apps/desktop/app/vendor/vibeoffice/` 之下。其余内容与上游逐字节一致。行号对应当前固定版本。偏离项的逐条清单以英文版为准。

N5a 补了一个运行时入口：上游把区间平移放在未 vendored 的 `ledger/ops.js`，而 `ledger/tables.js` 在表格范围随插删行列移动时会调用 `L.ops.shiftRange`；`clioworks-v3/ledger-structure.js` 只在缺少时填上这一项，不定义其他 `L.ops` 成员。数据透视表与切片器不平移（所有者裁定），改动前和首次存储清单里都会告诉写作者。

新增文件：`quire/portions.js` 是上游新文件（Apache-2.0，衍生自 Apache OpenOffice），`render.js` 会调用其中的 `R.lineBoxes`，因此原样 vendored，并在 `quire-adapter.js` 里紧跟 `render.js` 之后加载。

宿主侧、不 vendored：编辑层现在每次按下都以 `L.ui.drag` 起步（上游 `common/ui.js`，未 vendored）。`quire-adapter.js` 导出一个小的 `dragHost`（drag、dragCancel、dragging），`features/clio-write.js` 把它放进自己的 `L.ui`。

## 2026-10-28：VibeOffice 重钉版随附的 zip.js 头注释为公开发布净化一行

上游 puff.c 的 zlib 许可注释在版权行下带作者联系邮箱（zlib 上游的公共信用行）。
公开发布快照的维护者信息扫描会拦下它。处置：删除邮箱、保留「Mark Adler」署名与
完整版权行（zlib 第 3 条要求的 notice 未动）。这是发布净化的机械改动，不改任何
代码行为；上游原文件在私有仓库未动。需作者知悉（vendor 改动按约应经批准）。

## gridcraft 函数批次

所有者 2026-10-31 裁定：允许分批移植上游 gridcraft（MIT OR Apache-2.0）的纯函数，每批在此登记并带许可声明；计算引擎仍是 VibeOffice 的原版，批次只往函数表里登记函数。

### 第 1 批（2026-10-31）：评估器缺的统计与财务函数

上游提交 `75f7056e1b96f7ce30f402310221ca1a6d083a17`。ODDFPRICE、ODDFYIELD、ODDLPRICE、ODDLYIELD、EUROCONVERT、PERCENTOF、FORECAST.ETS 系列（4 个）移入 `clioworks-v3/ledger-fn-batch1.js`，在 `ledger-adapter.js` 的 `CALC_MODULES` 末尾惰性加载，不增加启动体积。合约：`tests/features/clioworks-g1-function-coverage.test.mjs`。与 Excel 的差异：ETS 优化器 Excel 未公开，噪声数据的末位可能不同，合约只断言精确数据。详见英文版同名小节。

### 第 2 批（2026-10-31）：REGEX*、GROUPBY、PIVOTBY

同一上游提交。`clioworks-v3/ledger-fn-batch2.js` 移入 REGEXTEST、REGEXEXTRACT、REGEXREPLACE、GROUPBY、PIVOTBY；正则跑在 JavaScript 引擎上（非 Rust regex），不改溢出（spill）语义，合约每个函数只留几行代表用例。详见英文版同名小节。
