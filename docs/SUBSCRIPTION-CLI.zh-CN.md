<!-- canonical-source: docs/SUBSCRIPTION-CLI.md -->
<!-- source-sha256: 9bf52dbe232e7d244a5344e59918127ab20c4745200620fb066c660be1fe7ddd -->

> 英文版为准 ・ 仅供人类参考

# 订阅 CLI 提供方

<!-- doc-claims: mixed | audited: 2026-09-28 -->

状态：已为本地部署实现（Mac 应用和 `npm start`）。
公开的网页部署永不提供它。

作者可以在 Control Panel 里把云端提供方选为 **Claude（本机订阅）** 或
**Codex（本机订阅）**。此后桌面跑的每一个模型任务——ClioTalk、写作工具、审稿台、提纲、草稿，以及服务端路由（论点草稿、搜索回答、Endfield、配图文字、字幕翻译、
文本导入、视觉）——都可以跑在作者已登录的订阅的前沿模型上，经由装在同一台 Mac 上的
`claude` 或 `codex` 命令行工具。桌面不存任何 Anthropic 或 OpenAI 密钥。

为什么这样做而不是 MCP sampling：见 [Desk Port](MCP.zh-CN.md) → "Frontier models
through the port"。没有 Claude 宿主支持 sampling，2026-07-28 修订版已将它弃用，
而且它只能在访客自己的调用内部作答。

## 条款

Anthropic 的 Agent SDK 文档写道："Unless previously approved,
Anthropic does not allow third party developers to offer claude.ai login or
rate limits for their products"。OpenAI 的 Codex 认证指南建议对程序化
Codex 运行使用 API 密钥，并把 ChatGPT 登录描述为交互式。负责人在 2026-09-28
决定照旧在公开的 Mac 构建里发布该功能，并承担这一风险；本页记录该决定，
以便后续版本重新审视（获得 Anthropic 批准，或改为 API 密钥模式）。
<!-- claim-check: https://code.claude.com/docs/en/agent-sdk/overview (third-party login note) | https://learn.chatgpt.com/docs/auth (API keys for programmatic workflows) -->

## 一个请求如何运行

提供方只是一种传输，不是新的流水线。浏览器继续发送同样的 OpenAI 形态的
chat 载荷，带着同样的任务契约、humanizer 护栏和"AI 输出是临时的"规则；只有云
base URL 变成一个哨兵值：`subscription-cli://claude` 或 `subscription-cli://codex`。

```text
desk page ──POST /api/cloud/chat (or a server route)──▶ Node server
   task contract + humanizer messages applied as for any cloud model
   postJsonWithFallback / proxyJsonStream see subscription-cli://…
        └─▶ spawn claude -p  |  codex exec   (argv only, prompt on stdin)
   ◀── OpenAI chat.completion JSON, or SSE chunks for Claude streams
```

- `resolveCloudTarget` 仅在本地部署上接受该哨兵值；
  `resolveCloudCredential` 对它不返回任何密钥，因为 CLI 用的是自己的登录凭据。
- `lib/fetch.js` 里的两个传输是唯一的分支点，所以每条已经调用云模型的服务端
  路由都无需逐功能改动就获得该提供方。
- CLI 在一个空的临时目录里运行，并且关闭作者自己的定制，让桌面的提示词就是
  全部提示词：
  - Claude：`claude -p --safe-mode --no-session-persistence
    --strict-mcp-config --system-prompt <task system text> --tools WebSearch
    --allowedTools WebSearch`、`--output-format json`，或者在桌面要求流式时用
    `stream-json --verbose --include-partial-messages`。
  - Codex：`codex exec --json --ephemeral --skip-git-repo-check
    --ignore-user-config --ignore-rules -s read-only -c
    forced_login_method="chatgpt" -c web_search="live"`。`--ignore-user-config`
    把作者的 MCP 服务器和 hook 挡在这次运行之外；负责人为桌面的调用选了
    ChatGPT 登录，尽管作者自己的 `config.toml` 在交互使用中强制 API 登录。
  - 网页搜索是两个 CLI 唯一获得的工具。文件、shell 和 MCP 工具都关闭。
- 子进程环境会丢弃 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、
  `OPENAI_API_KEY`、`CODEX_API_KEY` 和 `DEEPSEEK_API_KEY`，这样服务器环境里的
  密钥永远无法把一次订阅调用变成一次计费 API 调用。它也会丢弃 `HTTP_PROXY`、
  `HTTPS_PROXY`、`ALL_PROXY` 和 `NO_PROXY`（大小写两种写法）：Claude Code 的登录
  与令牌续期经 HTTPS CONNECT 代理会失败（[anthropics/claude-code#91703](https://github.com/anthropics/claude-code/issues/91703)），
  而所有者的代理以 TUN 模式运行，不靠这些变量也能承载 CLI 的流量。没有 TUN 式
  代理、CLI 又无法直连提供方时，订阅调用会以 `subscription_cli_auth` 或
  `subscription_cli_failed` 失败。`PATH` 会追加捆绑的 node 以及
  常见的 Homebrew 和用户 bin 目录，因为 Mac 应用是用 launchd 的最小 `PATH`
  启动服务器的。
- 模型就是 CLI 默认使用的那个。响应里的 `model` 字段是 CLI 报告的名字
  （Claude 会报告；Codex 的事件流可能不报告，那样就是 `unknown`），
  `ai_system6_provider` 则标明宿主，所以运行回执和 ClioTalk 会显示是哪个宿主
  和模型作答。
- 嵌入不是 CLI 能产出的东西：嵌入路由会返回
  `subscription_cli_no_embeddings`，桌面继续使用自己的本地嵌入。

## 失败

一次订阅调用永远不会自行切换到另一个模型。桌面会显示原因，并提供改用 DeepSeek
或本地模型：

| 代码 | 何时 |
| --- | --- |
| `subscription_cli_unavailable` | CLI 未安装或找不到 |
| `subscription_cli_auth` | CLI 未登录 |
| `subscription_cli_quota` | 订阅的使用额度已用尽 |
| `subscription_cli_timeout` | 这次运行超出了请求的截止时间 |
| `subscription_cli_images_unsupported` | 载荷带有图片 |
| `subscription_cli_failed` | CLI 报告的其他任何情况 |

`GET /api/subscription-cli/status`（仅本地）会为每个 CLI 报告它是否被找到、
其版本，以及是否已登录，且不会运行模型。

## 文件

- `apps/server/server/subscription-cli.js` —— 二进制查找、提示词和参数构建、
  运行、输出解析、错误映射、响应形状。
- `apps/server/server/lib/fetch.js`、`apps/server/server/cloud.js`、
  `apps/server/server/credential-vault.js` —— 该哨兵值的三道门。
- `apps/server/server/routes/subscription-cli-status.js` —— 状态路由。
- `apps/desktop/app/features/cloud-model.js`、`apps/desktop/app.js`、
  `apps/desktop/app/core/chat-messages.js`、`apps/desktop/index.html`、
  translations —— Control Panel 选项、凭据门控、标签、错误。
- 契约：`tests/features/subscription-cli.test.mjs`（假 CLI，不调用模型）。
