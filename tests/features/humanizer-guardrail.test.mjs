// Humanizer Guardrail keeps generation from drifting into generic AI voice
// before Review Desk ever sees the text.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("humanizer-guardrail");

const manifest = read("scripts/runtime-manifest.mjs");
const appHumanizer = read("app/core/humanizer-guidance.js");
const config = read("app/core/config.js");
const index = read("index.html");
const serverHumanizer = read("src/server/humanizer.js");
const serverChat = read("src/server/chat.js");
const chatRoute = read("src/server/routes/chat.js");
const cloudChatRoute = read("src/server/routes/cloud-chat.js");
const draftRoute = read("src/server/routes/draft-thesis.js");
const chatMessages = read("app/core/chat-messages.js");
const writingFlow = read("app/features/writing-flow.js");
const outlineClaim = read("app/features/outline-claim.js");
const translation = read("app/features/translation.js");
const bureaucracy = read("src/server/bureaucracy.js");
const bureaucracyRoute = read("src/server/routes/bureaucracy-captions.js");

test.assertIncludes(manifest, '"app/core/humanizer-guidance.js"', "Humanizer guardrail loads with the core runtime");
test.assertMatches(manifest, /"app\/core\/config\.js",\s*"app\/core\/humanizer-guidance\.js"/, "Guardrail loads right after config and before model calls");

test.assertIncludes(appHumanizer, "Humanizer-zh", "Guardrail keeps the upstream project named in source");
test.assertIncludes(appHumanizer, "MIT License", "Guardrail keeps the upstream license notice");
test.assertIncludes(appHumanizer, "AI System 6 Humanizer guardrail", "Guardrail has a stable marker");
test.assertIncludes(appHumanizer, "此外、至关重要、深入探讨", "Guardrail includes Chinese AI-voice trigger words");
test.assertIncludes(appHumanizer, "标志着、标志性趋势、持续创新、例证、重要一步、重要的一步", "Guardrail includes qwen3.5 residues found in local-model testing");
test.assertIncludes(appHumanizer, "智能系统框架、智能系统架构、高级认知、自主学习、决策能力", "Guardrail includes Gemma E4B product-identity residues found in local testing");
test.assertIncludes(appHumanizer, "别急、当然啦、所以啊、那叫一个、天下没有白吃的午餐", "Guardrail includes qwen3.6 performative-casual residues found in local-model testing");
test.assertIncludes(appHumanizer, "生命底色、生命体验、生命质感、生活摩擦感、颗粒度、精密的空壳、虚构本质、真实生命质感、概率预测", "Guardrail includes qwen3.6 abstract literary residues found in local-model testing");
test.assertIncludes(appHumanizer, "When explaining why AI writing feels fake", "Guardrail handles qwen3.6 theory-heavy AI-writing explanations");
test.assertIncludes(appHumanizer, "Do not describe it as a humanizer persona", "Guardrail preserves AI System 6 product identity");
test.assertIncludes(appHumanizer, "not-only-but-also", "Guardrail includes translated structural slop patterns");
test.assertIncludes(appHumanizer, "blader/humanizer", "Guardrail names the upstream English source Humanizer-zh was translated from");
test.assertIncludes(appHumanizer, "English mirror of the Chinese ban", "Guardrail carries an English AI-voice ban block, not just the Chinese one");
test.assertIncludes(appHumanizer, "never strip an em-dash", "English guidance preserves the writer's own punctuation instead of a blanket em-dash ban");
test.assertIncludes(appHumanizer, "preserve hard-to-fabricate specific detail", "English guidance carries the blader/humanizer false-positive guard");
test.assertIncludes(appHumanizer, "Do not invent facts, citations, feelings, or personal details", "Guardrail does not fake humanity by inventing details");
test.assertIncludes(appHumanizer, "hasHumanizerInstruction", "Guardrail can avoid duplicate injection");

test.assertIncludes(config, "window.AISystem6Humanizer", "Markdown model messages can see the global guardrail");
test.assertIncludes(config, "humanizer.hasHumanizerInstruction(normalized)", "Frontend injection avoids duplicate guardrails");
test.assertIncludes(config, "humanizer.instruction()", "Frontend Markdown model calls receive the Humanizer instruction");
test.assertIncludes(config, "AI-flavored filler, inflated significance, promotional polish", "Default ClioTalk prompt rejects AI voice");
test.assertIncludes(index, "AI-flavored filler, inflated significance, promotional polish", "Boot HTML default prompt matches the config default");

