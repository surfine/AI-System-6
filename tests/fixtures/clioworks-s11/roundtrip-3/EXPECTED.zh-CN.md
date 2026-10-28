# 往返③ EXPECTED（由 make-roundtrip.mjs 产生，勿手改）

被测件：`edited.docx`，sha256 `107f5b0b4e8d800cf41ebc3b388a35fa95dca223deabd63d483372a50cb900dc`（33323 字节）
起点：`base.docx`，sha256 `d81675b952bd4d89ffc26515127c120e98703cde300b0238030c458930d2c720`（= quire-s11.docx 原样副本，12 段 + 1 张表 + 1 张图 + 批注 1 条：阿澄「纸箱数量再确认一下」，原本就有，不是本次新增）
重新产生：`node tests/fixtures/clioworks-s11/roundtrip-3/make-roundtrip.mjs --check`，必须报字节一致。
回覆：quire-adapter 支持回覆（`replyComment`），本次回覆挂在本次新增的根批注之下。

## 我们改了什么

| 项 | 起点 | 改后 | Word 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- |
| 一个条的文字 | 最后一段，什么格式都没有。 | 最后一段，现在改过了。 | | |
| 一个词加粗 | 「普通」不是粗体 | 「普通」加粗，其余不变 | | |
| 段落变标题 | 「这个周末…」是正文 | 标题 2 | | |
| 段落变列表项 | 「最后一段…」是正文 | 项目符号列表项 | | |
| 新根批注 | 无 | 「这句再短一点」（阿澄，锚定在「这个周末…」整段） | | |
| 回覆 | 无 | 「好，改成两句」（小禾），挂在上一条之下 | | |

## 逐段（quire-adapter 读回 edited.docx）

「样式」由 adapter 的 headingLevel / list 判出；「加粗字」是该段里粗体的文字（标题样式自带的粗体也算）。「Word 看到」「LibreOffice 看到」由人在对应软件里打开、逐条抄入；一条不同就记为差异，不要改 edited.docx 去迁就。表格与图片不在本表（只读，原样带过）。

| 段 | 样式 | 文字 | 加粗字 | Word 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- | --- |
| 1 | 标题 1 | 搬家清单 | 搬家清单 | | |
| 2 | 标题 2 | 这个周末要把东西搬到新家，下面是我的安排。 | 这个周末要把东西搬到新家，下面是我的安排。 | | |
| 3 | 标题 2 | 先装箱 | 先装箱 | | |
| 4 | 正文 | 普通的一句，加粗的一句，斜体的一句，下划线的一句。 | 普通加粗的一句， | | |
| 5 | 标题 3 | 再叫车 | 再叫车 | | |
| 6 | 正文 | 先把纸箱数量点清楚。 |  | | |
| 7 | 项目符号 | 胶带和标签纸 |  | | |
| 8 | 项目符号 | 旧报纸 |  | | |
| 9 | 编号 | 周六上午装箱 |  | | |
| 10 | 编号 | 周六下午叫车 |  | | |
| 11 | 正文 | 新书架的位置示意。 |  | | |
| 12 | 项目符号 | 最后一段，现在改过了。 |  | | |

## 批注清单（quire-adapter 读回 edited.docx）

原有的 1 条根（阿澄）应原样保留，再加本次新增的 1 根 + 1 回覆。

| 种类 | 作者 | 内容 | 锚定文字 | 时间 | 状态 | Word 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 串接根 | 阿澄 | 这句再短一点 | 这个周末要把东西搬到新家，下面是我的安排。 | 2026-10-16T08:00:00Z |  | | |
| 回覆 | 小禾 | 好，改成两句 | 这个周末要把东西搬到新家，下面是我的安排。 | 2026-10-16T08:30:00Z |  | | |
| 串接根 | 阿澄 | 纸箱数量再确认一下 | 纸箱 | 2026-10-10T09:00:00Z |  | | |

## 未改部件的对照方法

下表是 base.docx 与 edited.docx 各部件内容的 sha256 前 12 位。changed / new 是 quire 保存器依本次编辑重写的；same 是原样带过去的，人工另存回来之前用 `unzip -p edited.docx <part> | shasum -a 256` 取整串应与前 12 位相符；另存之后若变了，是那个软件改写的，记入 CHECKLIST 的差异栏，不算 ClioStage 的缺陷。

| 部件 | 状态 | base | edited |
| --- | --- | --- | --- |
| `[Content_Types].xml` | changed | `c11d5c41a2f5` | `59903f4ea297` |
| `_rels/.rels` | changed | `6b1f432240d6` | `d6f21829c008` |
| `docProps/app.xml` | new | `` | `cbc8718b3853` |
| `docProps/core.xml` | new | `` | `22fbdd34b42d` |
| `word/_rels/document.xml.rels` | changed | `a03dd7362ce5` | `f8d6333a3613` |
| `word/comments.xml` | changed | `1f5f746f36ac` | `48891c67d941` |
| `word/commentsExtended.xml` | new | `` | `5fac9ae343e1` |
| `word/document.xml` | changed | `d37f7ddb6977` | `0d7265590d69` |
| `word/fontTable.xml` | new | `` | `51285f69a46c` |
| `word/media/image1.png` | same | `c414cd0e204d` | `c414cd0e204d` |
| `word/numbering.xml` | changed | `f419a790a3e4` | `a344f0fa6b92` |
| `word/settings.xml` | same | `fa45bf63d1cf` | `fa45bf63d1cf` |
| `word/styles.xml` | changed | `79d3287e89b5` | `8fb89aa8754f` |
| `word/theme/theme1.xml` | new | `` | `e083e5cf1e25` |
| `word/webSettings.xml` | new | `` | `a2a3c1435f29` |
