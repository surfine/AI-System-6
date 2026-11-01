// Unified spec (2026-10-10) S03 contract: questions without answers are
// notes too. An open-question scrap carries the original quote, the reader's
// own gap, and a status ONLY the user's acceptance moves — models propose,
// they never decide. Withdrawn questions are kept, not erased. Similarity
// suggestions are bounded, local and dismissible (no global suggestion hub),
// and labels never fake a probability. Drives the REAL lazy module.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("open-questions-s03");
const source = read("app/features/open-questions.js");

const context = { console, String, Number, JSON, Math, Array, Object, Set, Error, Boolean, Promise, Date };
context.globalThis = context; context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "open-questions.vm.js" });
const api = context.window.AISystem6OpenQuestions;
test.assert(!!api && api.STATUSES.join(",") === "open,partly-answered,resolved,withdrawn",
  "the module installs with the spec's four user statuses");

// Building: quote and gap are both required, and both are the reader's own.
const missing = api.buildOpenQuestion({ quote: "原句", gap: "  " });
test.assert(missing === null, "a question without the reader's gap is not built");
const question = api.buildOpenQuestion({
  quote: "报告把两期预算合并计算。",
  gap: "合并后单期到底是多少？",
  sourceId: "doc-1", sourceTitle: "预算说明", projectId: "proj-1",
});
test.assert(!!question && question.noteKind === "open-question" && question.status === "open",
  "a built question starts open");
test.assert(question.quote === "报告把两期预算合并计算。" && question.gap === "合并后单期到底是多少？",
  "the quote and the gap are the reader's own words");
test.assert(question.candidates.length === 0 && question.statusHistory.length === 1
  && question.statusHistory[0].by === "user",
  "no candidate exists before any model ran, and the opening act is the user's");

// Proposals are inert: a model candidate never moves status by itself.
const proposed = api.proposeCandidate(question, { text: "按比例折算约为一期的一半。", proposedBy: "cliotalk" });
test.assert(proposed.status === "open" && proposed.candidates.length === 1
  && proposed.candidates[0].acceptedAt === null,
  "a proposal lands as a candidate and leaves the status untouched");
test.assert(api.proposeCandidate(proposed, { text: "  " }) === proposed,
  "an empty proposal changes nothing");
test.assert(api.proposeCandidate({ noteKind: "scrap" }, { text: "x" }).noteKind === "scrap",
  "a non-open-question scrap passes through untouched");

// Acceptance is the user's act — and only through this door.
const accepted = api.acceptStatus(proposed, "resolved", { candidateIndex: 0 });
test.assert(accepted.status === "resolved" && accepted.candidates[0].acceptedAt !== null,
  "accepting resolves the question and stamps the candidate");
test.assert(accepted.statusHistory.at(-1).by === "user"
  && accepted.statusHistory.length === 2,
  "the history records the user as the one who decided");
test.assert(api.acceptStatus(accepted, "invented-status") === accepted,
  "an unknown status is refused, not coerced");
const withdrawn = api.acceptStatus(accepted, "withdrawn");
test.assert(withdrawn.status === "withdrawn" && withdrawn.quote === question.quote
  && withdrawn.gap === question.gap,
  "withdrawing keeps the question and its words — the gap is not erased");

// Similarity is bounded, local, dismissible — never a hub.
const pool = [
  { id: "q1", noteKind: "open-question", status: "open", title: "预算合并", gap: "两期预算合并后单期是多少？", quote: "报告把两期预算合并计算。" },
  { id: "q2", noteKind: "open-question", status: "resolved", title: "汇率折算", gap: "美元报价怎么折算成人民币预算？", quote: "报价以美元计。" },
  { id: "q3", noteKind: "scrap", title: "普通剪藏", body: "两期预算合并计算" },
  { id: "q4", noteKind: "open-question", status: "withdrawn", title: "已撤回", gap: "两期预算合并计算的问题", quote: "预算合并" },
  { id: "self", noteKind: "open-question", status: "open", title: "自己", gap: "合并后单期到底是多少？", quote: "报告把两期预算合并计算。" },
];
const hits = api.similarOpenQuestions(question, pool, { limit: 3 });
test.assert(hits.length >= 1 && hits[0].id === "q1",
  "the similar open question surfaces first");
test.assert(!hits.some((hit) => hit.id === "q3"),
  "plain scraps are not candidates in the similarity sweep");
test.assert(!hits.some((hit) => hit.id === "q4"),
  "withdrawn questions do not resurface");
test.assert(!hits.some((hit) => hit.id === "self"),
  "the question never suggests itself");
test.assert(api.similarOpenQuestions(question, pool, { limit: 1 }).length === 1,
  "the sweep is bounded by its limit");
test.assert(hits.every((hit) => typeof hit.score === "number" && hit.score > 0 && hit.score <= 1),
  "scores stay a bounded overlap ratio, not a fake probability");

// Labels say the state, in the reader's language.
test.assert(api.statusLabel("partly-answered", "zh") === "部分解答"
  && api.statusLabel("open", "en") === "Open"
  && api.statusLabel("unknown", "zh") === "待解",
  "status labels are named states, falling back to open");

// Wiring: the desk's own surfaces reach the module — the action is
// registered where dispatch looks, the editor menu offers it, the list
// badge reads the lazy label, and the module is lazily registered.
const actions = read("app/core/actions.js");
test.assert(actions.includes('"scrapbook-mark-open-question": () => markSelectedScrapAsOpenQuestion()'),
  "the mark action is registered in the application handler map");
const scrapbook = read("app/features/scrapbook.js");
test.assert(scrapbook.includes("markSelectedScrapAsOpenQuestion")
  && scrapbook.includes("window.AISystem6OpenQuestions?.markScrap?.(")
  && scrapbook.includes("window.AISystem6OpenQuestions?.statusLabel?.("),
  "the scrapbook delegates marking to the lazy module and reads its label");
const indexHtml = read("index.html");
test.assert(indexHtml.includes('data-action="scrapbook-mark-open-question"'),
  "the editor menu offers the mark action");
const config = read("app/core/config.js");
test.assert(config.includes('"app/features/open-questions.js"'),
  "the module registers in the lazy loader");
const zh = read("app/data/translations-zh.js");
test.assert(zh.includes("标记为待解问题") && zh.includes("只有你接受状态才会改变"),
  "the zh copy says status moves only by your acceptance");

test.finish();
