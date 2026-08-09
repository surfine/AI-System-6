<!-- canonical-source: docs/historical-ui-mapping.md -->
<!-- source-sha256: f2d824a9e267d46e492b2f874d28447fad9d3354724791d6dd4c86b63ab38b04 -->

英文版为准。本文档仅供人类参考。

# 历史界面映射

本文档约束 AI System 6 中**没有直接历史对应物**的界面，在五套外观
（Classic / Platinum / Aqua / Snow Leopard / Yosemite，外加作为非历史玻璃
皮肤的 Liquid Glass）里如何绘制。这是执行代理的工作契约：**能力可以来自
2026 年，但视觉语法必须属于目标年代。**

配套证据：`drafts/appearance-external-research.md`（Quaqua / 512 Pixels /
GTK / Web 参考测量）、`tests/visual/theme-lab-fidelity/*`（harness 与评审板）。

---

## 1. 没有历史参考时的执行规则

1. **存在直接历史对应物** -> 复刻它。窗口 chrome、菜单栏、菜单、工具栏、
   按钮、默认按钮、复选框、单选、文本框、搜索框、弹出按钮、标签页、分段
   控件、滚动条、列表、源列表/侧栏、选中态、对话框、sheet、进度指示器必须
   匹配真实系统或成熟复刻（Quaqua / GTK 主题 / 历史产品 CSS），harness 能
   测的地方做到像素级。
2. **没有同名控件，但存在同年代近似 Apple 软件** -> 借它的布局与组织方式，
   不借功能名。见第 2 节的年代参考矩阵。
3. **连相似软件都不存在** -> 只允许使用该年代真实存在的 UI primitives 重新
   组合。绝不允许因为功能是现代的就发明现代界面。

现代能力语义、数据结构、工作流保持现代。控件、几何、字体、间距、层级、
窗口组织、交互提示、材质必须属于目标年代。

**两种验收标准分开：**

- **A. 有直接参考的系统控件** -> 参考精度：参考截图、overlay、pixel diff
  （theme-lab-fidelity harness）。
- **B. AI System 6 独有界面** -> 历史可信度：问题不是"和哪张截图一样"，
  而是"把这张截图混进该年代真实截图集，哪些地方最先暴露它是 2026 年设计
  的"。逐项修复发现的穿帮点。

**不允许"统一设计语言"覆盖历史差异。** shared DOM 与共享组件架构可以统一；
同一概念的视觉表达可以按年代不同（例如 Attached Sources：Mac OS 9 用带框
列表、Jaguar 用 Aqua 列表/抽屉、Snow Leopard 用源列表/表格、Yosemite 用
半透明侧栏）。

**无多模态执行模型规则：** 无法查看截图的模型不得凭文字宣布视觉完成。它负责
读参考实现、改 CSS、跑 Theme Lab 与 diff harness、修最大测量误差，并且只能
用已确认的 shared recipe 加本映射去拼装没有参考的界面。它不能自己判断
"这样大概像 2002 年"。

---

## 2. 年代参考矩阵

| 年代 | 要研究的参考应用 | 规范来源 |
| --- | --- | --- |
| Mac OS 9 | Finder、Sherlock、Control Panels、SimpleText、QuickTime Player、AppleWorks、Navigation Services 对话框 | Guidebook Gallery 截图；现有 Platinum fixture 与 fidelity manifest |
| Mac OS X 10.2 Jaguar | Finder、Sherlock、System Preferences、TextEdit、Mail、Address Book、Preview、QuickTime Player、标准 Cocoa 对话框 | Quaqua 9.1 Jaguar look（sprite + guide 截图）；512 Pixels Aqua 库 |
| Mac OS X 10.6 Snow Leopard | Finder、System Preferences、Safari、Mail、TextEdit、Preview、iTunes、iCal、Address Book、标准 Cocoa 对话框 | 512 Pixels 10.6 库（1x，2010 Mac mini）；Quaqua 9.1 Snow Leopard look |
| OS X 10.10 Yosemite | Finder、System Preferences、Safari、Mail、TextEdit、Preview、iTunes、标准对话框/sheet/popover | 512 Pixels 10.10 库（2x Retina）；Yosemite-gtk / McOS-YS 做结构交叉验证 |

每个年代，"应用如何组织信息"比功能名更重要：面板怎么分、工具栏怎么排、
侧栏怎么分组、选中怎么呈现、搜索怎么进入、详情视图怎么展示、动作按钮放哪、
对话框怎么确认。

---

## 3. 组件 -> 历史母体映射

### ClioTalk（对话/记录）

| 年代 | 历史母体 | 可用的真实 primitives |
| --- | --- | --- |
| Mac OS 9 | SimpleText / AppleWorks 文档 + Navigation Services | window、scroll view、text view、text field、push button、default button、status text；记录行就是普通文档行 |
| Jaguar | Cocoa transcript/文档 + Aqua 输入控件（TextEdit / Mail 撰写） | Aqua 窗口、scroll view、text view、text field、push button / default button、status text |
| Snow Leopard | Cocoa 文档窗口；适当处用 source-list/detail（Mail） | toolbar、source list、table、text view；只有该放搜索的地方才用 NSSearchField |
| Yosemite | 标准内容视图 + 适当处半透明侧栏（Mail / Notes） | toolbar、半透明侧栏、table/text view、标准按钮 |

