<!-- canonical-source: docs/MCP.md -->
<!-- source-sha256: fa972c1e5ba706bae6f2511236096dac836e31215a6fd06c1a1f94550296393e -->

> 英文版为准 ・ 仅供人类参考

# AI System 6 的 MCP

<!-- doc-claims: verified | audited: 2026-10-31 -->

AI System 6 双向支持 Model Context Protocol。外部 agent（Claude Code、Claude Desktop、Codex、Cursor）可以作为**访客**在这张桌面上工作；桌面也可以去问外部**服务器**。两者都在选择器（Chooser）里。本页只写已经上线的部分；桥怎么接、怎么经互联网邀请、信任边界在哪里，见 [MCP 访客桥](MCP-GUEST-BRIDGE.zh-CN.md)。它所取代的 2026-09-28「桌面端口」提案保存在 `internal/design-proposals/2026-09-28-desk-port/`。

## 访客：别的 agent 在这张桌面上

- **端点。** 本机服务器上的 `POST /mcp`（Streamable HTTP）。所有调用都由页面执行，服务器只转发，自己什么也不执行。
- **协议。** 版本 `2025-11-25`，也兼容 `2025-06-18`、`2025-03-26`、`2024-11-05` 的旧客户端。
- **批准。** 每个访客按名字批准一次，并给一个权限档位。作者在 选择器 → 访客 里修改或撤销。

### 一张表，覆盖所有应用

所有工具和资源只在 `apps/desktop/app/core/mcp-surface.js` 里声明一次。服务器的 schema 和页面的实现都读这张表，两边不会走样。注册表里的每个应用都在这里声明自己的 MCP 面；漏了就有合约报红（`tests/features/mcp-surface.test.mjs`）。

工具名一律以 `ais6_` 开头。每个工具都带：

- annotations（`readOnlyHint`、`destructiveHint`、`idempotentHint`）；
- `outputSchema`，并用 `structuredContent` 作答；
- 中英两种说明。

| 档位 | 工具数 | 允许做什么 |
| --- | --- | --- |
| 只读（`read`） | 37 | 读桌面、写作路线、项目、文件软盘、Scrapbook、运行回执、修订、ClioWorks 投影、Clio 任务、玻璃封面、ClioPaint、ClioProject |
| 可提议（`propose`） | 9 | 把提议放到作者审阅的地方：文件软盘、审阅意见、ClioWorks 修订、视角结果、还原包。作者采纳之前，什么都进不了正文 |
| 可改动（`change`） | 13 | 操作桌面：打开应用、切换项目、写正文、刻录项目光盘等 |

访客只看得到自己档位允许的工具。作者改了某个访客的档位后，服务器会在它下一次请求的回答里附上 `notifications/tools/list_changed`。

### 改动前先问

每次「可改动」调用，都先向访客的客户端发 `elicitation/create`（form 模式），客户端弹出确认，必须由作者回答。拒绝或取消，工具就不执行。每次都问；这一档没有「一律允许」。

### 资源

资源使用 `ais6://` URI，包括 `ais6://desk`、`ais6://plan`、`ais6://route/…`、`ais6://floppy/…`、`ais6://scrapbook/…`、`ais6://receipts/…`、`ais6://docmap/…`、`ais6://cover/{id}`、`ais6://painting/{id}`。支持 list、read 和 subscribe。写入碰到已订阅的资源时，会发 `notifications/resources/updated`。

### 进度、取消、审计

- **进度。** 要求进度的调用会收到 `notifications/progress`。
- **取消。** `notifications/cancelled` 放弃一个还没完成的调用。
- **审计。** 每次 `tools/call` 都在桌面有上限的审计环里留一条记录，读取和被拒的调用也算。每条记录写明谁、何时、哪个工具、参数摘要、结果。

### 作者在选择器里能管什么

- **工具权限。** 对每个已批准的访客，它档位允许的每个工具都可以设为「允许」「每次询问」或「关闭」。关闭的工具会从访客的工具列表里消失，调用也会被拒。「每次询问」会在只读或提议工具执行前，在桌面上弹出确认。「可改动」工具只能选「每次询问」（就是上面的 elicitation 确认）或「关闭」，永远不能设成「允许」。
- **项目。** 默认情况下，访客在桌面上开着的那个项目里工作。限定到某些项目后：别的项目开着时，它的调用一律被拒；`ais6_list_projects` 只给它看这些项目；它也只能切换到这些项目。
- **最近的调用。** 审计环里的每一次调用，最新的在上面，可以按访客筛选，也能导出 CSV。

### 开关

选择器角落写着 **MCP ◉ 启用 ○ 停用**。默认停用：页面不打开访客桥，任何访客都连不上这张桌面。启用后桥打开，再由「访客」驱动逐个决定每个 agent 能做什么。

## 服务器：这张桌面去问别人

选择器 → 服务器 列出作者加的 MCP 服务器。能回答搜索工具的服务器会加入 Searcher 的搜索引擎菜单。服务器返回的东西一律落在文件软盘上，从不进正文。可连哪些地址、哪些请求头会被保留、代理怎么走，见 [MCP 访客桥](MCP-GUEST-BRIDGE.zh-CN.md#询问别的服务器)。

## 还没有

- 各客户端的「复制设置」按钮和 `.mcpb` 安装包。
- Clio 自己把外部 MCP 服务器当连接器用。

这些计划在 2.0 推出；上线之前，本页不描述它们。
