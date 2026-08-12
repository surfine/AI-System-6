<!-- canonical-source: docs/APPEARANCE-QA.md -->
<!-- source-sha256: e11177ab6ee3e474847cd9c18fa0a0365a0dec95a72ef5ba73578fe7d1054f7c -->

英文版为准。本文档仅供人类参考。

# 外观 QA 矩阵

AI System 6 正式支持的外观面为全部六套：

| 表面 | Classic / System 6 | Platinum | Aqua | Snow Leopard | Yosemite | Liquid Glass |
| --- | --- | --- | --- | --- | --- | --- |
| 启动 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Start Here | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Finder | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Applications | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Project Hard Disk | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| File Floppy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Draft Desk | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Writing Studio | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TeachText | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Review Desk | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ClioTalk | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Control Panel | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 系统弹窗 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 菜单栏 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 手机布局 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

六套都是正式外观（注册表 `releaseReady: true`），在 Control Panel 的
Appearance 选择器与 Special 菜单中开放；没有任何一套被研究开关门控。四套
历史外观还须通过 `npm run verify:theme-lab:fidelity` 对已 pin 的 canonical
reference 校验。该命令检查两个互不混淆的层级：来自记录运行的 `tolerances`
（回归层），以及共享的 `FIDELITY_FLOOR`（与时代目标的绝对差距层）。每个
specimen 在自己的 `floor` 台账中声明所处状态，因此一块 board 不可能一边远离
reference、一边自称 canonical。详见
[THEME-FAMILY-CONTRACT.zh-CN.md](THEME-FAMILY-CONTRACT.zh-CN.md) 第 9 节。

当前 floor 状态（2026-08-11 实测，非估计）：

| Board | specimen 数 | 达到 floor | 已记录差距 | reference 不可用 |
| --- | --- | --- | --- | --- |
| Platinum | 20 | 12 | 5 | 3（图标材质，裁切自照片缩略图） |
| Aqua | 16 | 11 | 5 | 0 |
| Snow Leopard | 17 | 10 | 7 | 0 |
| Yosemite | 19 | 4 | 15 | 0 |
| Yosemite 2x | 5 | 1 | 4 | 0 |

### 控件状态覆盖

只要已 pin 的 canonical source 中带有该状态，每块 board 都 pin 一个 disabled 或
focus 状态。其中两个 specimen 直接查出了真实的 painter 缺陷——这正是状态覆盖的
目的：

| 状态 | Platinum | Aqua | Snow Leopard | Yosemite |
| --- | --- | --- | --- | --- |
| disabled 按钮 | `button-disabled`（达到 floor） | `button-disabled`（差距：整个胶囊缺失） | — | — |
| disabled 列表行 | — | `list-row-disabled`（差距：行形状缺失） | — | — |
| disabled 复选框 / 单选框 | — | — | `checkbox-disabled`、`radio-disabled`（差距：仍保留蓝色填充） | — |
| focus ring | — | `search-field-focused`（达到 floor，完全一致） | `search-field-focused`（达到 floor） | `search-field-focused`（达到 floor） |

Aqua 与 Snow Leopard 的 focus ring 本来就是对的——Aqua 对照原生 10.2 截图测得
0/0/0。只是 Theme Lab 显示不出来：它的静息 search-field 规则特异性为 (0,2,1)，
对 Snow Leopard 压过了共享的绘制式 focus 规则 (0,2,0)，对 Aqua 与其 focus 配方
(0,2,1) 同级并靠文档顺序取胜。真实 `:focus` 从未受影响，因为时代的 `:focus`
配方位于 (0,2,2)。修复方式是在 `styles/66-theme-lab.css` 里加一条只作用于实验室
的规则，仅提供 ring，因此各时代保留自己的 search-field 圆角、内边距与背景。

尚未 pin 的状态缺口，以及各自的原因：

- **Platinum 的 focus ring。** Mac OS 9 的聚焦边框在已缓存的 Sherlock 2 截图里，
  但它不是已 pin 的 source。pin 它需要先确认 canonical URL，不能猜。
- **Yosemite 的 disabled 状态。** 已 pin 的 10.10 source 中没有任何 disabled 控件。
  要么 pin About This Mac 截图（其中禁用的缩放灯），要么 pin GTK 仿制资源的
  insensitive 资产，证据层级与 Yosemite 其他控件 reference 相同。
- **所有时代的 hover。** 没有任何已 pin 的静态截图包含指针 hover 状态。最接近的
  时代等价物是菜单高亮，已由 `menu-selected` / `menu-selected-item` 覆盖。新增
  hover specimen 需要新的证据来源和 harness 的 hover 步骤；凭空编造就是伪造
  fidelity。

Yosemite 是当前公开的 fidelity 债务：19 个 specimen 中有 15 个未达到 floor，
而它的控件 reference 是 GTK 仿制资源，不是 10.10 原生截图。System 6 与
Liquid Glass 没有历史截图 target，继续使用各自的设计契约加回归基线；不为它们
伪造 fidelity board。
`npm run verify:appearance-apps` 另行在六套外观下渲染 Finder、Page Setup、
TeachText、Scrapbook、Liquid Cover 与 Endfield Terminal，证明普通 App 与视觉
特殊 App 都收到同一套系统 title bar painter；这个传播检查不与像素回归或历史
fidelity 混为一谈。

每个表面的 QA 标准：无裁切、无不清晰文字、无错误对比度、无坏焦点、无错误
图标、无损坏的窗口边框。
