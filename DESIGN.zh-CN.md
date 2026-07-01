<!-- canonical-source: DESIGN.md -->
<!-- source-sha256: bca19992c4f7e81824e739e5271325881e6a308fedd8ba9be7a8c3c3c2d20913 -->

# AI System 6 设计说明

英文版为准。本文档仅供人类参考。

AI System 6 是产品界面，不是落地页。它应该像一张安静的写作桌：可读、克制，并且在有用的地方保留一点老派。

Macintosh System 6 是约束，不是装饰。优先使用具名对象，而不是抽象 AI 控件。优先显示真实状态，而不是隐藏自动化。除非操作真的发生，不要暗示已经保存、摘录、搜索、索引、检查或导出。

## 原则

- 先让第一条写作路线清楚：Project Hard Disk、File Floppy、Question Sheet、Outline、Section Drafts、Manuscript、Review Desk、Project CD。
- 新增 UI 前，优先复用已有窗口、按钮、列表、pane、modal 和 Finder 对象。
- 稠密工具表面可以接受，营销页式布局不适合。
- Classic 和 Liquid Glass 是同一对象语法的两套皮肤，不能改变用户的任务顺序。
- UI 文案要直接说对象和动作：保存草稿、导出 PNG、删除项目、摘录来源。

## 主题

Classic 使用锐利的 System 6 风格 chrome、位图资产和清楚对比。Liquid Glass 可以使用半透明和模糊，但文字必须可读。

主题工作优先走 token：

1. 默认值放在 `styles/00-foundation.css`。
2. Liquid Glass 的值放在 `styles/70-liquid-glass.css`。
3. 复用同一套 DOM 和行为。

除非 token 表达不了差异，不要复制一套主题选择器。

## 布局

pane 用 CSS Grid，行和按钮组用 Flexbox，间距用 `gap`。重复几何值放进 token。避免任意 `z-index`、新的布局 `!important`、嵌套卡片和 JS 布局样式。

卡片只用于重复条目、modal 或确实需要框住的工具。页面区域不要变成装饰卡片堆。

## 交互

交互控件需要 default、hover、focus、active、selected、disabled、loading、empty 和 error 状态。动效用于解释状态，不用于装饰页面。transition 保持短，并遵守 `prefers-reduced-motion`。

## 修改 UI 前

先问：

1. 这是哪个产品对象？
2. 它属于主写作路线，还是被召唤的工具？
3. 哪个现有 primitive 可以承载它？
4. Classic 和 Liquid Glass 有什么不同？
5. 哪个测试或截图能说明改动仍然成立？

至少运行：

```sh
npm run build:app
npm run verify:css
npm run verify:features
```
