<!-- canonical-source: docs/design/THEME-FAMILY-CONTRACT.md -->
<!-- source-sha256: df7edeeb70445415e088744f332b7baf9adfe204c9a5b8754de64c64d6a2f176 -->

英文版为准。本文档仅供人类参考。

# 主题家族契约

AI System 6 只维护**三个外观家族**，而不是六套互相独立的主题。新增一个
app、面板、对话框或系统控件时，只针对共享对象语法和它所属的家族写一次，
派生外观会自动获得对应时代。

| 家族 | 父外观 | 派生外观 |
| --- | --- | --- |
| Classic | Classic / System 6 | Platinum |
| Aqua | Aqua | Snow Leopard |
| Liquid Glass | Liquid Glass | Yosemite |

本契约是每一次主题编辑的常设规则。它由注册表
(`app/core/theme-registry.js`)、CSS 预算
(`scripts/css-budget.json`、`scripts/verify-css.mjs`) 与功能契约
(`tests/features/appearance-system.test.mjs`) 共同强制。

## 1. 继承关系，而不是第二套主题

`app/core/theme-registry.js` 是主题元数据的唯一来源：

- `family` 命名三个维护根（`classic`、`aqua`、`liquid-glass`）。
- `recipeBase` 命名父配方。子主题从父配方出发，只拥有显式增量：
  `classic → platinum`、`aqua → snow-leopard`、`liquid-glass → yosemite`。
  Aqua 与 Liquid Glass 各自是根。
- 注册表在首帧绘制前把 `data-theme`、`data-theme-family`、
  `data-theme-base` 投影到 `html` 与 `body` 上。
- `getRecipeChain(themeId)` 返回有序继承链；成环是注册表 bug，会抛错。

只有 Liquid Glass 家族携带 `use-liquid-glass` 皮肤类。Aqua 与 Snow
Leopard 直接在 `body[data-theme="..."]` 下拥有自己的规则；它们不得继承
玻璃皮肤。

## 2. 子主题从父主题继承什么

派生外观无需重新实现即可继承：

```text
DOM 结构
交互行为
布局语义
组件结构
应用集成
响应式行为
无障碍
状态处理
```

子主题只在时代确实不同的地方覆盖：

```text
几何
字体
颜色
边框
斜面
渐变
阴影
选区
滚动条
图标体系
窗口镶边
时代专属材质
```

## 3. 主题代码放在哪里

- `styles/00-foundation.css` —— 唯一的顶层 token 块（`:root`）。Classic
  默认值留在这里。
- `styles/65-appearance-themes.css` —— 时代参数表、家族配方与子主题增量。
  每个时代的配方选择器只允许出现在这里，受 `appearanceThemeSelectorLimit`
  上限约束，必须引用真实基础原语，且不得跨主题复制。
- `styles/70-liquid-glass.css` —— 仅 Liquid Glass 材质。
- 当并行工作流冲突时，Appearance 文件可以机械拆分为家族专属文件（例如
  `styles/67-aqua-appearance.css`）。拆分必须**视觉零差异**且单独提交，
  绝不夹带重新设计。
- `styles/66-theme-lab.css` —— 一份共享的 Theme Lab 组件样式表，而不是
  六份实现。它的每一条选择器都限定在实验室内部，因此这份样式表会被单独构建成
  `styles.theme-lab.css`，随懒加载的 Theme Lab 模块一起请求，而不是在启动时加载。
  不要把它放回 `styleRuntimePaths`：它是仓库里最大的一份样式表，而任何一次启动都
  不需要它。

父链是维护血缘，不是第二个生效的 CSS 类。家族共享配方使用
`body[data-theme-family="..."]`；子主题自身块通过更高特异性的
`body[data-theme="..."]` 胜出。

## 4. App CSS 永远不认识子主题

应用 CSS 消费语义系统角色：

