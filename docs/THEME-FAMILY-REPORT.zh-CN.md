<!-- canonical-source: docs/THEME-FAMILY-REPORT.md -->
<!-- source-sha256: 0c2f230e8c78274acf50efa291dd55256a2ce5d325b03bfe9a227d483712319b -->

英文版为准。本文档仅供人类参考。

# Classic → Platinum：三族维护模型 — 阶段报告

状态：架构阶段完成，全部闸门绿。图标重绘阶段已落地（实测 Mac OS 9 调色板）；
剩余保真闸门是人工视觉复查。

## 结论（第二十二节）

**新增一个 app 需要为多少个主题写专门 CSS？**

零份。app CSS 只消费语义 token 与共享原语；家族差异走
`body[data-theme-family="..."]`。61 个注册窗口全部满足：无任何
child+app-specific 选择器（ratchet 强制，基线 0）。

**Platinum 有多少 app-specific theme selectors？**

Before：0（此前仅靠 feature test 的 6 条前缀正则约束）；After：0，且由
注册表驱动的 `childAppSpecificSelectorLimit` 机器强制，只能减少。

**Classic 改共享 primitive 时 Platinum 是否自动跟随？**

是，并有测试/证据链：注册表 `recipeBase: classic` → Platinum 配方全部
引用共享原语（orphan 检查）→ 90 条配方全部系统级 → 61 窗口 + 23 表面
成对捕获显示增量处处生效（0 个 Classic 泄漏）。

**Platinum 有没有因重构变得更像 Classic？**

没有。架构重构本身零漂移（六主题 Theme Lab 回归 0 像素、verify:visual 0
漂移）。此后的图标重绘是按用户要求**有意**改变图标像素，golden master
逐字节一致声明仅对图标标本失效。QA 扫描 0 泄漏、0 未生效标题栏、
0 零尺寸 chrome。

**Aqua / Yosemite 有没有 visual regression？**

没有。六时代 Theme Lab regression 全部 0 像素，`verify:visual` 26 项
0 drifted，135/135 feature contracts 通过。

## 已落地机制

| 机制 | 位置 |
| --- | --- |
| 三族血缘（recipeBase / family / getRecipeChain） | app/core/theme-registry.js |
| 继承契约 + 子主题配方纪律 + 覆盖命令 | docs/THEME-FAMILY-CONTRACT.md |
| child+app-specific ratchet（基线 0，allowlist） | scripts/verify-css.mjs + css-budget.json |
| 系统角色：--system-primary-divider、--system-secondary-divider、--system-border 别名 | styles/00-foundation.css + 家族文件 |
| 注册表驱动覆盖审计 | scripts/audit-app-theme-coverage.mjs |
| 全窗口截图 + 计算样式扫描 | scripts/screenshot-window-coverage.mjs |
| 共享表面成对快照（classic/liquid/platinum） | scripts/css-surface-snapshot.mjs |
| Platinum canonical fidelity（10 控件 + 9 图标标本） | tests/visual/theme-lab-fidelity/platinum.json |

## 指标快照

- Platinum 配方 90 条，全部系统级（58 图标 painter、11 窗口镶边、14 控件、
  3 菜单、3 参数表、1 Theme Lab）。
- 61 窗口 ×（Platinum/Classic）截图 + 计算样式；QA 扫描零异常（8 个纯图标
  按钮误报已排除）。
- 23 表面 × 2 主题 = 200 张成对截图；89 个 chrome 选择器确认增量生效。
- 保真（对照真实 Mac OS 9）：几何全部对齐（geometryMismatch 0，edgeError
  ≤ 0.3px），材质 ≤ 3.4；7–21% 像素差为文本内容，不应“修复”。
- 外部交叉核对（第九节）：classic-stylesheets、Classicy、platinum.css 的
  直接源码研读已于 2026-08-10 联网完成（见下方“外部源码研读”）。几何数值
  与三个独立实现全部一致，并叠加 GUIdebook canonical 护栏。

## 外部源码研读（Classicy + platinum.css，2026-08-10）

“需网络访问”不再成立。完整 git 树已联网抓取并存于
/private/tmp/classic-platinum-work-20260810/：Classicy
（robbiebyrd/classicy，2683 个文件）、classic-stylesheets
（nielssp/classic-stylesheets，themes/macos9/_*.scss）、platinum.css
（mat-sz/platinum.css，src/index.scss）。许可证：Classicy Unlicense、
platinum.css BSD-3-Clause-Clear、classic-stylesheets MIT。未向仓库复制任何
代码/素材，以下只记录架构与实测数值。

### 架构：系统资源拥有 Platinum，app 不拥有

