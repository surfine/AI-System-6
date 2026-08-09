<!-- canonical-source: docs/RELEASE-SMOKE.md -->
<!-- source-sha256: 833cb368c09d1a2210d1f75046841edd33d2f96bf959f06144c2a8efc36a756f -->

英文版为准。本文档仅供人类参考。

# 发布前冒烟检查清单

发布前冒烟是发布前几分钟的人工快速检查，用来捕捉明显的 UI 回归。它刻意
**不自动化**：发布条件是本机快速门禁（`npm run verify:ship`），这份清单是
其之上的人工目检层。不要把它变成浏览器 E2E 套件。

## 完成路径

记录耗时、阻塞页面，以及需要开发者解释的时刻。这些是人工路径，不要把它们
自动化成 E2E 测试。

### A. 全新 Web

- [ ] 清除站点数据，不阅读文档直接打开网址。
- [ ] 从 Start Here 选择 Write a Short Draft。
- [ ] 未挂载项目时，只新建一次项目，回到 Draft Desk 且第一个写作输入框获得焦点。
- [ ] 输入三行素材，手写或生成正文，保存，然后 Download Markdown。
- [ ] 记录总步骤数、弹窗数、解释次数与耗时。目标：零开发者解释，必需设置界面不超过一个。

### B. 无模型

- [ ] 断开所有模型，打开 Draft Desk，手写、保存、刷新、Continue，然后下载 Markdown。
- [ ] 确认整条路径不需要打开 Control Panel 也能完成。

### C. 模型配置损坏

- [ ] 保存一个缺失的本地模型或无效的云端配置，然后刷新。
- [ ] 确认桌面正常就绪、项目与非 AI 应用可用，且 Reset AI Connection 只修复模型设置。

### D. iPhone Web

- [ ] 在 iPhone Safari 中打开 Draft Desk，写作、保存、刷新、Share。
- [ ] 使用 Share → Add to Home Screen，从图标启动，并重复基本写作路径。

## 回归检查清单

- [ ] 启动 AI System 6，桌面启动到 Finder。
- [ ] 新建一个 Project Hard Disk（或挂载已有项目）。
- [ ] 打开 钟点稿 / Quick Draft。
- [ ] 输入标题、一句“我想说的话”和少量素材。
- [ ] 保存；状态栏显示 Saved。
- [ ] 打开一个 Adjustment Layer 并设置强度。
- [ ] 保护一个段落，然后 Preview（Apply）合成结果。
- [ ] 把合成结果写入正文；之前的正文出现在 Versions 下并可恢复。
- [ ] 保存到 Project Hard Disk；打开已保存文档并确认正文。
- [ ] 刷新页面；草稿、视图、图层栈、保护范围、选区与滚动位置都恢复。
- [ ] Project CD 与 TeachText 基础功能仍可打开并正常工作。

任何破坏点都是发布阻断：原因是人工可见的回归，而不是自动化偶发。如果某一步
需要长时间准备或模型，请注明，并让整个检查控制在几分钟内。
