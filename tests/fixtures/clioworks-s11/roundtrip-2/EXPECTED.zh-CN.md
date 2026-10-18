# 往返② EXPECTED（由 make-roundtrip.mjs 产生，勿手改）

被测件：`edited.pptx`，sha256 `4bfff0001d8e5980f9a273f523bd112f21309bc76a862fa86b5f156698d903d2`（139944 字节）
起点：`base.pptx`，sha256 `823e0a6836c2cd3ccf4dc9bd8ae9acaffa6c12c4943b0812801f66e8f3863452`（= slides-modern-comment-s11.pptx 原样副本，2 页 + 现代批注 3 条）
重新产生：`node tests/fixtures/clioworks-s11/roundtrip-2/make-roundtrip.mjs --check`，必须报字节一致。

## 我们改了什么

| 项 | 起点 | 改后 | PowerPoint 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- |
| 第 1 页文字条 | 一次导出：42 秒 | 一次导出：42 秒（已复核） | | |
| 第 1 页演讲备注 | 演讲备注：停一下，再解释测试范围。此处不属于观众画面。 | 改过的演讲备注：先给出数字，再说明测试边界。 | | |
| 第 2 页复制 | 2 页 | 第 2 页复制成新的一页，跟在原页之后（共 3 页） | | |
| 第 1 页新批注 | 无 | 「标题再短一点」（阿澄，锚定标题对象） | | |
| 第 1 页串接 | 根 + 1 条回覆 | 再加 1 条回覆「好，改成两行」（小禾） | | |

## 逐页文字条（lectern-adapter 读回 edited.pptx）

「ClioStage 写入」是这次保存里 lectern-adapter 存入的文字；重新打开 edited.pptx 后，下列文字条应逐条相同。「PowerPoint 看到」「LibreOffice 看到」由人在对应软件里打开、逐条抄入；一条不同就记为差异，不要改 edited.pptx 去迁就。

| 页 | 形状 | 段 | 条（稳定 id） | ClioStage 写入（读回） | PowerPoint 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- | --- | --- |
| 第 1 页 | TextBox 1 | 0 | `sge8015kzms:0:0` | ClioWorks · 合成格式夹具 | | |
| 第 1 页 | TextBox 2 | 0 | `sge801ay7ns:0:0` | 一次导出：42 秒（已复核） | | |
| 第 1 页 | TextBox 3 | 0 | `sge801fb3cs:0:0` | 同一工程，三次记录。 | | |
| 第 1 页 | TextBox 3 | 1 | `sge801fb3cs:1:0` | 设备丙尚未测试。 | | |
| 第 1 页 | TextBox 4 | 0 | `sge801n7ubz:0:0` | 不代表真实设备测量；文字是原生可编辑对象。 | | |
| 第 2 页 | TextBox 1 | 0 | `sge801tqske:0:0` | ClioWorks · 合成格式夹具 | | |
| 第 2 页 | TextBox 2 | 0 | `sge801yhkle:0:0` | 先给出证据，再说明边界 | | |
| 第 2 页 | TextBox 3 | 0 | `sge8023dcae:0:0` | 正文、数据和演示保留各自的编辑状态。 | | |
| 第 2 页 | TextBox 3 | 1 | `sge8023dcae:1:0` | 来源改变后，作者决定更新哪些副本。 | | |
| 第 2 页 | TextBox 4 | 0 | `sge802bxn9l:0:0` | 不代表真实设备测量；文字是原生可编辑对象。 | | |
| 第 3 页 | TextBox 1 | 0 | `sge802hz9i0:0:0` | ClioWorks · 合成格式夹具 | | |
| 第 3 页 | TextBox 2 | 0 | `sge802m7lj0:0:0` | 先给出证据，再说明边界 | | |
| 第 3 页 | TextBox 3 | 0 | `sge802re98:0:0` | 正文、数据和演示保留各自的编辑状态。 | | |
| 第 3 页 | TextBox 3 | 1 | `sge802re98:1:0` | 来源改变后，作者决定更新哪些副本。 | | |
| 第 3 页 | TextBox 4 | 0 | `sge802zq477:0:0` | 不代表真实设备测量；文字是原生可编辑对象。 | | |

