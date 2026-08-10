<!-- canonical-source: docs/THEME-FAMILY-REPORT.md -->
<!-- source-sha256: 222f6d158abdd4a693805840e64f1283a549988d08a33f9798c844e35593f987 -->

英文版为准。本文档仅供人类参考。

# 主题族报告 — 六套外观验收收口

> **当前结论（2026-08-10）：PASS WITH KNOWN ISSUES**
>
> Commit：`b23eddf6` — “Appearance: Yosemite evidence ledger, icon manifest,
> and six-appearance QA matrix”（收口时观察到的最后 HEAD；并行会话在验收
> 期间持续提交，因此下列证据针对最终工作区记录——闸门就是在该工作区上
> 运行的）
>
> 已提交代码上全部主题闸门为绿：六时代 Theme Lab 回归通过（重复运行
> 0.000%；一次 platinum 瞬时 0.044% 噪声运行见第 5 节）、verify:visual 0
> 漂移、CSS 预算与 child+app-specific ratchet 为 0、141 个功能契约、61
> 个窗口 × 6 主题截图扫描、交互状态扫描与持久化探针全部通过。仅有的红灯
> 与主题无关：(a) 公开仓库的 GitHub Actions 因账号计费锁定未启动；
> (b) 可选浏览器 E2E 套件在本环境下超时（尝试 4 项全部超时，按仓库规定
> 不属于发版闸门）；(c) 共享工作区软盘预算只有在并行会话未提交的预算上调
> （2,978,000 字节，构建为 2,976,913）下才通过，而已提交 HEAD 独立通过
> （剩余 2,602 字节）。这些都不是主题缺陷，也没有通过修改主题代码、测试
> 或 baseline 来掩盖。

## 1. 当前状态 — 六套正式外观，三个维护族

`app/core/theme-registry.js` 是主题元数据的唯一事实来源。六套外观全部
`releaseReady: true`；“特别 → 外观”菜单、控制面板的外观下拉、Theme Lab
与两套语言表都暴露相同的六个 id。维护继承（`recipeBase`）刻意不按年代：
classic → platinum，aqua → snow-leopard，liquid-glass → yosemite，其中
Aqua 与 Liquid Glass 各自为根。

| 外观 | id | 家族 / 继承 | 视觉状态 |
| --- | --- | --- | --- |
| System 6 | classic | classic（根） | 1-bit 铬；0 圆角、无阴影或半透明；扫描中彩色像素 0% |
| Platinum | platinum | classic → classic | Mac OS 9 灰铬、11 px 标题栏控件、黄色气球帮助 |
| Aqua | aqua | aqua（根） | 细条纹菜单栏/工具栏、胶囊按钮、红绿灯、8 px 窗口 |
| Snow Leopard | snow-leopard | aqua → aqua | 银色统一工具栏/边栏/对话框、12 px 灯、5 px 窗口 |
| Yosemite | yosemite | liquid-glass → liquid-glass | 10.10 扁平铬、半透明菜单栏、蓝色默认按钮 `#3484e2`（悬停 `#619fe8`）、5 px 窗口 |
| Liquid Glass | liquid-glass | liquid-glass（根） | 玻璃材质、vibrancy、18 px 圆角、蓝色渐变默认按钮 |

家族契约、注册表 recipe 链与选择器 ratchet 分别由
`docs/THEME-FAMILY-CONTRACT.md`、`tests/features/appearance-system.test.mjs`
与 `scripts/verify-css.mjs` 强制（child+app-specific 选择器保持基线 0）。

## 2. 实际执行的验证（2026-08-10，真实退出码）

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `npm install` | 0 | 依赖树与 lockfile 已同步 |
| `npm run verify:css` | 0 | 逐文件预算与 ratchet；child+app-specific 0/0；无新增 `!important` |
| `npm run audit:theme-coverage` | 0 | 61 个注册窗口；0 个 child+app-specific 主题选择器 |
| `npm run verify:features` | 0 | 141 个功能契约（含 `appearance-system`） |
| `npm run verify:theme-lab` | 0 | 六时代回归通过；重复运行 0.000%（一次 platinum 瞬时 0.044% 噪声运行见第 5 节） |
| `npm run verify:visual` | 0 | 26 项计算样式条目，0 漂移 |
| `npm run verify:theme-lab:fidelity` | 0 | 4 套外观的 canonical fidelity 硬闸门（并行会话新增） |
| `npm run screenshot:windows -- --theme <时代>` | 0 × 6 | 每个主题 61/61 窗口；无零尺寸铬 |
| `npm run verify:release` | 0 | 最终运行：0 警告（build、语法、src typecheck、smoke、data、floppy、features、docs、CSS、design、packaging） |
| `npm run test:e2e` | 中断 | 可选人工诊断；4/4 项 chromium 测试在本环境超时（见第 5 节）；按仓库规定不属于发版条件 |
| `npm run compare:theme-lab:canonical` | 0 | Platinum 对照真实 Mac OS 9 语料；受闸门标本在固定容差内（图标标本仅诊断） |

