# 往返① · LibreOffice 底线（2026-10-16，主代理无头运行）

环境：LibreOffice 26.8.1 build 1（bf6ef26），macOS，headless `soffice --convert-to`；临时用户配置把
`/org.openoffice.Office.Calc/Formula/Load/OOXMLRecalcMode` 设为 0（打开 xlsx 时总是重算），见 `recalc-on-load.xcu`。
图形界面没有操作：Aaron 拒绝了电脑控制授权，所以 B.4 的「批注外观」只按导出的 fods 记录。

| 步 | 结果 | 证据 |
| --- | --- | --- |
| B.1 打开不报错、不提示损坏 | 过 | 三次转换均成功；无错误输出 |
| B.2 工作表、内容、数字格式 | 过 | 两张表「预算」「口径」（清单写的「说明」是清单笔误，实际名「口径」）；`recalc-budget.csv` 的显示文字：¥6、¥1,500、14.3%、2026年10月5日、2026/10/6 |
| B.3 重算后逐格与 ClioChart 一致 | 过 | 与 EXPECTED「ClioChart 值（显示）」列 18 个公式格逐格相同（D2 ¥1,500 … D12 ¥10,520、D9 #VALUE!、F12 另有 1 项未测、G2…G8 百分比） |
| B.3 对照：证明是重算不是缓存 | 过 | `tampered-d2-999.xlsx`（只把 D2 缓存改成 999）：默认配置读出 ¥999，重算配置读出 ¥1,500 |
| B.4 批注外观（只记录） | 记录 | A2「核对数量」（阿澄）；B2 串接在 LO 里显示为一条批注，三段文字依次拼接并带「[Threaded comment]」标记——三条文字都在 |
| B.5 另存 xlsx 再用 ledger-adapter 读回 | 过 | `from-lo.xlsx`（sha256 4b019a83ab0211015bb28e03cfed4074fe87ce84735d0515549695679028ffb2）读回：B2=250；D2 `B2*C2`=1500；D3 `B3*C3*2`=240；D4 `B4*C4`=2600；D9 #VALUE!；D12 `SUM(D2:D8,D10)`=10520；F12 文字公式保留；批注 4 条（A2 根；B2 根 + 2 条回覆）作者与文字不变 |

判定：**底线通过**（B.1–B.3、B.5 无丢失；B.4 已记录）。重跑：`sh run.sh`。

未做：Excel（M365 过线，CHECKLIST A 段）需要人在 Excel 里操作，待 Aaron。
