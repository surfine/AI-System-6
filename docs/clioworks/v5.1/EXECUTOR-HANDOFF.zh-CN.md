<!-- 中文参考版：英文版为准，本文件仅供人类参考。哈希由 npm run docs:sync-hashes 维护。 -->

# ClioWorks Native Spec v5.1 — 执行状态与接手文档（中文参考）

<!-- canonical-source: docs/clioworks/v5.1/EXECUTOR-HANDOFF.md -->
<!-- source-sha256: 37ec2900546da9899c1466c7d3ef653441e352efef689582f5c686e03eee446e -->
<!-- 本文件是 EXECUTOR-HANDOFF.md 的中文对照；以英文版为准，仅供人类参考。哈希由 docs:sync-hashes 维护。 -->

包来源：`ClioWorks-Native-Spec-v5.1.zip`（00-EXECUTOR-PROMPT.md，接续 v3/v4.x 交互套件）。
本文件是执行者接手点。用户设计审批仍 pending_review；测试不能替用户签字。

## 已完成（main，至提交 3aaf1aff1，已推 private/main）

| 卡 | 内容 | 状态 | 合同/工具 |
|---|---|---|---|
| CW51-00 | 分支/HEAD/脏文件核对；v5.0 图不存在（首页/ClioGrid/ClioPDF 未曾落地）；vendored v3 与包基线对齐 | ✓ | `tools/verify-v3-baseline.mjs`（迁移后 5/5 matches-patched） |
| CW51-01 | 外壳沿用既有注册（ClioWrite/ClioChart/ClioStage/Reader 已在主仓；标题/三段栏/TDI 无新计划） | ✓（无改动需要） | — |
| CW51-02 | components.patch + host-mount.patch **hunk 级**迁入主仓 vendored v3（catalog/resolveCommand 注入、WRITE_COMMAND_BUSY、STALE_SELECTION、detached:true 不伪造取消、mayRestoreFocus 门、captureSelection 暴露）——byte-identical 到包内 patched 引用 | ✓（b2c3a7a4d） | byte 比对 + `verify-v3-baseline` |
| CW51-02 候选 | src/ 四模块（ui-model/frame-session/runtime-port/context-strip）落地为惰性 vendor 文件（loader `ensureClioWorksV51Modules`），**未接日启动路径** | ✓（4efd46406） | `clioworks-v51-modules`（22 断言） |
| CW51-03 | 图表适配器上下文补齐（真实格选择 cell-r-c、embedded/editable 来自引擎、hasSource 来自抽取——已扩展到 owner 文件；active/mayRestoreFocus 派生）；fixture 图表挂载接上下文条。**注**：候选模块经 ensureClioWorksV51Modules 惰性加载，产品启动路径未调用——fixture 图表分支自行 loadScript，成品普通启动中上下文条不出现 | ✓（7e6259573） | `clioworks-v51-context-strip`（17 断言） |
| CW51-04 | **第一条实现路径**：chart-frame-port 桥 FrameSession 到 ClioChart 真实表面（草稿=引擎序列化文本；编辑=确定性重放；提交=引擎自身 history+write-back，owner 围栏算数；冲突守卫基线钉在打开时刻）；候选未接产品面 | ✓（40d014a8a） | `clioworks-v51-chart-frame`（16 断言） |
| CW51-05 | 保存重开保留回归——**数据层快车道**（0.035s/合同）：body 按 saveClioChartAsDocument 组成、重开走桌面 find/parse 形状；原生对象/notes/未改部分逐字节/身份不变、放弃零残留全部钉住 | ✓（fa06e6300） | `clioworks-v51-save-reopen`（10 断言） |
| CW51-06 | 副本范围内扩表格（add-row/remove-row/add-column——删行同步删 LINE；每次结构采用=一次父 Undo）与图片区域锚（元数据经引擎 history 落地，源图字节从不是重放输入） | ✓（7970b59fd） | `clioworks-v51-table-image-scope`（14 断言） |
| CW51-07（数据层） | commandState 矩阵**跨十二主题不变**（12×19 零分歧；矩阵不命名主题）；键盘/IME 门是上下文事实（COMPOSING/MODAL_OPEN 具名区分；mayRestoreFocus 不禁用命令）；目录是按钮/键盘唯一命令源 | ✓（3aaf1aff1） | `clioworks-v51-themes-keys`（12 主题 × 19 命令） |

全量特性车道 505/505（含 v51 七合同）。floppy 余量写作时为 730，HEAD 实测 588（后续接线消耗）——距 512 保留地板仅 76 字节，**接线新面时优先 vm 合同，慎增 eager 字节**（v5.1 loader +512 记录在 runtime-manifest 常量旁）。

## 浏览器与工具车道结果（2026-10-11 实测，本机 Chromium for Testing）

包自带的两个浏览器检查**实际跑过**（venv playwright + 本机 chromium-1243，未下载任何浏览器）：

1. `tools/check-browser.py`：**27/27 通过**（含 v5.1 扩展挂载、`.cw5-context` 上下文条、副本编辑/预览/采用/撤销路径）。
2. `tools/check-host-contract.py`：**12/12 通过**（宿主合同挂载）。
3. `tools/verify-v3-baseline.mjs`：5/5 matches-patched。
4. `tsc --noEmit --strict`（contracts/native-ports.d.ts）：0 错误。

仍未运行（诚实保留 not_run）：**十二真实主题的实际渲染**（检查脚本用合成编辑器与参考材料，不是主题册的 12/12 重照）、**真实中文 IME 的组字实测**（脚本不含真实输入法事件）、**真实保存 UI 端到端**（保存菜单→文件落盘→Finder 重开）。这三项在包的证据边界内本就标注为"未运行"，与 vm 数据层合同互不冒充。

复现：`python3 -m venv /tmp/cw51-venv && /tmp/cw51-venv/bin/pip install playwright`，然后以 CHROMIUM_PATH 指向本机 ms-playwright/chromium-1243 的 Chrome for Testing 运行上述两个脚本。

## feature manifest 登记决策（CW51-08 补记）

v51 七个合同**不登记**进 tests/feature-manifest.mjs：登记语义是"随公共快照发布的
public-safe 合同"（tests/features/public/*），而 v51 合同在私有树且候选模块未接产品面——
现在登记会制造"摘要声称覆盖、公共快照无文件"的假覆盖。接线后若要登记，需将合同移入/
复制到 tests/features/public/ 再登记（探索报告已给条目草稿）。v4 的 10 个测试同判，待定。

## 给下一位执行者的话

- `git add -A` 会把别的代理会话留在 internal/plans/creator-blueprint 与
  .zcode/plans 的未跟踪文件卷进提交——已发生两次（fa06e6300、
  7970b59fd），各自单独提交拆出。提交前用 `git status --short` 核对清单。
- vm 快车道是本仓验收的默认车道；浏览器只在验收焦点/渲染/IME 时使用。
- 补丁迁移用 hunk 级手术+byte 比对收尾；verify-v3-baseline 的
  matches-original/matches-patched 判定以 baselines.json 为准。
