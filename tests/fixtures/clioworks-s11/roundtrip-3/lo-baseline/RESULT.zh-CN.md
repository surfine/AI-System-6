# 往返③ · LibreOffice Writer 底线（2026-10-17，无头重跑）

被测件：重新产生的 `edited.docx`，sha256 前 12 位 `10aff9e265b3`（33328 字节，其 `<w:drawing>` 现保留命名空间声明）。
环境：LibreOffice 26.8.1 build 1，macOS，headless `soffice --convert-to`，临时用户目录 `-env:UserInstallation=file:///tmp/lo-rt3-<时间戳>`。步骤：`edited.docx` → `edited.fodt`（核对用）；`edited.docx` → `edited.odt`；`edited.odt` → `from-lo.docx`（与上次相同）。再用 quire-adapter（`make-roundtrip.mjs` 的 `describe`）读回 `from-lo.docx`，与 `edited.docx` 的读回结果及 `../EXPECTED.zh-CN.md` 比较。比较脚本：scratchpad 的 `cmp-rt3.mjs`。

| 步 | 结果 | 证据 |
| --- | --- | --- |
| B.1 打开不报错、不提示损坏 | 过 | 三次转换均成功，无错误输出 |
| B.2 段落、标题、列表、加粗、表格、图片 | 过 | 脚本输出 `paragraphs 12 12 equal true`、`tables 1 1`；样式（标题 1/2/3、项目符号、编号）与加粗字逐段相同；`drawings 1`，`word/media/image1.png` 前 12 位 `c414cd0e204d` 与 `edited.docx` 相同 |
| B.3 批注 | 过 | `edited.fodt` 有 3 个 `office:annotation`，回覆带 `loext:parent-name` 指向根「这句再短一点」；LO 导入 Word 批注与回覆串接 |
| B.5 另存 docx 再读回 | 过 | `from-lo.docx` 读回 3 条批注：作者、文字、时间、锚定文字、done 与 `edited.docx` 逐条相同，回覆「好，改成两句」的 parent 仍是「这句再短一点」；脚本输出 `comments equal (order-insensitive) true` |

脚本输出节录：

```
paragraphs 12 12 equal true
tables 1 1
comments equal false            <- 仅因顺序不同，见下
drawings 1 media word/media/image1.png c414cd0e204d orig c414cd0e204d
comments equal (order-insensitive) true
orig order: 这句再短一点 / 好，改成两句 / 纸箱数量再确认一下 | LO order: 好，改成两句 / 这句再短一点 / 纸箱数量再确认一下
```

差异（均不算丢失）：`from-lo.docx` 体积 10313 字节（原 33328），部件与 run 由 LibreOffice 重写；批注在文件中的排列顺序变成回覆在前、根在后，内容与串接关系不变。未发现丢失。

判定：**底线通过**（内容不丢；Word 批注与回覆串接在 LibreOffice 往返后保留）。
