// Unified spec (2026-10-10) R06 contract: original, close-to-sentence
// translation and plain explanation are three fields, never blended.
// Alignment rides sentence ids; copying defaults to the explicitly selected
// layer; direct quotation comes from the original only; the target keeps the
// existing language options (Simplified/Traditional Chinese, English); depth
// is an explicit setting with per-request override — never an invisible
// persona. Cultural premises are honest about their kind. Drives the REAL
// lazy module.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("reading-layers-r06");
const source = read("app/features/reading-layers.js");

const context = { console, String, Number, JSON, Math, Array, Object, Set, Error, Boolean, Promise, Date };
context.globalThis = context; context.window = context;
context.clioRunHash = (t) => "h";
vm.createContext(context);
vm.runInContext(source, context, { filename: "reading-layers.vm.js" });
const api = context.window.AISystem6ReadingLayers;
test.assert(!!api && typeof api.buildLayers === "function" && typeof api.copyLayer === "function",
  "the layers module installs its full surface");

// The three fields build from one original; alignment is sentence-id based.
const layers = api.buildLayers({
  original: "预算合并为 1200 万。附录给出了口径。This is a third sentence!",
  translation: "预算合并为一千二百万。附录给出了口径说明。这是第三句！",
  explanation: "意思是：两笔钱加起来报了一个总数。",
  targetLanguage: "zh",
});
test.assert(!!layers && layers.original.length > 0 && layers.translation.length > 0
  && layers.explanation.length > 0,
  "the three fields are separate on one record");
test.assert(layers.quotableLayer === "original",
  "the quotable layer is the original — by field, not by promise");
const ids = api.sentenceIds(layers.original);
test.assert(ids.length === 3 && ids[0].id === "s-1" && ids[2].text.includes("third sentence"),
  "sentence ids split on CJK and Latin enders, stable and positional");
test.assert(layers.translationAlignedIds.join(",") === layers.originalSentenceIds.join(","),
  "the whole-passage translation aligns to the sentences it covers");
test.assert(api.buildLayers({ original: "  " }) === null,
  "no original, no layers");

// Copying defaults to the explicitly selected layer; quoting is original-only.
const copied = api.copyLayer(layers, "translation");
test.assert(copied.ok === true && copied.text === layers.translation && copied.layer === "translation",
  "copying the selected layer returns that layer's text");
const quoteAttempt = api.copyLayer(layers, "explanation", { requestedQuote: true });
test.assert(quoteAttempt.ok === false && quoteAttempt.reason === "quotes-come-from-original-only",
  "a direct quote from the explanation is refused with the reason, not silently swapped");
const originalQuote = api.copyLayer(layers, "original", { requestedQuote: true });
test.assert(originalQuote.ok === true && originalQuote.text === layers.original,
  "the original quotes fine");
test.assert(api.copyLayer(layers, "mystery").ok === false,
  "an unknown layer is refused, not guessed");
test.assert(api.copyLayer({ ...layers, explanation: "" }, "explanation").reason === "empty-explanation",
  "an empty layer says so instead of copying emptiness");

// Targets: the existing options stay; nothing is invented.
test.assert(api.TARGET_LANGUAGES.join(",") === "zh,zh-Hant,en",
  "Simplified Chinese, Traditional Chinese and English are the named targets");
test.assert(api.isKnownTarget("zh-Hant") && !api.isKnownTarget("klingon"),
  "an unknown target is not silently accepted");
test.assert(api.languageLabel("zh-Hant", "zh") === "繁體中文" && api.languageLabel("zh", "en") === "Simplified Chinese",
  "language labels render in the reader's language");

// Depth: explicit, three levels, per-request override without rewriting.
test.assert(api.DEPTHS.join(",") === "brief,standard,deep",
  "depth has three reader-chosen levels");
const shallow = api.withDepth(layers, "brief");
test.assert(shallow.explanationDepth === "brief" && layers.explanationDepth === "standard",
  "setting depth returns a new record — the saved one is not mutated in place");
test.assert(api.withDepth(layers, "invented").explanationDepth === "standard",
  "an unknown depth falls back to standard, not to a persona");
const oneShot = api.withDepth(shallow, "deep", { forOneRequest: true });
test.assert(oneShot.requestDepthOverride === "deep" && oneShot.explanationDepth === "brief",
  "a request override rides that request; the setting stays");
test.assert(api.withDepth(layers, "deep", { forOneRequest: true }).requestDepthOverride === "deep"
  && api.withDepth(layers, "deep").requestDepthOverride === null,
  "a plain depth change clears any override");

// Premises are honest about their kind.
const cited = api.buildPremise({ kind: "cited", text: "报告第二段说了口径", sentenceId: "s-2" });
test.assert(cited.kind === "cited" && cited.sentenceId === "s-2" && !cited.needsVerification,
  "a cited premise points at the original's sentence");
const explained = api.buildPremise({ kind: "explained", text: "预算年度通常是十二个月" });
test.assert(explained.sentenceId === null && !explained.needsVerification,
  "background knowledge says it is the desk's own explanation");
const assumption = api.buildPremise({ kind: "assumption", text: "假设两期等额" });
test.assert(assumption.needsVerification === true,
  "an unestablished assumption is marked to verify");
test.assert(api.buildPremise({ kind: "cited", text: "x" }) === null,
  "a cited premise without its sentence id is refused");
test.assert(api.buildPremise({ kind: "vibes", text: "x" }) === null,
  "an unknown premise kind is refused");

// Analogies show where they hold and where they break.
const analogy = api.buildAnalogy({
  domain: "摄影",
  correspondences: [{ from: "曝光", to: "信息量" }, { from: "过曝", to: "信息过载" }],
  breaks: "照片不能重拍，阅读可以回滚",
});
test.assert(!!analogy && analogy.correspondences.length === 2 && analogy.breaks.length > 0,
  "an analogy carries its mapping and its failure point");
test.assert(api.buildAnalogy({ domain: "摄影", correspondences: [{ from: "", to: "x" }] }) === null,
  "an analogy with empty pairs is refused");

test.finish();
