# 往返② · LibreOffice Impress 底线（2026-10-16，主代理无头运行）

环境：LibreOffice 26.8.1 build 1，macOS，headless `soffice --convert-to`（fodp 用于核对，pptx 用于读回）。

| 步 | 结果 | 证据 |
| --- | --- | --- |
| B.1 打开不报错、不提示损坏 | 过 | `edited.pptx` 转 fodp 与 pptx 均成功 |
| B.2 页数、文字、备注 | 过 | 3 页；第 1 页文字条「一次导出：42 秒（已复核）」、新备注「改过的演讲备注：先给出数字，再说明测试边界。」；第 3 页是第 2 页的复制，备注随页带过去 |
| B.3 批注（现代 p188） | 记录 | LibreOffice 不导入 PowerPoint 现代批注：连起点 `base.pptx` 也读出 0 条（对照），不算 ClioStage 缺陷 |
| B.3' 批注（旧式 p:cm，补测） | 过 | `legacy-edited.pptx`＝`slides-notes-comment-s11.pptx` 经 lectern-adapter 新增 1 条批注、回覆 1 条后保存；LibreOffice 读出 3 条：原有「这一页的数字等实测后再改。」、新增「标题再短一点」（阿澄）、回覆「好，改成两行」（小禾） |
| B.5 另存 pptx 再用 lectern-adapter 读回 | 过 | `from-lo.pptx`：3 页、文字与备注全对（LO 把文字条切得更碎，内容相同）；现代批注因 B.3 不在。`legacy-from-lo.pptx` 为 LO 另存的旧式批注件 |

判定：**底线通过**（内容不丢；现代批注是 LibreOffice 的已知限制，旧式批注往返通过）。
