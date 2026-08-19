<!-- canonical-source: docs/design/APPEARANCE-QA.md -->
<!-- source-sha256: 65082317e42f1460ed0ea8702a2059d3f39723c75a11a17dabc96d98d96dcb03 -->

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

当前 floor 状态（2026-08-17 实测，非估计）：

| Board | specimen 数 | 达到 floor | 已记录差距 | reference 不可用 |
| --- | --- | --- | --- | --- |
| Platinum | 20 | 12 | 5 | 3（图标材质，裁切自照片缩略图） |
| Aqua | 16 | 16 | 0 | 0 |
| Snow Leopard | 17 | 17 | 0 | 0 |
| Yosemite | 19 | 6 | 13 | 0 |
| Yosemite 2x | 5 | 4 | 1 | 0 |

### 控件状态覆盖

只要已 pin 的 canonical source 中带有该状态，每块 board 都 pin 一个 disabled 或
focus 状态。其中两个 specimen 直接查出了真实的 painter 缺陷——这正是状态覆盖的
目的：

| 状态 | Platinum | Aqua | Snow Leopard | Yosemite |
| --- | --- | --- | --- | --- |
| disabled 按钮 | `button-disabled`（达到 floor） | `button-disabled`（达到 floor） | — | — |
| disabled 列表行 | — | `list-row-disabled`（达到 floor） | — | — |
| disabled 复选框 / 单选框 | — | — | `checkbox-disabled`、`radio-disabled`（达到 floor） | — |
| focus ring | — | `search-field-focused`（达到 floor，完全一致） | `search-field-focused`（达到 floor） | `search-field-focused`（达到 floor） |

Aqua 与 Snow Leopard 的 focus ring 本来就是对的——Aqua 对照原生 10.2 截图测得
0/0/0。只是 Theme Lab 显示不出来：它的静息 search-field 规则特异性为 (0,2,1)，
对 Snow Leopard 压过了共享的绘制式 focus 规则 (0,2,0)，对 Aqua 与其 focus 配方
(0,2,1) 同级并靠文档顺序取胜。真实 `:focus` 从未受影响，因为时代的 `:focus`
配方位于 (0,2,2)。修复方式是在 `apps/desktop/styles/66-theme-lab.css` 里加一条只作用于实验室
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

### Yosemite 参照物审计（2026-08-17）

Yosemite 每一处差距都回溯到了它实际比对的像素。有六个 specimen 指向的裁剪里
根本没有它声称要测的控件——当时固定的三张来源（Finder 窗口、苹果菜单、
System Preferences General 面板）里没有推按钮、文本框、对话框、非活动窗口
和选中列表行。现在又从同一个 512 Pixels 图库固定了四张 10.10 截图，
受影响的 specimen 已重新配准到真实控件：

| Specimen | 旧参照 | 新参照 | 结果 |
| --- | --- | --- | --- |
| `textfield` | 空白窗口底 | Get Info 的「Add Tags」文本框 | 材质 36.7 → 0，**达到 floor** |
| `button-default` | Appearance 弹出按钮蓝色块的一角 | Force Quit 默认按钮 | 材质 78.4 → 17.2，轮廓已精确 |
| `inactive-titlebar` | **活动**状态的红黄灯 | Mail 的背景窗口 | 材质 66.4 → 12.3，轮廓已精确 |
| `list-selected` | Finder 文件夹图标顶部 | Force Quit 选中行 | 暴露出真实画笔缺陷，已修：材质 91.8 → 10.2 |
| `dialog` | 同一条空白 | Empty Trash 警告框主体 | 变成真实差距：fixture 警告框内容不同，轮廓差在版式 |
| `menu-selected` | 裁剪比高亮行高 6pt | 同一张截图，重新配准 | 材质 45.5 → 6.2 |

错误的参照物同时也造出了一个错误的 token。Yosemite 的
`--theme-lab-list-selected-bg` 原为 `#97ddfd`，注释写着「从 10.10 原生 Finder
截图测得」——但那张截图是图标视图、没有任何选中项，`#97ddfd` 是文件夹图标的
标签页，正是旧裁剪覆盖的那些像素。10.10 的聚焦列表选中态是实心 `#116cd6`
配白字，从 Force Quit 列表测得。token 已改为该值，fixture 读数 10.2。

仍有两个没有有效证据：

- `button-pressed`——按下态是瞬时状态，图库里的静态截图都拍不到。
- `segmented-control`——参照是弹出按钮，当前侧是选中的单选框，两边测的是不同
  控件。Finder 工具栏的视图模式组才是真正的 10.10 分段控件，等 fixture 侧改成
  分段控件后可以用它作参照。

另有三处属于配准或证据质量问题，不是画笔债务：`search-field` 拿原生 325pt、
占位居中的搜索框中段，去比 150pt、占位左对齐的 fixture；`sidebar-active` 与
`sidebar-inactive` 固定的是未选中的 Downloads 切片，fixture 显示的却是选中态；
`checkbox-checked` 与 `radio-checked` 比的是 GTK 克隆字形，不是原生 10.10 美术。

Yosemite 是当前公开的 fidelity 债务：19 个 specimen 中有 13 个未达到 floor。
它的窗口与控件 reference 已是 10.10 原生截图；只剩复选框、单选框和标题按钮
字形仍在比 GTK 仿制资源。System 6 与
Liquid Glass 没有历史截图 target，继续使用各自的设计契约加回归基线；不为它们
伪造 fidelity board。
Liquid Glass 正在通过现有主题 ID 与材质 token 重校到 macOS 27 Golden Gate；它
不会新增主题或主题家族。
`npm run verify:appearance-apps` 另行在六套外观下渲染 Finder、Page Setup、
TeachText、Scrapbook、Liquid Cover 与 Endfield Terminal，证明普通 App 与视觉
特殊 App 都收到同一套系统 title bar painter；这个传播检查不与像素回归或历史
fidelity 混为一谈。

每个表面的 QA 标准：无裁切、无不清晰文字、无错误对比度、无坏焦点、无错误
图标、无损坏的窗口边框。
