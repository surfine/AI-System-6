<!-- canonical-source: docs/design/standalone-launch-links.md -->
<!-- source-sha256: 046c76df3d4562ca855aee93ed9242ee3176caa01443a38ab6abaa3a75c68c0e -->
<!-- 英文版为准，本文件仅供人类参考 -->

# 独立直达链接 —— 一个链接，直接进某个功能

> 方案草稿 · 2026-09-04 · 状态：已定入 1.0.52，实现中
>
> 关联：剧情终端资料库刷新
> （`internal/operations/ENDFIELD-ARCHIVE-REFRESH.md`）与下文所述桌面端
> 窗口/启动架构。

## 1. 目标

让**外部链接**（wiki 页面、论坛帖、游戏站、聊天消息、二维码）打开 AI System 6
时**直接停在某个功能里**：

- 例子 A：一个介绍终末地剧情终端的链接，打开 AI System 6 后剧情终端窗口已在
  眼前，可以直接问剧情。
- 例子 B：城建站的链接直接进盆景城市；交通游戏站的链接直接进 OpenTTD/DOOM。

目的是**引流进站**：让别的页面和应用指向 AI System 6 的某个功能，而不是只指向
一个泛泛的首页。目标窗口应尽量铺满屏幕（至少是 System 6 的“缩放”窗口），同时
桌面始终只差一步就能回去。

## 2. 非目标

- 不做新的启动器、Dock 或“最近使用”界面（产品规则要求先扩展 Finder/应用程序/
  工作会话等既有入口）。
- 不做浏览器扩展、原生插件、账号体系。
- 不改写功能内部；链接只负责启动应用本来就能打开的东西。
- 不做困住用户的强制全屏（桌面必须随时可退出）。

## 3. 现有可复用点（已对照代码确认）

| 接缝 | 位置 | 价值 |
| --- | --- | --- |
| 功能命令 | `apps/desktop/app/core/actions.js` — 惰性命令 `open-endfield-terminal`、`open-bonsai-city`、`open-micropolis`、`open-openttd`、`open-doom`，各有 `ensure*Module` | 每个可启动功能都有稳定 id |
| 窗口管理器 | `apps/desktop/app/core/window-manager.js` — `openWindow(name, options)`；剧情终端、Reader、Scrapbook 等在桌面档已走 `maximizeWindow(win, {top})` | “铺满工作区”行为已存在 |
| 缩放状态 | 同模块 + `apps/desktop/app/core/working-session.js` — 窗口持久化 `dataset.zoomed`，标题栏缩放框可切换 | 全屏可复用现有 zoom，且像普通窗口状态一样可恢复 |
| 惰性加载 | `window.AISystem6Runtime.registerLazyCommand(...)` | 冷启动链接不用为未打开的游戏付加载成本 |
| 启动参数解析 | `apps/desktop/app.js` 启动时已读 `window.location.search`（如 `debugTheme`） | `launch=` 启动参数符合既有模式 |
| 独立功能页 | `apps/desktop/endfield-terminal.html` 已是单独发布的页面 | 已有 Web 兜底/落地选项 |
| macOS 壳 | `platform/macos/shell/macos-webview/Sources/AISystem6Shell/main.swift`（目前只支持命令行参数） | 需要注册 URL scheme 才能成为链接目标 |
| 移动端沉浸态 | `apps/desktop/styles/60-responsive.css`（`is-mobile-fullscreen`、`mobile-immersive-landscape`） | 手机链接可把整屏交给应用 |

## 4. 链接格式

### 4.1 Web（无需安装，处处可用）

```text
https://aisystem6.pages.dev/?launch=endfield-terminal&mode=fullscreen
```

或短品牌路由：

```text
https://aisystem6.pages.dev/go/endfield-terminal?mode=fullscreen
```

参数：

- `launch`（必填）：第 6 节的路由 id。未知 id → 正常启动 + 一条小提示
  “该应用不可用”（绝不弹错误页）。
- `mode=fullscreen`（可选，推荐）：缩放窗口铺满工作区（见第 5 节）。缺省时用
  普通窗口布局。
- 其余未知参数（如 `ref=`）一律忽略；产品现阶段**不做流量统计**。

### 4.2 已安装桌面版（macOS）

注册自定义 URL scheme，并转发到同一条启动路径：

```text
aisystem6://launch?route=endfield-terminal&mode=fullscreen
```

