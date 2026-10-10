<!-- canonical-source: docs/clioworks/v4.2/adapter-map.md -->
<!-- source-sha256: d979bd11cc3bb19937fac10126639c43d92c36f20ffee9ec5a35926261f80b9b -->

> 英文版为准。本文档仅供人类参考。

# ClioWorks v4.2 + v4.1 补充 — 实际工作区映射（D42-00 / G41-00）

日期：2026-10-10。状态：设计落地轮的实际映射；设计审批 pending_review，
本轮一切新增界面按「隔离/合同先行」推进。

依据：`ClioWorks-Design-System-v4.2.zip`（00-EXECUTOR-PROMPT、01-DESIGN-SPEC、
contracts/）与 `ClioWorks-GenOffice-Addendum-v4.1.zip`（采用补充、audit-adapter
合同）。两包核对值：AI System 6 `478d6c49…` 不在本地历史（与 v4 轮相同，
公开快照未 fetch，不 reset）；GenOffice `1ca5e9ad…` 未 fetch——本轮增量
（ClioStage 实测布局检查）不加载 GenOffice，audit-adapter 为本包自带的
独立候选（v4.2 reference/ 与 v4.1 src/ 逐字节一致，sha256
`79288fbe232922251335426a28c57b436765d77e4301cdd2e64efb390e40a7e6`）。

## 一、实际 HEAD / 分支 / 未提交

- 工作区 `the executor workspace`，分支 main，HEAD
  `f2809c2f7`（v3 整合提交，未变）。
- 未提交：v4 轮全部成果（vendor vibeoffice 三 codec、适配器×3、native-host、
  十个合同测试、证据目录 clioworks-v4-20261010）+ 并行会话的 web 发布清单
  补齐（package.json / install-release.sh / deploy-web.mjs /
  check-release-assets.mjs / verify-web-release-safety.mjs / fixture.js 引号）。
  本轮不覆盖、不 reset。
- v4 轮任务态：V4-00..V4-11 已交付（V4-08 PDF 引擎 not_run），证据在
  `internal/evidence/drafts/clioworks-v4-20261010/INDEX.md`。

## 二、两包任务对本地现状的映射

| 包内任务 | 本地已有对应物 | 本轮做法 |
| --- | --- | --- |
| G41-00 源码切片/许可映射 | vendor/vibeoffice（Apache-2.0，锁定 4c011173，偏离四处在案） | GenOffice 本轮不引入源码；audit-adapter 为 kit 自带独立候选 |
| G41-01 / D42-02 ClioStage 实测布局检查 | clio-stage.js 真实 placement 系统（clio-place 指令、clioStageWithPlacement 往返、clioStageSetPlacement 一次可撤销步、clioStageSlideContext 测量上下文、clioStageFrameMetrics 单位换算） | 新 lazy 特性 `clio-stage-audit.js`：真实 DOM 测量 → audit-adapter 合同 → 检查面板（主仓材料） |
| D42-01 实际样式对照 | style-manifest 十二主题 + theme-registry | kit 的 host_lab.py 只读对照已跑（见证据），Python Playwright 缺席由 Node 驱动等价替代并记录 |
| D42-03 候选几何采用闭环 | 同上 setPlacement/history | 预览=DOM 临时几何；采用=setPlacement（一次撤销）；失败注入；重查 |
| 「现有 writer 输出 PPTX」 | vendor/vibeoffice/lectern（M.newPresentation/T.body/newSlide） | stage→presentation 桥（实测几何→可编辑原生文本 shape），单一保存拥有者=Lectern writer |
| D42-04..08、G41-02..06 | — | 本轮不开工；逐项留在 not_run 台账 |

## 三、边界重申（两包执行提示交集）

- 生产挂载用主仓窗口/按钮/输入/菜单/对话框；panels.js 的 confirmFallback
  只属原型；demo/* 与顶部六页导航不入产品。
- workflows.js 是合同不是文档模型；audit-view 标签进 i18n；不串联多个 writer；
  一份文件一个当前保存拥有者（PPTX 归 Lectern 路径）。
- 采用按钮的身份检查：文档/会话/代次/编辑版本/布局结果/字体摘要全一致才启用；
  真正提交走原有原子路径（clioStageSetPlacement → clioStageEditDeck →
  共享 edit-history 一次步）。
- 不信任模型传来的 confirmed:true；布局修复仅几何；数字/引文/字号不改。

## 四、本轮登记的 not_run（开工前基线）

- GenOffice 源码采用/编译（本轮不加载；audit-adapter 为独立候选）。
- Office/Safari/IME/真实移动键盘：沿 v4 台账。
- D42-04 逐页候选、D42-05 模板填写、D42-06 Reader 提取、D42-07 交付范围、
  D42-08 新增工作面整体验收：未开工。
