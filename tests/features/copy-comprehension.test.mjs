// User-facing explanations are written for an intelligent adult who does not
// know the product's internal vocabulary. They must answer early, explain the
// mechanism one step at a time, and preserve the boundary that makes the
// explanation true.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import vm from "node:vm";

const test = createFeatureTest("copy-comprehension");
const help = read("app/data/writing-flow-help.js");
// The data tables are classic scripts installing window globals; loading them
// in a VM makes this contract execute the shipped data instead of its text.
const loadTable = (path, name) => vm.runInContext(`${read(path)}; window.${name}`, vm.createContext({ window: {} }));
const dictionary = loadTable("app/data/system-dictionary.js", "AISystem6DictionaryData.systemDictionaryEntries");
const en = loadTable("app/data/translations-en.js", "AISystem6TranslationsEn");
const zh = loadTable("app/data/translations-zh.js", "AISystem6TranslationsZh");

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
  test.assert(Array.isArray(dictionary) && dictionary.some((entry) => entry.id === id), `System Help has a beginner-facing ${id} entry`);
}
test.assert(JSON.stringify(dictionary).includes("built-in file cabinet is called IndexedDB"), "System Help explains IndexedDB in ordinary language");
test.assert(JSON.stringify(dictionary).includes("Appearing on screen and being saved are different states"), "System Help separates visible model output from saved work");
test.assert(JSON.stringify(dictionary).includes("它不能自动证明论断为真"), "Fact Check keeps its accuracy boundary");

test.assert(String(en.about_first_tagline || "").startsWith("A writing desk that protects your own language."), "English introduction answers what it is before touring features");
test.assert(String(zh.about_first_tagline || "").startsWith("一张保护你自己语言的写作桌。"), "Chinese introduction answers what it is before touring features");
test.assertNotIncludes(en, "It reads, it asks", "the system is not presented as an all-owning assistant");
test.assertNotIncludes(zh, "它会读、会问", "中文不把整张桌面拟人成万能助手");
test.assert(Object.values(en).some((v) => String(v).includes("The current model connection did not respond")), "generic model errors stay provider-neutral");
test.assert(Object.values(zh).some((v) => String(v).includes("当前模型通道没有响应")), "中文通用错误不误怪 LM Studio");
test.assert(Object.values(en).some((v) => String(v).includes("It is not an Apple-shipped full-device colorway")), "CMF recipe copy states the product boundary");
test.assert(Object.values(zh).some((v) => String(v).includes("它不是 Apple 发售的整机配色")), "中文 CMF 文案不冒充 Apple 成品配色");

test.finish();