壳的 `AppDelegate` 收到 URL（`application(_:open:)`），把 `route` 过同一份
白名单，再加载 `http://127.0.0.1:4173/?launch=endfield-terminal&mode=fullscreen`。
若应用已在运行，第二次点击链接应聚焦应用并重新拉起窗口（现有 `openWindow`
对已开窗口本来就具备聚焦行为）。

建议 scheme 名：`aisystem6`（与现有内部 `aisystem6-image:` 引用一致）。
注册放在壳/原生应用 `Info.plist`（`CFBundleURLTypes`）——属新增工作，见第 9 节。

### 4.3 链接放哪里

先放在项目自控的页面（README 徽章、剧情资料库手册、公开站点），再按项目自己的
授权措辞放到合作 wiki/伙伴页。链接就是普通 `<a>` 标签，嵌入方无需任何特殊处理。

## 5. “全屏”指什么

两级，都安全：

1. **缩放窗口（`mode=fullscreen` 默认）**。System 6 缩放框行为：窗口铺满可用
   工作区，标题栏/菜单栏仍在，关窗即回普通桌面。剧情终端在桌面档本来就走
   `maximizeWindow`，所以这是最省、最“像系统”的一档。
2. **沉浸 Kiosk（未来，`mode=kiosk` 可选）**。增加一个可逆的 body 类
   （`is-launch-kiosk`），窗口开着时隐藏桌面图标/菜单条，类似现有移动端沉浸态。
   按 Esc 或关窗即回桌面。这是真实 CSS 改动，上线前必须走 css-no-pingpong
   证据流程与 `verify:css`/`verify:visual` 预算。

**决策：1.0.52 只发第 1 级（缩放窗口）。** 第 2 级（kiosk）暂不纳入本次。

## 6. 首批路由

| 路由 id | 命令 | 窗口/应用 | 画像 | 为什么适合引流 |
| --- | --- | --- | --- | --- |
| `endfield-terminal` | `open-endfield-terminal` | 剧情终端 | desktop | 终末地 wiki/社区可直链剧情问答 |
| `bonsai-city` | `open-bonsai-city` | 盆景城市 | desktop | 城建站可直链一座城 |
| `micropolis` | `open-micropolis` | Micropolis | desktop | 复古城建受众 |
| `openttd` | `open-openttd` | OpenTTD | desktop | 交通游戏受众 |
| `doom` | `open-doom` | DOOM 街机 | desktop | “浏览器里直接玩”类分享链接 |
| `time-machine` | `open-time-machine` | 时间机器 | desktop | 历史/复古受众 |
| `liquid-cover` | `open-liquid-cover` | Liquid Cover（封面玻璃） | desktop | 音乐/视觉分享 |

路由 id 取人类可读且稳定；它们**不是**窗口名，也不暴露内部实现。

**决策：七个路由都进 1.0.52**，剧情终端作为首发展示。

## 7. 启动流程

1.0.52 的最终实现如下（早期“新增 launch-links.js + pendingLaunch 队列”的
草稿在落地时简化了：路由表与解析辅助直接扩展既有的惰性 `launch-intent` 模块；
请求就是一次性启动 URL，不需要队列）：

1. **解析**。`apps/desktop/app.js` 的启动正则现在也会命中 `?launch=`；
   `applyBootLaunchIntent()` 通过 `window.AISystem6LaunchIntent.parse` 读取
   `launch` + `mode`（该模块本来就负责 `?open=` / `?appearance=` / `?tour=`）。
2. **校验**。`launch-intent.js` 持有白名单——路由 → 命令 id → 所属窗口名。
   未知路由一律拒绝，应用照常启动。同一张路由表分别复制在本地 `/go/` 服务路由
   与 Cloudflare Pages 的 `/go/<route>` 函数里；feature 测试保证三处不漂移。
3. **启动**。先走完正常启动与工作区画像流程
   （`document.body.dataset.appReady === "ready"`）。
4. **确认（仅写作画像）**。如果会话留在写作视图，先弹系统确认框问是否切到
   desktop 画像；默认动作是取消，外部链接不能无声搬走写作中的用户。
5. **打开**。`runStandaloneLaunchIntent()` 走既有 `handleAction` 派发注册好的
   惰性命令（含模块加载）；`mode=fullscreen` 时短暂轮询该路由自己的窗口，再套用
   既有 `maximizeWindow`（System 6 缩放）。不需要另写窗口打开器或新缩放助手。