test.assertIncludes(serverHumanizer, "function shouldApplyHumanizer", "Server proxy has a task-aware Humanizer gate");
test.assertIncludes(serverHumanizer, "extract|ocr|embedding", "Server skips source-preservation tasks where humanizing would be unsafe");
test.assertIncludes(serverHumanizer, "humanizerModelInstruction", "Server exposes the model instruction builder");
test.assertIncludes(serverHumanizer, "function isHumanizerRepairMetaResponse", "Server detects repair prompts that leaked into repair output");
test.assertIncludes(serverHumanizer, "请提供(?:需要我)?重写", "Server repair leak detector catches Chinese meta rewrite requests");
test.assertIncludes(serverHumanizer, "严格遵循", "Server repair leak detector catches Gemma repair-compliance meta answers");
test.assertIncludes(serverHumanizer, "AI-flavored|repair", "Server repair leak detector catches English meta repair acknowledgements");
test.assertIncludes(serverHumanizer, "光滑的壳", "Server repair catches metaphor residue found in qwen3.5 testing");
test.assertIncludes(serverHumanizer, "HUMANIZER_OUTPUT_BANNED_PATTERNS", "Server repair catches structural AI-voice patterns");
test.assertIncludes(serverHumanizer, "加粗模板标签", "Server repair catches template bold labels");
test.assertIncludes(serverHumanizer, "装自然口头禅", "Server repair catches performative casual phrasing from qwen3.6");
test.assertIncludes(serverHumanizer, "灵魂空洞套话", "Server repair catches abstract literary phrasing from qwen3.6");
test.assertIncludes(serverHumanizer, "Gemma身份误读", "Server repair catches Gemma E4B identity drift");
test.assertIncludes(serverHumanizer, "立足点套话", "Server repair catches abstract market-position phrasing from qwen3.6");
test.assertIncludes(serverHumanizer, "闭环套话", "Server repair catches office-jargon closure phrasing from qwen3.6");
test.assertIncludes(serverHumanizer, "括号注释尾巴", "Server repair catches parenthetical editor-note tails from qwen3.6");
test.assertIncludes(serverHumanizer, "HTML换行", "Server repair catches mini-report table formatting from qwen3.6");
test.assertIncludes(serverHumanizer, "体现了", "Deterministic cleanup keeps 体现了 grammatical instead of turning it into 例子了");
test.assertIncludes(serverHumanizer, "English mirror of the Chinese ban", "Server guardrail mirrors the English AI-voice ban block from blader/humanizer");
test.assertIncludes(serverHumanizer, "constrains model-written prose only", "Server English em-dash rule never strips the writer's own punctuation");
test.assertIncludes(serverHumanizer, "en-vague-authority", "Server repair catches English vague-authority attributions (experts believe / observers note)");
test.assertIncludes(serverHumanizer, "en-positive-conclusion", "Server repair catches English generic positive conclusions");
test.assertIncludes(serverHumanizer, "I hope this helps", "Server scrub deletes English chatbot correspondence artifacts");
test.assertIncludes(serverChat, 'require("./humanizer.js")', "Local and cloud proxy normalization can load the Humanizer guardrail");
test.assertIncludes(serverChat, "humanizerModelInstruction(anyPayload.ai_system6_task_kind, messages)", "Server injects based on task kind before tuning strips internal fields");
test.assertIncludes(serverChat, "...(humanizerInstruction ? [{ role: \"system\", content: humanizerInstruction }] : [])", "Server prepends the guardrail as a system message");
test.assertIncludes(serverChat, "temperature: 0.55", "Server qwen profile defaults to a restrained prose temperature");
test.assertIncludes(draftRoute, 'require("../humanizer.js")', "Quick Draft route can load the Humanizer guardrail");
test.assertIncludes(draftRoute, "humanizerModelInstruction(`quick-draft-${taskKind(body) || stage}`", "Quick Draft de-slops every command output, not only final draft prose");
test.assertIncludes(chatRoute, "function repairHumanizerOutputIfNeeded", "Local non-stream chat responses get a Humanizer repair pass");
test.assertIncludes(chatRoute, "findHumanizerOutputHits(content)", "Repair pass checks generated output for AI-flavored residue");
test.assertIncludes(chatRoute, "isHumanizerRepairMetaResponse(nextContent)", "Local repair pass rejects meta-responses instead of exposing repair prompts");
test.assertIncludes(chatRoute, "scrubHumanizerOutput(content)", "Repair pass has a deterministic final cleanup for stubborn residues");
test.assertIncludes(chatRoute, "片段或结构", "Local repair prompt can explain structural hits as well as literal substrings");
test.assertIncludes(cloudChatRoute, "function repairCloudHumanizerOutputIfNeeded", "Cloud non-stream chat responses get the same Humanizer repair pass");
test.assertIncludes(cloudChatRoute, "isHumanizerRepairMetaResponse(nextContent)", "Cloud repair pass rejects meta-responses instead of exposing repair prompts");
test.assertIncludes(cloudChatRoute, "不要逐字引用源文里的套话", "Cloud repair handles editing suggestions without quoting AI-flavored source phrases");
test.assertIncludes(cloudChatRoute, "delete raw.ai_system6_task_kind", "Cloud route keeps internal task kind out of provider payloads");
test.assertIncludes(chatMessages, "function qwen35TaskTemperature", "Client qwen defaults are task-aware instead of always hot");
test.assertIncludes(chatMessages, "qwen35TaskTemperature(taskKind)", "Client qwen defaults use the restrained task temperature");
test.assertIncludes(chatMessages, "qwenNeedsHumanizerRepair", "Client qwen chat uses non-stream output so the repair pass can run");
test.assertIncludes(chatMessages, "isQwen35ModelName(budgetedPayload.model)", "Client qwen stream gating reads the budgeted payload before final payload creation");