## 逐页备注（lectern-adapter 读回 edited.pptx）

| 页 | ClioStage 写入（读回） | PowerPoint 看到 | LibreOffice 看到 |
| --- | --- | --- | --- |
| 第 1 页 | 改过的演讲备注：先给出数字，再说明测试边界。 | | |
| 第 2 页 | 演讲备注：停一下，再解释测试范围。此处不属于观众画面。 | | |
| 第 3 页 | 演讲备注：停一下，再解释测试范围。此处不属于观众画面。 | | |

## 批注清单（lectern-adapter 读回 edited.pptx）

原有两条现代批注（根 + 回覆）应原样保留，再加本次新增的 1 根 + 1 回覆。「种类」为串接根 / 回覆。

| 页 | 种类 | 作者 | 内容 | 时间 | PowerPoint 看到 | LibreOffice 看到 |
| --- | --- | --- | --- | --- | --- | --- |
| 第 1 页 | 串接根（现代） | 阿澄 | 这个数字出处在哪？ | 2026-10-10T09:00:00.000 | | |
| 第 1 页 | 回覆（现代） | 小禾 | 已核对，按 42 秒写。 | 2026-10-10T10:30:00.000 | | |
| 第 1 页 | 回覆（现代） | 小禾 | 好，改成两行 | 2026-10-16T08:30:00.000Z | | |
| 第 1 页 | 串接根（现代） | 小禾 | 标题已改好。 | 2026-10-11T08:00:00.000 | | |
| 第 1 页 | 串接根（现代） | 阿澄 | 标题再短一点 | 2026-10-16T08:00:00.000Z | | |

## 未改部件的对照方法

下表是 base.pptx 与 edited.pptx 各部件内容的 sha256 前 12 位。状态为 changed / new 的部件是 lectern-adapter 的保存器依本次编辑重写的，预期会变；状态为 same 的部件是原样带过去的，人工在 PowerPoint / LibreOffice 里另存回来之前，用 `unzip -p edited.pptx <part> | shasum -a 256` 取整串应与此处前 12 位相符（这一步确认被测件没被动过）；另存之后该部件若变了，是那个软件改写的，记入 CHECKLIST 的差异栏，不算 ClioStage 的缺陷。