```css
.some-app-toolbar {
  background: var(--toolbar-bg);
  border-bottom: var(--toolbar-border);
}
.some-app-list .is-selected {
  background: var(--selection-bg);
  color: var(--selection-fg);
}
```

确实需要家族配方时，使用家族轴：

```css
body[data-theme-family="classic"] .some-system-pattern { ... }
```

永远不要：

```css
body[data-theme="platinum"] .draft-desk ...
body[data-theme="platinum"] .reader ...
body[data-theme="platinum"] .clio-talk ...
```

如果新 app 必须写 `body[data-theme="platinum"] .new-app`，请停下：该 app
没有消费共享原语或语义 token。

## 5. 系统角色优先于 app 专属 token

重复出现的视觉语义下沉为系统角色，而不是按 app、按时代各写一份：

```text
--system-raised-surface        --system-inset-surface
--system-frame-border          --system-inset-border
--system-primary-divider       --system-secondary-divider
--system-selection-bg          --system-selection-fg
--system-disabled-fg
--system-group-box-border
--system-toolbar-surface       --system-status-surface
```

app token（`--message-divider`、`--review-divider`、`--scrap-divider`）
映射到拥有该视觉含义的角色。家族只需回答一个问题（“Mac OS 9 的
secondary divider 长什么样？”），而不是每个 app 一个问题。

首批已落地的映射（保持取值不变，视觉零差异）：

```text
--system-primary-divider
    Classic  : 1px solid var(--ink)
    Liquid   : 1px solid rgba(16, 17, 20, 0.1)

--pane-actions-border-bottom  = var(--system-primary-divider)
--documents-toolbar-border   = var(--system-primary-divider)
```

`--system-secondary-divider` 已落地：点线/浅色 app 分隔线
(`--message-divider`、`--action-row-divider`、`--import-row-border-bottom`、
`--scrap-list-item-divider`、`--clio-assembly-divider`、
`--chat-transcript-article-border`) 全部别名到该角色，每个家族只拥有一个值
（Classic/Platinum：`1px dotted var(--shade-dark)`；Liquid：
`1px solid rgba(16, 17, 20, 0.1)`）。已验证收敛无外溢：六时代 Theme Lab
regression 全部 0 像素、Classic/Liquid computed snapshot 稳定、默认窗口态
像素扫描无可测变化（此前各 app 取值漂移——例如 Liquid Scrapbook 的 `0` 与
0.1 hairline 之差——已按设计并入家族值）。

重复的边框拼写已别名到既有的 `--system-border` 角色（18 个 app token：review、
outline、draft、field、icon、tdi、memory-card 等家族）。每个作用域都保持取值
不变：Classic 走同一单位墨线规则，Liquid 保留各 token 自身钉住的覆盖值，
modern-fonts 仍解析为 1.5 单位。

## 6. 子主题配方可以做什么、不可以做什么

子主题可以为自己的身份拥有**系统级配方**：

```text
platinum-titlebar-stripes
platinum-window-frame
platinum-bevel-button
platinum-default-button
platinum-tabs
platinum-scrollbar
platinum-balloon-help
platinum-selection
```

子主题**不得**拥有应用配方：

```text
platinum-draft-desk-card
platinum-reader-sidebar
platinum-clio-button
platinum-cmf-toolbar
```

`verify:css` 强制这一点：子主题选择器的基础部分引用已注册的 app 窗口类
时，计入 `childAppSpecificSelectorLimit` 且只许减少（基线 0）。真正属于
系统级历史例外的，只能通过 `scripts/css-budget.json` 中的
`childAppSpecificAllowlist` 放行，并在提交中写明理由。

## 7. 父主题变更必须测试子主题

修改家族时自动测试整条分支：

```text
Classic 家族   ->  Classic + Platinum
Aqua 家族      ->  Aqua + Snow Leopard
Liquid Glass   ->  Liquid Glass + Yosemite
共享内核       ->  全部六套
```

