// User-facing explanations are written for an intelligent adult who does not
// know the product's internal vocabulary. They must answer early, explain the
// mechanism one step at a time, and preserve the boundary that makes the
// explanation true.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("copy-comprehension");
const help = read("app/data/writing-flow-help.js");
const dictionary = read("app/data/system-dictionary.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

for (const document of ["readMe", "flow", "memory"]) {
  test.assertMatches(
    help,
    new RegExp(`${document}: Object\\.freeze\\(\\{[\\s\\S]{0,500}?question:[\\s\\S]{0,500}?stuckPoint:[\\s\\S]{0,500}?directAnswer:[\\s\\S]{0,500}?boundary:`),
    `${document} has a private comprehension card`
  );
}

test.assertIncludes(help, "AI System 6 is a writing desk.", "Read Me gives the direct product answer in its first paragraph");
test.assertIncludes(help, "AI System 6 是一张写作桌。", "中文说明在第一段直接回答产品是什么");
test.assertIncludes(help, "**Searcher → Reader → DocMap**", "research help shows the order of the mechanism");
test.assertIncludes(help, "Searcher finds a source door, Reader opens the original", "each research object has one concrete job");
test.assertIncludes(help, "Markdown is plain text with small marks that describe structure", "Markdown is explained before the technical name is reused");
test.assertIncludes(help, "内建数据库中，这个数据库叫 **IndexedDB**", "IndexedDB is introduced as a concrete browser file cabinet");
test.assertIncludes(help, "OCR 是从图片中识别文字", "OCR is explained at first use");
test.assertNotIncludes(help, "小精灵", "help never uses baby-talk helpers");
test.assertNotIncludes(help, "这个其实很简单", "help never belittles the reader's confusion");

for (const id of ["review-desk", "quick-draft", "workspace-profiles", "working-session", "system-integrity", "provisional-ai-output"]) {
  test.assertIncludes(dictionary, `id: "${id}"`, `System Help has a beginner-facing ${id} entry`);
}
test.assertIncludes(dictionary, "built-in file cabinet is called IndexedDB", "System Help explains IndexedDB in ordinary language");
test.assertIncludes(dictionary, "Appearing on screen and being saved are different states", "System Help separates visible model output from saved work");
test.assertIncludes(dictionary, "它不能自动证明论断为真", "Fact Check keeps its accuracy boundary");

test.assertIncludes(en, "<strong>Hi. I’m Clio, the conversation app.</strong>", "English introduction answers what it is before touring features");
test.assertIncludes(zh, "你好，我是 Clio，这张桌面上的对话应用。", "Chinese introduction answers what it is before touring features");
test.assertNotIncludes(en, "It reads, it asks", "the system is not presented as an all-owning assistant");
test.assertNotIncludes(zh, "它会读、会问", "中文不把整张桌面拟人成万能助手");
test.assertIncludes(en, "The current model connection did not respond", "generic model errors stay provider-neutral");
test.assertIncludes(zh, "当前模型通道没有响应", "中文通用错误不误怪 LM Studio");
test.assertIncludes(en, "It is not an Apple-shipped full-device colorway", "CMF recipe copy states the product boundary");
test.assertIncludes(zh, "它不是 Apple 发售的整机配色", "中文 CMF 文案不冒充 Apple 成品配色");

test.finish();