除 Liquid Glass 外，ClioTalk 全面禁止：聊天气泡、浮动输入卡片、pill 发送
按钮、超大圆角面板。

### Searcher（`find_path`）

| 年代 | 历史母体 | 真实 primitives |
| --- | --- | --- |
| Mac OS 9 | Sherlock + Finder | 搜索框（普通文本框 + 按钮）、结果列表、状态行、取消 |
| Jaguar | Sherlock + 早期 Aqua 搜索控件 | Aqua 搜索框、结果 table/list、状态文字 |
| Snow Leopard | Finder / Safari 搜索框 + 结果列表 | NSSearchField recipe、结果表格、工具栏位置 |
| Yosemite | Finder / Safari 工具栏搜索 + source-list 惯例 | 工具栏搜索框、半透明侧栏、结果表格 |

### Review Desk

各年代统一：split view + table/list + inspector/详情面板 + 标准
工具栏/动作。年代表达：Mac OS 9 -> 带框列表 + 固定详情面板（没有 Aqua 式
split chrome）；Jaguar -> Aqua split view / drawer；Snow Leopard ->
source-list + inspector（Mail 风格）；Yosemite -> 半透明侧栏的 split view。

### DocMap

各年代统一：outline view + source list + scroll view + disclosure
triangles + inspector/详情面板。Mac OS 9 用 Finder 列表视图的 disclosure
triangle 惯用式；Jaguar 起用 NSOutlineView 风格行。

### Model Picker

各年代统一：popup button + preferences 式选择；只有目标年代该放列表的地
方才用 list/table。绝不用浮动卡片或现代 pill 面板。

### Attached Sources / Context（`contextPanel`）

| 年代 | 历史表达 |
| --- | --- |
| Mac OS 9 | 带框列表 / Finder 式条目列表 |
| Jaguar | Aqua 列表 / drawer / pane |
| Snow Leopard | source-list / table / inspector |
| Yosemite | 半透明侧栏 / 现代列表 |

### Notifications（System Messages）

| 年代 | 历史表达 |
| --- | --- |
| Mac OS 9 | 标准 alert + 状态条目；没有通知中心 |
| Jaguar | 标准 alert + 状态条目（菜单栏 extra） |
| Snow Leopard | 标准 alert + 状态条目；10.8 之前没有 Notification Center |
| Yosemite | 通知中心式列表面板 + banner alert（10.10 有 NC） |

### Settings

各年代统一使用目标年代的 Control Panel / System Preferences 惯用式：
Mac OS 9 -> Control Panels 小控件窗口；Jaguar -> 工具栏分类的 System
Preferences；Snow Leopard -> 侧栏分类的 System Preferences；Yosemite ->
侧栏 + 内容区的 System Preferences。

### 其他 AI System 6 界面（简表）

| 界面 | 历史母体（除注明外各年代通用） |
| --- | --- |
| Reader | 文档窗口：text view + 来源列表 |
| Scrapbook | 条目网格/列表的文档窗口；Mac OS 9 Scrapbook 窗口惯用式 |
| Question Sheet | 标准对话框 + 表单字段（Navigation Services） |
| Writer Guide | 带分节的帮助/文档窗口 |
| Memory Cards | 列表 + 详情面板（table/list + inspector） |
| ClioStage | 文档窗口 + 标准控件 |
| CMF Studio | 文档窗口 + inspector/详情面板 |
| Translation Pad | 文档窗口 + split view + 字段 |
| Dictation | 对话框/alert + 状态文字 |
| Endfield Terminal | 终端式文本视图窗口（Jaguar Terminal 惯用式） |
| Soundscape | control-panel 式窗口：slider + 按钮 |

---

## 4. 跨年代禁用模式

非 Liquid-Glass 外观下，出现下列任何一项都属于需要修复的穿帮：

- 现代聊天气泡（包括 ClioTalk 里的圆角消息气泡）
- 到处是 pill 控件；过大圆角
- 浮动卡片 / 玻璃卡片 / 浮动工具栏
- 现代 web dashboard 布局与密集卡片网格
- iOS 式侧栏和底部 sheet
- 属于 2020 年代 Web 的间距与留白
- 不符合年代的字体（见各主题 `--theme-ui-font`）
- 违背年代惯例的工具栏层级或按钮位置（例如该用 push button 的地方用
  "发送" pill）
- 违背年代的 modal/dialog 结构（例如该用 dialog 的地方用 sheet、
  该用 drawer 的地方用 popover）

---

## 5. 来源与更新本映射

找到更准确的历史母体时，在同一编辑里更新本文档并记录参考来源（URL +
采集倍率 + 日期）。当前 recipe 参考的所有测量见
`drafts/appearance-external-research.md`；fidelity manifest 钉住规范来源与
裁切坐标。