6. **兜底**。功能需要模型/本地服务而不可用时，展示功能自身的降级态（剧情终端
   已有“archive unavailable”），绝不编造内容。

## 8. 安全与隐私

- 只走白名单：`launch` 只能映射到已知命令 id；任意窗口名、文件路径或
  `javascript:` 值永远到不了 `openWindow`。
- Web 深链只允许同源；不新增任何第三方请求。
- 不做统计：多余查询参数一律忽略，绝不存储。
- macOS scheme 只启动本地应用；壳只转发解析后的路由（绝不把原始 query 塞进
  脚本上下文）。

## 9. 实现清单（1.0.52 状态）

Web 与共享核心：

- [x] `apps/desktop/app/core/launch-intent.js` — 路由表、URL 解析、白名单校验、
      每路由的窗口名（就地扩展，不是新模块）。
      `tests/features/launch-intent.test.mjs` 覆盖解析与三处路由表一致性契约。
- [x] `apps/desktop/app.js` — 启动正则 + `applyBootLaunchIntent()` +
      `runStandaloneLaunchIntent()`（惰性派发、写作画像确认、缩放应用）。
- [x] 窗口布局复用既有 `maximizeWindow`；window-manager 无需改动（可直达的功能
      本就自己摆放，游戏/Time Machine 接受缩放框）。
- [x] 短链接：`apps/server/server/router.js` + `apps/server/server/routes/go.js`
      提供 `GET /go/:route`，Cloudflare Pages 侧提供
      `functions/go/[route].js`——两边都 302 到
      `/?launch=<route>&mode=fullscreen`。
- [x] 写作画像守卫：切到 desktop 画像前弹系统确认框（默认取消）。
- [x] i18n 文案在 translations-en/zh（`launch_switch_to_desktop`、
      `launch_open_desktop`、`launch_cancelled`）。
- [x] 启动载荷不变：路由都是惰性功能命令，短链接处理器在服务端/边缘，不产生
      新的 bundle 字节。

macOS 壳：

- [x] `tooling/build-mac-shell-app.mjs` 在生成的 `Info.plist` 里写入
      `CFBundleURLTypes`，注册 `aisystem6` scheme。
- [x] `main.swift`：`application(_:open:)` 按同一白名单校验路由，拼出
      `http://127.0.0.1:PORT/?launch=…&mode=fullscreen` 并加载——webview 已就绪
      时直接加载；冷启动时先存 pending，首次成功加载后消费。
- [x] 二次启动聚焦：处理器先激活应用、把窗口置前，再加载。

里程碑：**1.0.52**。

验证：

- [x] `npm run verify:features -- launch-intent`（路由解析 + 一致性）。
- [x] Swift 编译壳包通过（`swift build
      --package-path platform/macos/shell/macos-webview`）。
- [ ] 真浏览器冒烟 `?launch=endfield-terminal&mode=fullscreen`
      （启动 → 窗口可见 → 缩放 → 关闭回到桌面）。
- [ ] 打包 macOS：对构建好的 `dist/AI System 6 Beta.app` 执行
      `open "aisystem6://launch?route=endfield-terminal&mode=fullscreen"`
      （scheme 注册只存在于打包后的 app）。
- [ ] 若第 2 级 kiosk CSS 上线：css-no-pingpong、前后截图、
      `verify:css` + `verify:visual`、预算说明。

## 10. 决策（1.0.52 已全部定案）

1. 1.0.52 只发第 1 级缩放全屏；第 2 级 kiosk 留作后续（不进本次）。
2. Scheme `aisystem6://launch?route=…&mode=…`；Web 参数 `?launch=…`。
3. 路由集合：第 6 节的七个（含 `time-machine`、`liquid-cover`）。
4. 分析：不做；多余查询参数一律忽略。
5. 写作画像行为：深链落到 **desktop** 画像；会话若留在写作视图，先弹系统确认框
   （默认取消）。
6. Web 与 macOS 都进 1.0.52：Web 为主渠道，macOS scheme（`aisystem6://`）
   同版本跟进。

## 11. 完成标准（所选范围）

- 一个链接就能冷启动/热启动（已在运行）直达目标功能并套用约定布局。
- 未知/不安全路由照常启动，绝不抛错。
- 桌面退出（关窗/缩放切换）永远能回到 System 桌面。
- 单元 + E2E 全绿；macOS scheme 实测通过；本文档与 README/运行手册的链接用法
  同步更新。