每条命令都针对实时工作区运行并记录真实退出状态，没有沿用旧报告结论。

公开可复现性：`verify:theme-lab`、`screenshot:windows`、
`audit:theme-coverage`、`compare:theme-lab:canonical` 与
`verify:theme-lab:fidelity` 均随公开树提供并可运行。`verify:visual`
（以及 `snapshot:css`、`visual:*`、`render:*`）是仅限内部私有树的闸门：
它需要本地浏览器，并有意从公开快照中移除
（`scripts/lib/public-package.mjs` 的 `internalOnlyScriptNames`）。其上
结果是私有树证据，不是“公开克隆可复现”的声明。公开快照受支持的命令面即
README.md 所记载的 `npm ci` / `npm start` / `npm run build` /
`npm test` / `npm run verify:public`。

## 3. 已完成的视觉验收

- **61 个注册窗口 × 6 主题** — 元素截图与计算样式采样（title-bar、
  close-box、resize-box、按钮、输入框、下拉、面板）位于
  `drafts/theme-coverage/windows-<theme>/`。六次运行均 61/61 窗口，零
  零尺寸铬，除已知的 Time Machine sandbox 消息外无页面错误。
- **交互状态扫描 × 6 主题** — Apple 菜单打开与悬停选中、特别 → 外观
  子菜单（六项齐全）、active/inactive 窗口标题栏、关闭/缩放/缩放框、
  按钮 default/hover/pressed/focus/disabled、复选框/下拉/文本域、气球
  帮助、系统模态框、工具栏/边栏/标签页、可滚动面板与通知中心。截图与
  JSON 位于 `drafts/theme-coverage/states/`。
- **时代材质检查** — Classic 彩色像素 0% 且零圆角/阴影；Platinum 为灰阶
  与实测 Mac OS 9 调色板；Aqua/Snow Leopard 具备时代色彩（细条纹、银灰、
  红绿灯）；Yosemite 为扁平 10.10 铬；Liquid Glass 为玻璃材质。未发现跨
  时代串色。
- **持久化** — 保存的非默认主题在首帧前已投射到 `html`/`body`（注册表
  在 `<head>` 中先于样式表执行）；重载保持；旧 `ai-system-6-liquid-glass`
  键迁移为 `ai-system-6-theme=liquid-glass`；未知 id 安全回落到 classic
  并规范化存储；A→B→A 往返不残留旧 class、inline style 或 CSS 变量；
  已打开窗口实时跟随主题切换。

## 4. 本次收口发现并修复的问题

1. **Yosemite、Aqua、Snow Leopard 压扁了应用自有文本域。** 听写转写
   （84 px）、翻译板（118 px）、重建流程（180 px）文本域全部掉到 22 px
   控件最小值。根因：时代字段配方对 textarea 设置
   `min-height: var(--system-control-min-height)`，与 app 规则在特异性上
   打平并按加载顺序胜出。Classic 与 Liquid Glass 从不设置 textarea
   min-height。修复：从 Yosemite 配方（`styles/65-appearance-themes.css`）
   与 Aqua/Snow Leopard 配方（`styles/67-aqua-appearance.css`）移除该属性；
   单行控件仍由基础规则保持 22 px 最小值。
2. **Yosemite 蓝色默认按钮悬停变白。** 通用 `.btn:hover` 配方用白色常规
   按钮悬停色重绘了 10.10 suggested-action 按钮。修复：新增 Yosemite 规则
   使用 `--btn-default-hover-bg: #619fe8`，并经引用的
   vinceliuice/Yosemite-gtk-theme `03b6f721` `gtk-light.css` 验证
   （`button.suggested-action:hover { background-color: #619fe8; }`）。
