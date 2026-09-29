# Subscription CLI providers

<!-- doc-claims: mixed | audited: 2026-09-28 -->

Status: implemented for the local deployment (the Mac app and `npm start`).
The public web deployment never offers it.

The writer can pick **Claude (subscription)** or **Codex (subscription)** as
the cloud provider in Control Panel. Every model task the desk runs — ClioTalk,
the writing tools, Review Desk, outline, drafts, and the server-side routes
(thesis drafts, search answers, Endfield, captions, subtitle translation, text
import, vision) — can then run on the frontier model of the subscription the
writer is already signed in to, through the `claude` or `codex` command-line
tool installed on the same Mac. The desk stores no Anthropic or OpenAI key.

Why this and not MCP sampling: see [Desk Port](MCP.md) → "Frontier models
through the port". No Claude host supports sampling, the 2026-07-28 revision
deprecates it, and it can only answer inside a guest's own call.

## Terms

Anthropic's Agent SDK documentation says: "Unless previously approved,
Anthropic does not allow third party developers to offer claude.ai login or
rate limits for their products". OpenAI's Codex authentication guide
recommends API keys for programmatic Codex runs and describes ChatGPT sign-in
as interactive. The owner decided on 2026-09-28 to ship the feature in the
public Mac build anyway and carries that risk; this page records the decision
so a later release can revisit it (approval from Anthropic, or an API-key
mode instead).
<!-- claim-check: https://code.claude.com/docs/en/agent-sdk/overview (third-party login note) | https://learn.chatgpt.com/docs/auth (API keys for programmatic workflows) -->

## How a request runs

The provider is a transport, not a new pipeline. The browser keeps sending the
same OpenAI-shaped chat payload with the same task contract, humanizer
guardrail and "AI output is temporary" rules; only the cloud base URL changes
to a sentinel, `subscription-cli://claude` or `subscription-cli://codex`.

```text
desk page ──POST /api/cloud/chat (or a server route)──▶ Node server
   task contract + humanizer messages applied as for any cloud model
   postJsonWithFallback / proxyJsonStream see subscription-cli://…
        └─▶ spawn claude -p  |  codex exec   (argv only, prompt on stdin)
   ◀── OpenAI chat.completion JSON, or SSE chunks for Claude streams
```

- `resolveCloudTarget` accepts the sentinel only on the local deployment;
  `resolveCloudCredential` returns no secret for it, because the CLI uses its
  own sign-in.
- The two `lib/fetch.js` transports are the only branch points, so every
  server route that already calls a cloud model gets the provider without a
  per-feature change.
- The CLI runs in an empty temporary directory, with the writer's own
  customizations switched off so the desk's prompt is the whole prompt:
  - Claude: `claude -p --safe-mode --no-session-persistence
    --strict-mcp-config --system-prompt <task system text> --tools WebSearch
    --allowedTools WebSearch`, `--output-format json`, or `stream-json
    --verbose --include-partial-messages` when the desk asked for a stream.
  - Codex: `codex exec --json --ephemeral --skip-git-repo-check
    --ignore-user-config --ignore-rules -s read-only -c
    forced_login_method="chatgpt" -c web_search="live"`. `--ignore-user-config`
    keeps the writer's MCP servers and hooks out of the run; the owner chose
    the ChatGPT sign-in for the desk's calls even though the writer's own
    `config.toml` forces API sign-in for interactive use.
  - Web search is the only tool either CLI gets. File, shell and MCP tools are
    off.
- The child environment drops `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
  `OPENAI_API_KEY`, `CODEX_API_KEY` and `DEEPSEEK_API_KEY`, so a key in the
  server's environment can never turn a subscription call into a billed API
  call. It also drops `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and `NO_PROXY`
  (both spellings): Claude Code's sign-in and token refresh fail behind an
  HTTPS CONNECT proxy ([anthropics/claude-code#91703](https://github.com/anthropics/claude-code/issues/91703)),
  and the owner's proxy runs in TUN mode, which carries the CLI's traffic
  without those variables. Where no TUN-style proxy is running and the CLI
  cannot reach its provider directly, subscription calls fail with
  `subscription_cli_auth` or `subscription_cli_failed`. `PATH` is extended
  with the bundled node and the usual Homebrew and user bin folders, because
  the Mac app starts the server with launchd's minimal `PATH`.
- The model is whatever the CLI uses by default. The response's `model` field
  is the name the CLI reported (Claude reports it; Codex's event stream may
  not, in which case it is `unknown`), and `ai_system6_provider` names the
  host, so the run receipt and ClioTalk show which host and model answered.
- Embeddings are not something a CLI can produce: the embeddings route answers
  `subscription_cli_no_embeddings` and the desk keeps using its local
  embeddings.

## Failures

A subscription call never switches to another model on its own. The desk
shows the reason and offers DeepSeek or the local model instead:

| Code | When |
| --- | --- |
| `subscription_cli_unavailable` | The CLI is not installed or not found |
| `subscription_cli_auth` | The CLI is not signed in |
| `subscription_cli_quota` | The subscription's usage limit is reached |
| `subscription_cli_timeout` | The run passed the request's deadline |
| `subscription_cli_images_unsupported` | The payload carries an image |
| `subscription_cli_failed` | Anything else the CLI reported |

`GET /api/subscription-cli/status` (local only) reports, for each CLI, whether
it was found, its version, and whether it is signed in, without running a
model.

## Files

- `apps/server/server/subscription-cli.js` — binary lookup, prompt and
  argument building, the run, output parsing, error mapping, response shape.
- `apps/server/server/lib/fetch.js`, `apps/server/server/cloud.js`,
  `apps/server/server/credential-vault.js` — the sentinel's three doors.
- `apps/server/server/routes/subscription-cli-status.js` — the status route.
- `apps/desktop/app/features/cloud-model.js`, `apps/desktop/app.js`,
  `apps/desktop/app/core/chat-messages.js`, `apps/desktop/index.html`,
  translations — Control Panel choice, credential gating, labels, errors.
- Contract: `tests/features/subscription-cli.test.mjs` (fake CLIs, no model
  call).