Classic → Platinum 成对回归即 canonical fidelity 工具
(`npm run compare:theme-lab:canonical`) 加 Theme Lab 快照
(`npm run verify:theme-lab`)。共享基础设施的修改单独提交，不携带任何
子主题专属值，并跑六主题回归。

## 8. Golden master

当前 Platinum 输出是 golden master。架构重构必须做到**视觉结果不变、
维护耦合更少**；针对真实 Mac OS 9 参照的保真修正属于后续独立步骤。共享
Theme Lab DOM 有意变化时，在同一次修改里刷新各主题保真 fixture 的
`contentSha256`——绝不让 fixture 指纹过期。

## 9. 两个视觉层级，绝不混为一谈

稳定的快照不能证明正确：错误的设计也可以拥有完美的回归基线。两个层级回答
两个不同的问题，存放位置也不同。

| 层级 | 问题 | 位置 | 何时失败 |
| --- | --- | --- | --- |
| 回归 | 今天和昨天一样吗？ | `tests/visual/theme-lab/*.png`，以及每个 specimen 的 `tolerances` | 输出偏离了记录运行 |
| Canonical fidelity | 这真的是目标时代吗？ | `scripts/theme-lab-fidelity-contract.mjs` 中的 `FIDELITY_FLOOR`，以及每个 specimen 的 `floor` 台账 | 某个 specimen 与已 pin 的历史 reference 的差距超过 floor |

floor 对所有时代、所有 specimen 只有一套共享常量，由指标定义推出，**绝不**
来自我们自己的输出：

```text
geometryMismatch  <= 0.05   reference 轮廓最多允许 5% 完全缺失
edgeErrorPx       <= 1.5    1x 下轮廓落在 1.5px 内
                            （按 board 的 deviceScaleFactor 缩放）
materialError     <= 12     内部颜色差在 255 的 12 以内（约 4.7%）
```

每个受门控的 specimen 都带一份 `floor` 台账：

```text
{ "status": "met" }
{ "status": "gap", "failing": ["materialError"], "note": "<历史原因>" }
{ "status": "unreliable-reference", "exempt": ["materialError"], "note": "<为何该裁切无法测量>" }
```

- **未**列出的指标必须达到 floor，否则 gate 失败。
- `failing` 中的指标是与目标距离的记录，并写明原因。它是诚实记账，不是许可。
- `exempt` 表示已 pin 的裁切根本无法测量该指标（例如 reference 是照片缩略
  图）。这是唯一的豁免口，且必须写明原因。
- 当某个 `failing` 指标开始达到 floor 时，gate 会**失败**，直到台账被修正；
  这样任何改进都不可能躲在过期条目后面。

绝不为了让 board 变绿而放宽 tolerance、新增 `failing` 指标或动用 `exempt`。
要么修 painter，要么改进 reference 后重新测量。

## 10. 验证

```sh
npm run verify:css                      # 预算、ratchet、选择器上限
npm run verify:theme-lab                # 六时代 Theme Lab 回归快照
npm run verify:theme-lab:fidelity       # canonical fidelity：四时代 + Retina board
npm run compare:theme-lab:canonical     # 单块 board，附评审产物
npm run audit:theme-coverage            # 注册表驱动的 app 覆盖审计
npm run screenshot:windows              # 逐个截图每个已注册窗口
npm run snapshot:css -- --theme platinum --label <step>   # 共享表面
npm run verify:features -- appearance-system   # 注册表与契约测试
npm run verify:features -- theme-lab-fidelity-contract   # fixture 与 floor 模式
```

覆盖证据全部注册表驱动：`audit:theme-coverage` 回答选择器/token 问题，
`screenshot:windows` 逐个捕获每个已注册窗口的镶边与空状态，
`snapshot:css`（现已支持 `--theme platinum`）捕获共享表面集。Classic 与
Platinum 用同一 label 成对运行，即父主题变更的机器可读前后对比。

目标：开发者脑子里只有三个家族，绝大多数 app 只消费语义 token，再增加
十个 app 也不需要再维护十份子主题补丁。