3. **README 只写了三套正式外观。** 注册表实际发布六套；`README.md` /
   `README.zh-CN.md` 现已改为六套正式外观（System 6、Platinum、Aqua、
   Snow Leopard、Yosemite、Liquid Glass）。
4. **本报告原先同时存在“全部闸门绿”与过时红灯、阻塞项。** 已重写为单一
   当前结论；分阶段过程记录归档在下方历史区。
5. **覆盖审计不再与 ratchet 的 allowlist 对齐。** 并行会话的 Yosemite
   拆分通过 `childAppSpecificAllowlist`（`yosemite:.finder-item` 等带主题
   限定形式，即契约中的系统级例外路径）批准其 Finder/桌面选中配方，
   `verify:css` 因此计数 0/0；但 `audit-app-theme-coverage.mjs` 只识别
   裸形式或 `platinum:` 限定条目，误报 5 个窗口。审计现已与闸门一样识别
   限定形式，重新报 0。

## 5. 已知但不阻塞发布的问题

- **GitHub Actions 未启动**（账号计费锁定）。属仓库基础设施而非代码；
  本地闸门即为验收证据。
- **可选 E2E 套件在本环境超时**（尝试 4 项 chromium 测试全部超时：
  adjustment-layers × 2、control-strip × 2，各 4–5 分钟）。仓库将其定为
  可选人工诊断、绝非发版条件；未为此修改任何测试或配置。
- **共享工作区软盘预算**只有在并行会话未提交的上调（2,978,000 字节对比
  构建 2,976,913）下才通过；已提交 HEAD 独立通过（剩余 2,602 字节）。
  该会话收口并提交上调后需重跑 `verify:release`。
- **Theme Lab 瞬时字形噪声** — 某次 platinum 运行测得 0.044%（557 px，
  Icon set 的 Charcoal 标签）；重复运行测得 0.000%。这是低于 0.2% 闸门
  容差的机器/字体缓存栅格化噪声，不是回归，也不是更新 baseline 的理由。
- **Time Machine 内嵌页按设计记录一条 `localStorage` sandbox 错误**
  （`sandbox="allow-scripts"` 不透明源 iframe）；六次主题扫描均出现，
  与主题无关。
- **Platinum 图标材质保真**：folder / hard-disk / CD 标本仍缺有效参考
  裁片（旧裁片是照片缩略图）。几何已对齐；材质差异已量化，不阻塞发布。
- **Theme Lab 标题字形噪声** — 某些运行下 “Icon set” 标题会测量出
  ±0.01% 差异（机器/字体缓存差异）；重复运行测得 0.000%。这是栅格化
  噪声，不是更新 baseline 的理由。

## 6. 历史 / 中间记录（2026-08-10 归档）

> 本节以下内容为并行 Platinum/Aqua 通道在 2026-08-10 产生的分阶段记录，
> 保留作溯源用途。其中的状态行（“全部闸门绿”“人工视觉复查待办”“阻塞
> 完成审计的未决项”）描述的是中间时刻，**不是当前状态**。第 1–5 节才是
> 当前结论。历史细节（外部源码研究、图标重绘、执行顺序审计表、指标快照）
> 以英文版为准。

历史要点摘要：

- 家族/继承模型、child+app-specific ratchet（基线 0）、系统角色 token
  （`--system-primary-divider` 等）与 registry 驱动覆盖审计均已落地。
- 外部源码研究（Classicy、classic-stylesheets、platinum.css）确认三路
  几何数值一致；差异按真实系统裁定（11 px 标题栏控件、黄色气球帮助、
  12 px 正文等）。
- Platinum 图标按实测 Mac OS 9 调色板重绘，约 51 个图标由单一 painter
  配方生成，并已获用户批准；几何对齐，材质差异量化记录。
- 旧的“阻塞完成审计的未决项”（红绘图标人工复查、并行 Aqua 通道未提交
  的视觉基线、最终 verify:release/verify:visual 重跑）已由本次收口解决。

## 7. 维护命令

```sh
npm run verify:css                      # 预算 + child+app ratchet
npm run verify:theme-lab                # 六时代 Theme Lab 回归
npm run verify:visual                   # Classic/Liquid 计算样式快照
npm run verify:features -- appearance-system
npm run audit:theme-coverage            # registry 驱动的覆盖审计
npm run screenshot:windows              # 全窗口截图
npm run compare:theme-lab:canonical     # Platinum 对照真实 Mac OS 9
```
