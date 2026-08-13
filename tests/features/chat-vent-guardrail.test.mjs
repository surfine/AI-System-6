// Chat Vent Intake Guardrail keeps launch-day complaints and chat screenshots
// as author-expression material. They can shape candidates and draft paths,
// but they must not become verified facts, official material, or the user's
// confirmed first impression without explicit user adoption.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("chat-vent-guardrail");

const manifest = read("tooling/runtime-manifest.mjs");
const appVent = read("app/core/chat-vent-guidance.js");
const serverVent = read("apps/server/server/chat-vent.js");
const draftRoute = read("apps/server/server/routes/draft-thesis.js");
const chatMessages = read("app/core/chat-messages.js");
const config = read("app/core/config.js");

const SHARED_MARKER = "AI System 6 chat vent intake guardrail";

test.assertNotIncludes(manifest.split("lazyRuntimePaths = [")[0], '"app/core/chat-vent-guidance.js"', "Chat Vent guardrail stays out of the startup bundle");
test.assertMatches(config, /ensureQuickDraftModule[\s\S]*"app\/core\/chat-vent-guidance\.js"[\s\S]*"app\/features\/draft-desk\.js"/, "Quick Draft installs Chat Vent before its feature modules");
test.assertIncludes(appVent, "window.AISystem6ChatVent", "Frontend guardrail is exposed on the app namespace");
test.assertIncludes(appVent, SHARED_MARKER, "Frontend guardrail has a stable marker");
test.assertIncludes(appVent, "聊天截图是创作素材，不是可靠事实来源", "Frontend guardrail blocks chat screenshots from becoming facts");
test.assertIncludes(appVent, "默认匿名化聊天对象", "Frontend guardrail protects chat participant identity");
test.assertIncludes(appVent, "最终第一感受由用户确认", "Frontend guardrail keeps first impression user-confirmed");

test.assertIncludes(serverVent, "module.exports", "Server guardrail is a CommonJS module");
test.assertNotIncludes(serverVent, "window.", "Server guardrail does not reference browser globals");
test.assertIncludes(serverVent, "CHAT_VENT_MARKER", "Server guardrail exports a stable marker constant");
test.assertIncludes(serverVent, "chatVentIntakeInstruction", "Server guardrail exposes the injection helper");
test.assertIncludes(serverVent, SHARED_MARKER, "Server guardrail shares the marker string with the frontend");
test.assertIncludes(serverVent, "聊天截图是创作素材，不是可靠事实来源", "Server guardrail blocks chat screenshots from becoming facts");

test.assertIncludes(draftRoute, "chatVentIntakeInstruction", "Draft route injects the Chat Vent guardrail");
test.assertIncludes(draftRoute, "聊天截图是创作素材，不是可靠事实来源", "First-Day route repeats the chat-material boundary in the task contract");
test.assertIncludes(draftRoute, "可讲点候选", "Vent organization route can produce talk-point candidates");
test.assertIncludes(draftRoute, "最终第一感受", "Vent organization route does not decide the final first impression");
test.assertIncludes(chatMessages, "window.AISystem6ChatVent?.instruction", "Quick Draft SideAsk injects the browser Chat Vent guardrail");
test.assertIncludes(chatMessages, "shouldCaptureQuickDraftVentInput", "Quick Draft SideAsk supports explicit treehole capture before model calls");
test.assertIncludes(chatMessages, "汇总树洞", "Quick Draft SideAsk can summarize captured treehole notes");

test.finish();