test.assertIncludes(writingFlow, "避免论文腔、公文腔、营销腔和 AI 腔", "Section Draft generation explicitly rejects AI voice");
test.assertIncludes(writingFlow, "不要用“不仅……而且……”和机械三段式撑场面", "Section Draft generation bans common formula structures");
test.assertIncludes(writingFlow, 'ai_system6_task_kind: "draft-section"', "Section Draft generation identifies itself to model tuning");
test.assertIncludes(writingFlow, "temperature: 0.55", "Section Draft generation stays restrained for larger qwen3.6 models");

test.assertIncludes(outlineClaim, "避免 AI 腔标题和套话", "Outline generation rejects AI-flavored headings");
test.assertIncludes(outlineClaim, "源文里的 AI 套话不要忠实保留", "Draft polishing strips common AI trigger words");
test.assertIncludes(outlineClaim, 'ai_system6_task_kind: "polish-draft"', "Draft polishing identifies itself to model tuning");
test.assertIncludes(outlineClaim, 'ai_system6_task_kind: "suggest-draft"', "Draft suggestions identify themselves to model tuning");

test.assertIncludes(translation, "降低 AI 腔，同时保留意思和声音", "Rewrite tool treats humanizing as clarity plus voice preservation");
test.assertIncludes(translation, "taskKind: `writing-tool-${mode}`", "Writing tools pass task kind through shared model routing");
test.assertIncludes(bureaucracy, "field values only", "Bureaucracy captions keep table cells from becoming template-labeled mini reports");
test.assertIncludes(bureaucracy, "^:?-{2,}:?$", "Bureaucracy captions reject Markdown separator rows as model captions");
test.assertIncludes(bureaucracyRoute, "qwen35Local ? 0.45 : 0.78", "Bureaucracy captions lower qwen temperature for short local outputs");
test.assertIncludes(bureaucracyRoute, "qwen35Local ? 90000 : 30000", "Bureaucracy captions give larger local qwen models enough time without slowing cloud models");
test.assertIncludes(bureaucracyRoute, "qwen35Local ? 420 : 1200", "Bureaucracy captions cap local qwen output for faster table parsing");
test.assertIncludes(bureaucracyRoute, "scrubHumanizerOutput(rawContent)", "Bureaucracy captions scrub AI-voice residue before parsing");

test.finish();
