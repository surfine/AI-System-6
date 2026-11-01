// Subscription CLI providers (docs/SUBSCRIPTION-CLI.md): the desk runs a
// model turn through the writer's signed-in `claude` or `codex` CLI. These
// cases use fake CLIs on a scratch PATH, so no model is called.

import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("subscription-cli");

const scratch = await mkdtemp(join(tmpdir(), "ais6-subscription-cli-"));
const bin = join(scratch, "bin");
const home = join(scratch, "home");
await mkdir(bin, { recursive: true });
await mkdir(home, { recursive: true });

// One fake answers for both CLIs. It records its argv, stdin, cwd and the
// API-key variables it could see, then behaves as FAKE_CLI_MODE says.
const fake = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
let input = "";
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  fs.writeFileSync(process.env.FAKE_CLI_LOG, JSON.stringify({ name, args, input, cwd: process.cwd(),
    keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "CODEX_API_KEY", "HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy"].filter((k) => process.env[k]) }));
  const mode = process.env.FAKE_CLI_MODE || "ok";
  if (mode === "slow") { setTimeout(() => {}, 60000); return; }
  if (name === "claude") {
    if (mode === "auth") { process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login" }) + "\\n"); process.exit(1); }
    if (mode === "quota") { process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Claude AI usage limit reached|1790000000" }) + "\\n"); process.exit(1); }
    const streaming = args.includes("stream-json");
    if (streaming) {
      const out = (e) => process.stdout.write(JSON.stringify(e) + "\\n");
      out({ type: "system", subtype: "init", model: "claude-fake-7" });
      for (const text of ["第一段", "，第二段"]) out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } });
      out({ type: "result", subtype: "success", is_error: false, result: "第一段，第二段", usage: { input_tokens: 11, output_tokens: 5 }, modelUsage: { "claude-fake-7": {} } });
      return;
    }
    process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Claude 的回答", usage: { input_tokens: 10, output_tokens: 4 }, modelUsage: { "claude-fake-7": {} } }) + "\\n");
    return;
  }
  if (mode === "auth") { process.stdout.write(JSON.stringify({ type: "turn.failed", error: { message: "Not logged in. Run codex login." } }) + "\\n"); process.exit(1); }
  process.stdout.write([
    { type: "thread.started", thread_id: "t1" },
    { type: "item.completed", item: { type: "reasoning", text: "思考" } },
    { type: "item.completed", item: { type: "agent_message", text: "Codex 的回答" } },
    { type: "turn.completed", usage: { input_tokens: 20, cached_input_tokens: 0, output_tokens: 6 } },
  ].map((e) => JSON.stringify(e)).join("\\n") + "\\n");
});
`;
for (const name of ["claude", "codex"]) {
  await writeFile(join(bin, name), fake);
  await chmod(join(bin, name), 0o755);
}
const log = join(scratch, "log.json");
process.env.FAKE_CLI_LOG = log;
process.env.AI_SYSTEM6_CLAUDE_CLI = join(bin, "claude");
process.env.AI_SYSTEM6_CODEX_CLI = join(bin, "codex");
process.env.ANTHROPIC_API_KEY = "sk-must-not-reach-the-cli";
process.env.DEEPSEEK_API_KEY = "sk-must-not-reach-the-cli-either";
process.env.HTTPS_PROXY = "http://127.0.0.1:7890";
process.env.https_proxy = "http://127.0.0.1:7890";

const cli = require("../../apps/server/server/subscription-cli.js");
const { postJsonWithFallback } = require("../../apps/server/server/lib/fetch.js");
const lastRun = async () => JSON.parse(await readFile(log, "utf8"));
const payload = (extra = {}) => ({
  model: "default",
  messages: [
    { role: "system", content: "AI System 6 task contract: chat." },
    { role: "system", content: "AI System 6 Humanizer guardrail: keep the writer's voice." },
    { role: "user", content: "帮我看看这一段" },
  ],
  ...extra,
});

try {
  // --- the sentinel and its doors -------------------------------------------
  test.assert(cli.subscriptionCliKind("subscription-cli://claude/v1/chat/completions") === "claude", "the sentinel names its CLI");
  test.assert(cli.subscriptionCliKind("https://api.deepseek.com") === "", "an ordinary endpoint is not a sentinel");
  const cloud = require("../../apps/server/server/cloud.js");
  const target = await cloud.resolveCloudTarget("subscription-cli://codex");
  test.assert(target.baseUrl === "subscription-cli://codex" && target.address === "", "the local profile accepts the sentinel as a cloud target");
  const { resolveCloudCredential } = require("../../apps/server/server/credential-vault.js");
  const credential = await resolveCloudCredential({ provider: "deepseek", targetBaseUrl: "subscription-cli://claude" });
  test.assert(credential === "subscription-cli", "no secret is looked up for a sentinel target");

  // --- request construction --------------------------------------------------
  const { response: claudeResponse } = await postJsonWithFallback("subscription-cli://claude/v1/chat/completions", payload(), null);
  const claudeBody = await claudeResponse.json();
  const claudeRun = await lastRun();
  test.assert(claudeResponse.ok && claudeBody.choices[0].message.content === "Claude 的回答", "a Claude answer comes back as a chat.completion");
  test.assert(claudeBody.model === "claude-fake-7" && claudeBody.ai_system6_provider.host === "Claude Code", "the answer names the host and the model the CLI reported");
  test.assert(claudeBody.usage.prompt_tokens === 10 && claudeBody.usage.completion_tokens === 4, "usage is carried over");
  test.assert(claudeRun.input === "帮我看看这一段", "the user's text goes to the CLI on stdin, not argv");
  const systemAt = claudeRun.args.indexOf("--system-prompt");
  test.assert(systemAt >= 0 && /task contract/.test(claudeRun.args[systemAt + 1]) && /Humanizer guardrail/.test(claudeRun.args[systemAt + 1]), "the task contract and humanizer guardrail become the CLI's system text");
  test.assert(["--safe-mode", "--no-session-persistence", "--strict-mcp-config"].every((flag) => claudeRun.args.includes(flag)), "Claude runs without the writer's CLAUDE.md, skills, hooks, MCP servers or saved session");
  test.assert(claudeRun.args[claudeRun.args.indexOf("--tools") + 1] === "WebSearch", "web search is the only tool Claude gets");
  test.assert(claudeRun.keys.length === 0, "no API key and no proxy variable in the server's environment reaches the CLI");
  test.assert(claudeRun.cwd.includes("ais6-cli-"), "the CLI runs in an empty scratch directory");

  const { response: codexResponse } = await postJsonWithFallback("subscription-cli://codex/v1/chat/completions", payload(), null);
  const codexBody = await codexResponse.json();
  const codexRun = await lastRun();
  test.assert(codexBody.choices[0].message.content === "Codex 的回答", "a Codex answer is its final agent message, not its reasoning");
  test.assert(codexBody.model === "unknown" && codexBody.ai_system6_provider.host === "Codex", "a model Codex did not report is shown as unknown");
  test.assert(["--ephemeral", "--ignore-user-config", "--ignore-rules"].every((flag) => codexRun.args.includes(flag)), "Codex runs without the writer's config, rules or a saved session");
  test.assert(codexRun.args.includes('forced_login_method="chatgpt"'), "Codex uses the ChatGPT sign-in for the desk's calls");
  test.assert(codexRun.args.includes("read-only"), "Codex's sandbox is read-only");
  test.assert(codexRun.args.some((arg) => arg.startsWith("developer_instructions=") && /task contract/.test(arg)), "Codex receives the task contract as developer instructions");

  const multi = cli.promptFromPayload({ messages: [
    { role: "system", content: "S" },
    { role: "user", content: "问一" },
    { role: "assistant", content: "答一" },
    { role: "user", content: "问二" },
  ] });
  test.assert(multi.system === "S" && /\[User\]\n问一/.test(multi.prompt) && /\[Assistant\]\n答一/.test(multi.prompt) && multi.prompt.trim().endsWith("Answer the last user turn."), "a conversation is laid out oldest first and ends on the turn to answer");
  const jsonAsk = cli.promptFromPayload({ response_format: { type: "json_object" }, messages: [{ role: "user", content: "x" }] });
  test.assert(/exactly one valid JSON value/.test(jsonAsk.system), "a JSON response format becomes a system instruction");

  // --- streaming ------------------------------------------------------------
  const { response: streamed } = await postJsonWithFallback("subscription-cli://claude/v1/chat/completions", payload({ stream: true }), null, {}, { streamResponse: true });
  const sse = await streamed.text();
  test.assert(streamed.headers.get("content-type") === "text/event-stream", "a Claude stream is served as SSE");
  test.assert(sse.indexOf('"content":"第一段"') >= 0 && sse.indexOf('"content":"，第二段"') > sse.indexOf('"content":"第一段"'), "Claude's text arrives as it is written, in order");
  test.assert(/"finish_reason":"stop"/.test(sse) && sse.trim().endsWith("data: [DONE]"), "the stream closes with a finish reason and [DONE]");
  const { response: codexStream } = await postJsonWithFallback("subscription-cli://codex/v1/chat/completions", payload({ stream: true }), null, {}, { streamResponse: true });
  test.assert(/"content":"Codex 的回答"/.test(await codexStream.text()), "a Codex stream request gets its answer whole, in the same SSE shape");

  // --- failures -------------------------------------------------------------
  const failure = async (kind, mode, extra = {}) => {
    process.env.FAKE_CLI_MODE = mode;
    try {
      const { response } = await postJsonWithFallback(`subscription-cli://${kind}/v1/chat/completions`, payload(extra), extra.signal || null);
      return { status: response.status, body: await response.json() };
    } finally {
      delete process.env.FAKE_CLI_MODE;
    }
  };
  const auth = await failure("claude", "auth");
  test.assert(auth.status === 401 && auth.body.code === "subscription_cli_auth" && /claude auth login/.test(auth.body.warning), "a signed-out Claude says so and names the sign-in command");
  const codexAuth = await failure("codex", "auth");
  test.assert(codexAuth.body.code === "subscription_cli_auth" && /codex login/.test(codexAuth.body.warning), "a signed-out Codex says so too");
  // Both messages below are what the real CLIs printed on this Mac (2026-09-28).
  const expired = cli.classifyFailure("Failed to authenticate: OAuth session expired and could not be refreshed", "claude");
  test.assert(expired.code === "subscription_cli_auth", "an expired Claude sign-in is a sign-in problem, not a generic failure");
  const codexLimit = cli.classifyFailure("You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Oct 4th, 2026 10:59 AM.", "codex");
  test.assert(codexLimit.code === "subscription_cli_quota" && codexLimit.statusCode === 429, "a Codex plan limit is reported as the plan's limit");
  const quota = await failure("claude", "quota");
  test.assert(quota.status === 429 && quota.body.code === "subscription_cli_quota", "a used-up subscription is reported as such");
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 300);
  const timedOut = await failure("claude", "slow", { signal: controller.signal });
  test.assert(timedOut.status === 504 && timedOut.body.code === "subscription_cli_timeout", "a run past the request's deadline is stopped and reported");
  const images = await failure("claude", "ok", { messages: [{ role: "user", content: [{ type: "text", text: "看图" }, { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }] }] });
  test.assert(images.body.code === "subscription_cli_images_unsupported", "an image payload is refused before any CLI runs");
  const { response: embeddings } = await postJsonWithFallback("subscription-cli://claude/v1/embeddings", { input: "x" }, null);
  test.assert((await embeddings.json()).code === "subscription_cli_no_embeddings", "embeddings are refused so the desk keeps its local embeddings");
  const saved = process.env.AI_SYSTEM6_CODEX_CLI;
  process.env.AI_SYSTEM6_CODEX_CLI = join(bin, "missing-codex");
  const missing = await failure("codex", "ok");
  process.env.AI_SYSTEM6_CODEX_CLI = saved;
  test.assert(missing.status === 503 && missing.body.code === "subscription_cli_unavailable", "a CLI that is not installed is named as missing");

  const status = await cli.subscriptionCliStatus("claude", { home, timeoutMs: 2000 });
  test.assert(status.available === true && status.host === "Claude Code", "the status probe finds the CLI without running a model");
} finally {
  await rm(scratch, { recursive: true, force: true });
}

