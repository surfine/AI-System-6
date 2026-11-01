<!-- canonical-source: tests/fixtures/real-corpus/README.md -->
<!-- source-sha256: bbf5283935b6d71959072e6b6a9d07c208de4c891a4b2d978607cad7106be4fe -->

> 英文版为准 ・ 仅供人类参考

# 真实文件语料库（ClioWorks R1）

这里是 32 份从公开来源取得的真实办公文件（12 份 docx、10 份 xlsx、6 份 pptx、4 份 pdf），外加 3 份合成文件（D19、D20、P10，见下文）。它们的生产工具各不相同（WPS Office、Word 12/14/16 的 Windows 与 Mac 版、Excel、LibreOffice、PowerPoint），用来回答一个问题：桌面里的 ClioWrite、ClioChart 工作簿和 ClioStage 面对别人真正存下来的文件，会不会出问题。`manifest.json` 记录每份文件的编号、大小、sha256、生产工具、语言、用途、下载地址、来源页和许可。

## 合成文件

`generate-synthetic.mjs` 生成 D19.docx（表格属性修订 `w:tblPrChange`、一处 `w:moveFrom`/`w:moveTo` 移动、一处插入和一处删除）、D20.docx（批注线程：一条回复、一条已解决的根批注，批注 id 为 0/3/7/9，中间有缺口）和 P10.pptx（动画与切换、节列表、音频形状）。内容只有合成文字，由桌面自带的 docx 编码器或 S11 夹具生成，随仓库同许可。它们用来锁住真实文件碰不到的限制：D19 与 P10 编辑一次后只能改一个部件；D20 如实记录已知的整写路径（写出器会重排批注 id），所以 `clioworks-r1-corpus` 对 D20 断言它改动的部件，而不是把它当作通过。

## 许可

每份文件的许可写在 `manifest.json` 的 `license` 字段，以那里为准。政府和学校来源的文件没有显式开放许可，只用于内部测试，不得再分发：不要把它们放进公开仓库、发布包、官网或示范盘。四份 PDF 原先同样扣下；2026-10-28 站长确认它们可以公开发布，`manifest.json` 已记下这一决定，公开快照也随之发布。政府与学校来源的 docx/xlsx 仍按原规则办。

## 自动检查

`node tooling/clioworks-r1-corpus.mjs` 对每份 docx/xlsx/pptx 做三件事，走的是桌面实际使用的 vendored 编解码器和适配器：

1. 打开不报错；
2. 不改动就保存，字节与原文件完全相同（sha256 对比）；
3. 做一次最小编辑（ClioWrite 改正文第一个文字 run 的一个字；工作簿改第一个非公式文字格；ClioStage 改第一个文本框的一个字）再保存，结果仍是合法的包：zip 可读、XML 格式良好、内容类型与关联关系都能解析，且没有比原文件多出新的问题。

桌面拒绝或无法编辑的文件（例如只有表格的 docx，ClioWrite 的表格是只读的）照实记为该项失败，不修改产品代码。`tests/features/clioworks-r1-corpus.test.mjs` 用 compare 模式跑一遍：只有「基线里为真、现在变成假」的退步才算失败，同时核对每份文件的 sha256、许可与来源。

加 `--lo` 会在本机装有 `soffice` 时，把编辑后的文件用 LibreOffice 无界面转成 PDF，记录 `lo_open`；没有 `soffice` 就记为 `not_run`。加 `--reencode` 会额外记录「改一下再改回来，经编码器重新保存」是否与原文件相同（不改动的保存直接返回原字节，这一项才反映编码路径的保真度）。

## 更新基线

修好一个问题、或有意改变了行为之后：

```
node tooling/clioworks-r1-corpus.mjs --write-baseline
```

它会重跑全部文件（含 LibreOffice 与 reencode），改写 `baseline.json`。把变化的行连同原因一并提交；基线只应往「更多检查为真」的方向走。新增语料时先更新 `manifest.json`（含 sha256、来源与许可），再重写基线。

## 人工那一半：Microsoft 365 是否无需修复就能打开

自动检查给不了这一项。请人工用 Microsoft 365（Word、Excel、PowerPoint）打开每份「编辑一次再保存」的文件，确认没有「发现无法读取的内容，是否修复」的提示。用下面的命令导出这些文件：

```
node tooling/clioworks-r1-corpus.mjs --export-edited <目录>
```

优先打开生产工具与 Microsoft 365 差别最大的几份：WPS 产出的 D01、D02、D08；LibreOffice 产出的 X15；Mac 版 Office 产出的 D11、D12、X07、X11、P05、P09。其余 docx/xlsx/pptx 也应过一遍；PDF 不在此列。自动检查里「没有可编辑文字」而没有导出编辑版的文件（见 `baseline.json` 里 `edited_valid` 为 false 的行），人工改为打开原文件，确认原文件本身能打开。
