# 往返① EXPECTED（由 make-roundtrip.mjs 产生，勿手改）

被测件：`edited.xlsx`，sha256 `bed3b0ab7cf4610e81013371f0766cedd98db6deed428c96d4f124a5a5d9b726`（20639 字节）
起点：`base.xlsx`，sha256 `f885f26348f5f7b1f0d85fe6eba9f47beb371ab320835f5c3d26ab5a82e8769f`（= budget-s11.xlsx 加 B2 一条串接批注）
重新产生：`node tests/fixtures/clioworks-s11/roundtrip-1/make-roundtrip.mjs --check`，必须报字节一致。

## 我们改了什么

| 格 | 起点 | 改后 |
| --- | --- | --- |
| B2 | 220 | 250 |
| D3 | `=B3*C3`（共享公式子格） | `=B3*C3*2` |
| A2 | 无批注 | 新批注「核对数量」（阿澄） |
| B2 串接 | 根 + 1 条回覆 | 再加 1 条回覆「收到，按 250 个订」（小禾） |

## 公式格

「ClioChart 值」是本次保存里写入的缓存值（再用 ledger-adapter 读回的结果）。「Excel 重算后」「LibreOffice 重算后」由人在重新计算（Excel 的 Ctrl+Alt+Shift+F9；LibreOffice 的 Ctrl+Shift+F9）后抄入；一格不同就记为差异，不要改 ClioChart 的值去迁就。「显示」是按该格数字格式格式化后应看到的文字。

| 格 | 公式 | ClioChart 值（显示） | Excel 重算后 | LibreOffice 重算后 |
| --- | --- | --- | --- | --- |
| D2 | `=B2*C2` | ¥1,500 | | |
| G2 | `=D2/$D$12` | 14.3% | | |
| D3 | `=B3*C3*2` | ¥240 | | |
| G3 | `=D3/$D$12` | 2.3% | | |
| D4 | `=B4*C4` | ¥2,600 | | |
| G4 | `=D4/$D$12` | 24.7% | | |
| D5 | `=B5*C5` | ¥2,800 | | |
| G5 | `=D5/$D$12` | 26.6% | | |
| D6 | `=B6*C6` | ¥2,280 | | |
| G6 | `=D6/$D$12` | 21.7% | | |
| D7 | `=B7*C7` | ¥180 | | |
| G7 | `=D7/$D$12` | 1.7% | | |
| D8 | `=B8*C8` | ¥920 | | |
| G8 | `=D8/$D$12` | 8.7% | | |
| D9 | `=B9*C9` | #VALUE! | | |
| D10 | `=B10*C10` | ¥0 | | |
| D12 | `=SUM(D2:D8,D10)` | ¥10,520 | | |
| F12 | `="另有 "&COUNTIF(B2:B10,"未测")&" 项未测"` | 另有 1 项未测 | | |

预期结构：D9 仍是 `#VALUE!`（B9 是文字「未测」，未被改动），F12 是文字串，D12 合计不含 D9。

## 批注清单（ledger-adapter 读回 edited.xlsx）

| 格 | 种类 | 作者 | 内容 | 时间 |
| --- | --- | --- | --- | --- |
| A2 | 批注 | 阿澄 | 核对数量 |  |
| B2 | 串接根 | 阿澄 | 纸箱单价再确认一下 | 2026-10-10T09:00:00.00 |
| B2 | 回覆 | 小禾 | 已确认，按 6 元算 | 2026-10-10T10:30:00.00 |
| B2 | 回覆 | 小禾 | 收到，按 250 个订 | 2026-10-16T08:30:00.00 |

## 未改部件的对照方法

下表是 base.xlsx 与 edited.xlsx 各部件内容的 sha256 前 12 位。状态为 changed / new 的部件是 ClioChart 的保存器依本次编辑重写的，预期会变；状态为 same 的部件是原样带过去的，人工在 Excel / LibreOffice 里另存回来之前，用 `unzip -p edited.xlsx <part> | shasum -a 256` 取整串应与此处前 12 位相符（这一步确认被测件没被动过）；另存之后该部件若变了，是那个软件改写的，记入 CHECKLIST 的差异栏，不算 ClioChart 的缺陷。
未改的缓存值：除上表公式格外，所有 `<v>` 应原样保留（例如 D4..D8、D10 的值）；该核对由 ledger-adapter 读回完成，不是目视。

| 部件 | 状态 | base | edited |
| --- | --- | --- | --- |
| `[Content_Types].xml` | changed | `796af2181282` | `0f5cd99e4ba0` |
| `_rels/.rels` | changed | `9f96bb683e71` | `1285b20099c6` |
| `customXml/clw-preservation.xml` | same | `36910781c08c` | `36910781c08c` |
| `docProps/app.xml` | new | `` | `bb66696a1401` |
| `docProps/core.xml` | new | `` | `bdb0d1af2c47` |
| `xl/_rels/workbook.xml.rels` | changed | `5d48897949bf` | `e9e97ae2ea6a` |
| `xl/comments1.xml` | changed | `a65641b43165` | `850e5bc6279c` |
| `xl/drawings/vmlDrawing1.vml` | new | `` | `0820e780164f` |
| `xl/persons/person.xml` | same | `a3170047bfdc` | `a3170047bfdc` |
| `xl/sharedStrings.xml` | changed | `64907c6496a7` | `42e9e0372a2f` |
| `xl/styles.xml` | same | `ac0d3681cc80` | `ac0d3681cc80` |
| `xl/theme/theme1.xml` | new | `` | `b8fa667dc287` |
| `xl/threadedComments/threadedComment1.xml` | changed | `a2691bd3bf10` | `6f788dd01ada` |
| `xl/workbook.xml` | changed | `2a5b4bf6bf24` | `173640e7cf48` |
| `xl/worksheets/_rels/sheet1.xml.rels` | changed | `ea716b1042e4` | `a7a7494fd0ce` |
| `xl/worksheets/sheet1.xml` | changed | `55ee7d88ab59` | `1f0555e028cb` |
| `xl/worksheets/sheet2.xml` | changed | `6081e5d4f2b3` | `810f8fdfb485` |