// --- the desk side ----------------------------------------------------------
{
  const { createAppBootVm } = await import("../helpers/app-boot-vm.mjs");
  const vmw = createAppBootVm();
  vmw.run('cloudConfig = { provider: "claude-subscription", model: "default", active: true, baseUrl: "subscription-cli://claude" };');
  test.assert(vmw.run("cloudCredentialReady()") === true && vmw.run("cloudCredentialMode()") === "subscription", "a subscription provider is ready without any key on this Mac");
  vmw.run('document.documentElement.dataset.deploymentProfile = "public";');
  test.assert(vmw.run("cloudCredentialReady()") === false, "and never on the public deployment");
  vmw.run('document.documentElement.dataset.deploymentProfile = "local";');
  test.assert(vmw.run("cloudModelRouteLabel(cloudConfig)").startsWith(vmw.run('t("cloud_provider_claude_subscription")')), "the menu bar names the subscription host");
}
{
  // model-user-errors.js loads with the rest of the desk; run it alone here.
  const vm = await import("node:vm");
  const sandbox = { window: {}, console };
  vm.runInNewContext(read("app/core/model-user-errors.js"), sandbox);
  const errors = sandbox.window.AISystem6ModelUserErrors;
  const classify = (code) => errors.classify(Object.assign(new Error(`${code}: Cloud API returned 401`), { code, status: 401 }), { kind: "cloud" });
  test.assert(classify("subscription_cli_auth") === "subscriptionUnavailable", "a signed-out CLI reads as a switch prompt, not a bad key");
  test.assert(classify("subscription_cli_quota") === "subscriptionQuota", "a used-up plan reads as its own message");
  test.assert(classify("subscription_cli_images_unsupported") === "subscriptionImages", "an image the CLI cannot take reads as its own message");
  test.assert(errors.kinds.subscriptionUnavailable.actionKey === "ai_action_switch_ai", "the recovery is to switch to DeepSeek or the local model");
}
const chatMessages = read("app/core/chat-messages.js");
test.assertIncludes(chatMessages, 'isSubscriptionCloudProvider === "function" && isSubscriptionCloudProvider())', "a failed subscription turn is never answered silently by the local model");
const retrieval = read("app/core/context-retrieval.js");
test.assertIncludes(retrieval, 'isSubscriptionCloudProvider === "function" && isSubscriptionCloudProvider())', "retrieval keeps its local embeddings under a subscription provider");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
for (const key of ["cloud_provider_claude_subscription", "cloud_provider_codex_subscription", "cloud_model_cli_default", "subscription_cli_ready", "subscription_cli_missing", "subscription_cli_signed_out", "ai_error_subscription_cli_unavailable", "ai_error_subscription_cli_quota", "ai_error_subscription_cli_images", "ai_action_switch_ai"]) {
  test.assert(en.includes(`${key}:`) && zh.includes(`${key}:`), `${key} exists in both languages`);
}

// --- public boundary ------------------------------------------------------
const router = read("apps/server/server/router.js");
const publicKeys = router.slice(router.indexOf("publicExactRouteKeys"), router.indexOf("]);", router.indexOf("publicExactRouteKeys")));
test.assert(!publicKeys.includes("/api/subscription-cli/status"), "the status route is absent from the public route table");
test.assertIncludes(read("apps/server/server/cloud.js"), 'if (isPublicDeployment) throw cloudEndpointError("Subscription CLI providers are only available in the local app.")', "the public deployment refuses the sentinel as a cloud target");
test.assertIncludes(read("apps/server/server/routes/capabilities.js"), "subscription_cli: !isPublicDeployment", "the page learns the providers exist only on the local profile");

test.finish();