| 部件 | 状态 | base | edited |
| --- | --- | --- | --- |
| `[Content_Types].xml` | changed | `ee6e07711f29` | `84b1314f7271` |
| `_rels/.rels` | changed | `694cc89ebda9` | `4a4332d26e10` |
| `customXml/clw-preservation.xml` | same | `93419e97c133` | `93419e97c133` |
| `docProps/app.xml` | same | `77fbd43c41b9` | `77fbd43c41b9` |
| `docProps/core.xml` | same | `b25bcc592550` | `b25bcc592550` |
| `docProps/thumbnail.jpeg` | same | `116f9aa8ea03` | `116f9aa8ea03` |
| `ppt/_rels/presentation.xml.rels` | changed | `6304493af1a7` | `7867fafddf03` |
| `ppt/authors.xml` | same | `db6ba8ee1562` | `db6ba8ee1562` |
| `ppt/comments/modernComment_100_1A2B3C4D.xml` | changed | `d515e7137a0a` | `bfbbbdf52c79` |
| `ppt/notesMasters/_rels/notesMaster1.xml.rels` | same | `e04df15e1a39` | `e04df15e1a39` |
| `ppt/notesMasters/notesMaster1.xml` | same | `970fd6eed1e6` | `970fd6eed1e6` |
| `ppt/notesSlides/_rels/notesSlide1.xml.rels` | changed | `c1e57cc916d3` | `fd4441fb876f` |
| `ppt/notesSlides/_rels/notesSlide2.xml.rels` | same | `55c9833a37d5` | `55c9833a37d5` |
| `ppt/notesSlides/_rels/notesSlide3.xml.rels` | new | `` | `86c5617cebfb` |
| `ppt/notesSlides/notesSlide1.xml` | changed | `56f534548fb4` | `e931ba645c92` |
| `ppt/notesSlides/notesSlide2.xml` | same | `56f534548fb4` | `56f534548fb4` |
| `ppt/notesSlides/notesSlide3.xml` | new | `` | `56f534548fb4` |
| `ppt/presProps.xml` | changed | `b42af61236cd` | `1f487487097a` |
| `ppt/presentation.xml` | changed | `7845b530fea0` | `3f3fee261b4c` |
| `ppt/printerSettings/printerSettings1.bin` | same | `d7768f87e07d` | `d7768f87e07d` |
| `ppt/slideLayouts/_rels/slideLayout1.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout10.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout11.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout2.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout3.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout4.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout5.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout6.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout7.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout8.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/_rels/slideLayout9.xml.rels` | changed | `7c1f290acd6c` | `661facc4260c` |
| `ppt/slideLayouts/slideLayout1.xml` | same | `25c93a2f186d` | `25c93a2f186d` |
| `ppt/slideLayouts/slideLayout10.xml` | same | `1f8304c9d6c0` | `1f8304c9d6c0` |
| `ppt/slideLayouts/slideLayout11.xml` | same | `355ac266c267` | `355ac266c267` |
| `ppt/slideLayouts/slideLayout2.xml` | same | `5f800acd9e43` | `5f800acd9e43` |
| `ppt/slideLayouts/slideLayout3.xml` | same | `e83a85b737e1` | `e83a85b737e1` |
| `ppt/slideLayouts/slideLayout4.xml` | same | `1ebe316051a0` | `1ebe316051a0` |
| `ppt/slideLayouts/slideLayout5.xml` | same | `3df8e6f49862` | `3df8e6f49862` |
| `ppt/slideLayouts/slideLayout6.xml` | same | `18e5b26c6f7c` | `18e5b26c6f7c` |
| `ppt/slideLayouts/slideLayout7.xml` | same | `e4d86b009a8c` | `e4d86b009a8c` |
| `ppt/slideLayouts/slideLayout8.xml` | same | `950b9d16468d` | `950b9d16468d` |
| `ppt/slideLayouts/slideLayout9.xml` | same | `4e9439878755` | `4e9439878755` |
| `ppt/slideMasters/_rels/slideMaster1.xml.rels` | changed | `52e5efa51d86` | `c29f19276ee2` |
| `ppt/slideMasters/slideMaster1.xml` | same | `44cc65956f47` | `44cc65956f47` |
| `ppt/slides/_rels/slide1.xml.rels` | changed | `6fed4c884ae8` | `0f86b2da2b51` |
| `ppt/slides/_rels/slide2.xml.rels` | changed | `8fca8722ee5a` | `5e4c9798b243` |
| `ppt/slides/_rels/slide3.xml.rels` | new | `` | `c0101f403430` |
| `ppt/slides/slide1.xml` | changed | `258161af4832` | `e9896aa8eea0` |
| `ppt/slides/slide2.xml` | changed | `656d2743a73d` | `f9ef178947af` |
| `ppt/slides/slide3.xml` | new | `` | `f9ef178947af` |
| `ppt/tableStyles.xml` | same | `0e7ac0325133` | `0e7ac0325133` |
| `ppt/theme/theme1.xml` | same | `4c3412087e8f` | `4c3412087e8f` |
| `ppt/theme/theme2.xml` | same | `3d2fb2883cfc` | `3d2fb2883cfc` |
| `ppt/viewProps.xml` | same | `f2e3578e8a2a` | `f2e3578e8a2a` |