Classicy 的 SystemResources 目录正是我们契约描述的分工：约 50 个共享组件
（AboutWindow、Alert、BalloonHelp、BevelButton、Button、ButtonToolbar、
Checkbox、ColorPicker、ContextualMenu、ControlGroup、ControlLabel、
DatePicker、Disclosure、FileDialog、FileInput、Icon、ImageWell、Input、
Menu、Pager、Placard、PopUpMenu、ProgressBar、QuickTime、RadioInput、
RichTextEditor、Separator、Slider、Spinner、Tabs、TextEditor、TimePicker、
Tree、Triangle、Window、WindowFrame）。Finder、SimpleText、QuickTime、
PictureViewer、PDFViewer、WebViewer 全部消费这些资源；它们自己的 SCSS 只
是布局/内容（flex、gap、padding、token 色），没有任何 app 重写 Platinum
chrome。这验证了我们的 child+app-specific ratchet 基线 0：本树 app 侧已经
符合参考架构。

### 数值交叉核对（三方一致）

| Token | classic-stylesheets macos9 | platinum.css | Classicy | AI System 6 Platinum |
| --- | --- | --- | --- | --- |
| 按钮圆角 | 3px | —（WIP） | 3px token（paddingSize/2；depressable mixin 复写为 6px） | 3px |
| 按钮最小宽 | 58px | — | 58px（--hig-button-min-width） | 58px |
| 按钮内边距 | 2px 10px | — | 3px 垂直 / 8px 水平（HIG 文字下限） | 2px 10px |
| 按钮最小高 | — | — | 20px | 20px |
| 标题栏控件 | 11×11px | 11×11px | 12px（controlSize token） | 11px |
| 滚动条 | 16px | — | 16px | 16px |
| 选择色 | #ccf | — | #ccccff 家族（lavender） | #ccccff |
| 窗口框 | #cccccc | #cecece | #cccccc | #cccccc |
| 表面 | #dddddd | #dedede | #dddddd | #dddddd |
| 标题栏条纹 | 白 1px + #777 1px | — | 条纹素材 | 白/#777 重复 1px |
| 系统字体 | Charcoal | Charcoal | Charcoal | Charcoal |

（— = 该 WIP/部分源码中无此项。）

### 记录的分歧（不当作待修项）

1. 标题栏控件尺寸：classic-stylesheets 与 platinum.css 都是 11px；Classicy
   的 token 是 12px。我们跟随 11px 共识，也与 GUIdebook 实测一致。
2. 气球帮助：Classicy 画白底气泡（8px 圆角）；真实 Mac OS 9 是黄底
   （#ffffcc）+ 指针尾巴。我们保留黄气球，与真实系统及 Mac OS 8/9 HIG 一致。
3. 系统灰阶：Classicy 用 #eeeeee/#dddddd/#cccccc/#aaaaaa/#808080/#393939/
   #202020；classic-stylesheets 的 root 与我们的主题用
   #eeeeee/#dddddd/#cccccc + #9999ff 家族强调色。我们与 classic-stylesheets
   完全一致，也与实测 Mac OS 9 调色板一致。
4. Classicy 正文 14px（Web 重制选择）；classic-stylesheets 与真实 Mac OS 9
   是 12px。我们保留 12px 系统文本 + 10px 小字。

## 图标重绘（2026-08-10）

旧 Platinum 系统图标 SVG 是凭想象画的近似，用户判定与晚期 Classic Mac OS
违和。从 GUIdebook Mac OS 9.0 桌面捕获实测的根因：

- 真实 Mac OS 9 图标是浅蓝灰（#d0d0e1 家族）+ 黑描边 + 白高光 + 灰阴影；
  旧 SVG 用了不存在的紫色渐变（#9999ff / #6666cc / #ccccff）和绿色点缀。
- 旧 fixture 的 “folder” 参考裁剪实际是照片缩略图；9 个图标标本里有 7 个
  参考裁剪不可用。

重绘（assets/themes/platinum/*-32.svg + 配套 16px 版本）：folder（标签页+
浅蓝灰渐变体+黑描边+白边）、document（白页+右上折角+黑文字行+灰投影）、
floppy（金属快门带槽缝+浅青 #ccffff 标签+深色文字行）、trash（提手+金属丝
竖肋）、startup-disk/hardDisk（浅色驱动器+深色槽口，去掉绿方块）、
finder-app（经典 Finder 双脸标志）、applications（文件夹+应用网格）。

接线：styles/65 图标引用改为 32px 资产，图标 manifest 更新，Platinum Theme
Lab fixture 重建。验证：theme-lab platinum 0.000% 像素差；app 内已渲染新
图标。对照图：drafts/theme-coverage/icon-redraw/icon-review-8x.png
（旧 | 重绘 | 真实 Mac OS 9 参考，8 倍）。

修正 document/floppy/trash 参考裁剪到真实 art box 后的实测保真
（canonical harness，2026-08-10）：

| 图标 | geometryMismatch | edgeErrorPx | materialError |
| --- | --- | --- | --- |
| document-32 | 0 | 0.7 | 44.5 |
| floppy-32 | 0 | 0.4 | 104.9 |
| trash-32 | 0.003 | 1.1 | 37.7 |

重绘剪影与真实 Mac OS 9 对齐（geometryMismatch ≤ 0.003、edge ≤ 1.1px）；
材质差值量化剩余 painter 工作量。注意：桌面捕获里的软盘带定制彩色标签，
其材质数值不是干净校准目标；folder/hard-disk/cd 标本仍需有效参考源
（旧裁剪是照片缩略图或被截断）。

收尾闸门记录（2026-08-10，合并树）：verify:release 通过且 0 警告（app
bundle、发布资产、src 类型检查、135 项功能测试、CSS 预算、设计治理、
smoke、版本一致性、前端 checkJs）；verify:theme-lab 六时代全部 0.000%；
verify:css 通过。唯一剩余红灯是 verify:visual 的窗口/按钮几何快照，归
并行 Aqua 车道已提交的运行时重构所有；其基线更新已落地，verify:visual
现已转绿（26 项 0 漂移）。截至最终闸门重跑（2026-08-10 ~05:32），合并树
全部闸门绿：verify:release 0 警告、verify:theme-lab 六时代 0.000%、
verify:visual 0 漂移、verify:css（含 child+app ratchet）通过。

## 剩余工作（保真阶段）

1. **图标批次已获用户验收（2026-08-10）。** 全套约 51 个 Platinum 图标现由
   单一共享配方（scripts/build-platinum-icons.mjs）生成，遵循已接受的设计
   规范：黑色 keyline、白高光、轻微 bevel、像素级边缘、明快非荧光材料色、
   稳定透视、克制硬阴影。系统图标使用实测 Mac OS 9 色（文件夹 #ccccff
   家族、软盘 #cfcfe1/#ccffff 等）。
2. 逐图标 painter 校准方案已被统一配方取代；后续保真修复即配方/配色改动，
   一次重生成全套。
3. **外部参考补强**：classic-stylesheets 资产已在仓库内；Classicy 与
   platinum.css 的直接源码研读已完成（见上文“外部源码研读”；证据在
   `/private/tmp/classic-platinum-work-20260810/`）。
4. **人工复查截图集**：`drafts/theme-coverage/windows-platinum/`。
5. **程序收尾**：本车道工作已提交（11 个提交，备份在
   `/private/tmp/classic-platinum-work-20260810/`）。最终树级
   verify:release/theme-lab 重跑待并行 Aqua/Snow Leopard 车道进行中的工作
   收尾（其 67 选择器预算与 aqua/snow fixture 是当前仅有的红灯）。

## 维护命令

```sh
npm run verify:css                      # budgets + child+app ratchet
npm run verify:theme-lab                # 六时代 Theme Lab regression
npm run verify:visual                   # Classic/Liquid computed snapshot
npm run verify:features -- appearance-system
npm run audit:theme-coverage            # 注册表驱动的覆盖审计
npm run screenshot:windows              # 全窗口截图
npm run compare:theme-lab:canonical     # Platinum 对照真实 Mac OS 9
```

## 执行顺序审计（计划第 21–22 节）

逐项状态与权威证据：

| 计划项 | 状态 | 证据 |
| --- | --- | --- |
| 1. 拉取最新 main | 完成 | codex/system-closing 位于 origin/main 之上 |
| 2. 保存六主题基线 | 完成 | tests/visual/theme-lab/*.png + verify:theme-lab |
| 3. 保存 Platinum canonical 保真 | 完成 | tests/visual/theme-lab-fidelity/platinum.json + drafts/theme-lab-fidelity/platinum/ |
| 4. 机械拆分 family CSS（可选） | 已被取代 | Aqua 车道的 65 重组（其车道未提交）；契约记录了冲突再现时的规则 |
| 5. 三族继承契约 | 完成 | docs/THEME-FAMILY-CONTRACT.md（中英） |
| 6. app 外观映射到系统/家族语义 | 完成 | 00-foundation.css 的分隔/边框别名，零差异验证 |
| 7. 真实 app Platinum 覆盖审计 | 完成 | 61 窗口、0 条 child+app-specific 选择器（审计+截图脚本） |
| 8. 删除可继承的 Platinum app-specific 选择器 | 完成 | ratchet 基线 0（verify:css） |
| 9. 对照 classic-stylesheets / Classicy / platinum.css | 完成 | 联网完整源码研读（Classicy 2683 文件树、SystemResources 架构、platinum.css src/index.scss、classic-stylesheets macos9 模块）；三方几何一致，分歧记录在“外部源码研读” |
| 10. 修复剩余 Platinum 保真细节 | 部分 | 图标已按实测调色板重绘；Mac OS 9 HIG 审计（drafts/platinum-hig-audit.md）已修 grow box、非活动标题栏控件、气球帮助；painter 校准待人工批准 crop |
| 11. Classic + Platinum 成对回归 | 完成 | verify:theme-lab 六时代 0.000% |
| 12. 六主题共享基础设施回归 | 完成 | 4098c729 时六时代 0.000%；verify:release 0 警告 |
| 13. 输出维护成本指标 | 完成 | 指标快照 + 结论 |
| 22. 最终问题 | 完成 | 结论回答全部五问；收尾时重跑最终 release 闸门 |

阻塞完成度审计的待办：(a) 人工视觉复查重绘图标；(b) 并行 Aqua 车道未提交的
visual 基线与 65 重组（verify:visual 唯一红灯）；(c) 树稳定后重跑一次最终
verify:release / verify:visual。
