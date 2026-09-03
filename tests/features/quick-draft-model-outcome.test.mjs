// Real execution of the task's third named acceptance test: "a model answer
// that arrives lands in the record or is refused with a reason." Uses the
// existing draft-desk-vm.mjs harness (real requestQuickDraft() over a real
// project record, a stubbed model responder) rather than a new one — see
// AGENT-LESSONS and this lane's report for why a new harness was not
// warranted here.
//
// Scope note: the durable WRITE path (commitQuickDraftForProject ->
// saveDeskState -> IndexedDB) belongs to the receipts/persistence lane. This
// test asserts only the OUTCOME requestQuickDraft() reports and the record
// state a caller can read back through the same public surface Draft Desk
// itself reads — never persistence internals.
//
// tests/features/draft-desk-ai-runtime.test.mjs already covers a rewrite
// landing and a stale-project response being discarded; this file adds the
// two explicit REFUSAL-with-a-reason paths requestQuickDraft() has (a "no
// meaningful change" response, and a hard model failure) and confirms both
// leave the record exactly as it was — a refusal that is also silent data
// corruption would be worse than no contract at all.

import { createDraftDeskVm } from "../helpers/draft-desk-vm.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("quick-draft-model-outcome");

function modelResult(draft) {
  return {
    text: JSON.stringify({
      stage: "draft",
      draft,
      brief: { support: "", counter: "", uncertainty: "", outline: "" },
      sourceMap: [],
      risks: "",
    }),
  };
}

// Outcome 1: the model answer lands in the record.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-lands", "旧正文，包含作者的判断。", { title: "旧标题" });
  runtime.context.modelResponder = async () => modelResult("这是一段全新的正文，明显不同，保留了原有的判断并补充了结构。");
  const result = await runtime.testApi.requestQuickDraft("draft");
  test.assert(result === true, "requestQuickDraft reports success when the model returns a meaningfully different draft");
  test.assert(
    project.quickDraft.workspace.body.includes("全新的正文"),
    "the model's answer lands in the durable record (project.quickDraft.workspace.body)"
  );
  test.assert(
    runtime.controls.get("quick-draft-status").textContent === "quick_draft_done",
    `the status surface reports the done reason, not silence (got ${JSON.stringify(runtime.controls.get("quick-draft-status").textContent)})`
  );
}

// Outcome 2: refused with a reason — the model answers, but with no
// meaningful change from the current body. The record must not be corrupted
// (still exactly the pre-request body) and the refusal reason must reach the
// status surface, not just a `false` return value nobody can explain.
{
  const runtime = createDraftDeskVm();
  const unchangedBody = "这段正文完全没有变化，模型原样返回了它。";
  const project = runtime.addProject("project-no-revision", unchangedBody, { title: "标题" });
  runtime.context.modelResponder = async () => modelResult(unchangedBody);
  const result = await runtime.testApi.requestQuickDraft("draft");
  test.assert(result === false, "requestQuickDraft reports failure when the model's answer is not a meaningful revision");
  test.assert(
    project.quickDraft.workspace.body === unchangedBody,
    "a no-revision refusal leaves the durable record exactly as it was — not blanked, not partially patched"
  );
  test.assert(
    runtime.controls.get("quick-draft-status").textContent === "quick_draft_no_revision",
    `the refusal reason reaches the status surface (got ${JSON.stringify(runtime.controls.get("quick-draft-status").textContent)})`
  );
}

// Outcome 3: refused with a reason — a hard model failure (thrown error).
// Same two guarantees: record integrity, and a stated reason.
{
  const runtime = createDraftDeskVm();
  const originalBody = "在模型失败之前就存在的正文。";
  const project = runtime.addProject("project-model-error", originalBody, { title: "标题" });
  runtime.context.modelResponder = async () => { throw new Error("model unavailable (test fixture)"); };
  const result = await runtime.testApi.requestQuickDraft("draft");
  test.assert(result === false, "requestQuickDraft reports failure when the model call itself throws");
  test.assert(
    project.quickDraft.workspace.body === originalBody,
    "a hard model failure leaves the durable record exactly as it was"
  );
  test.assert(
    runtime.controls.get("quick-draft-status").textContent.startsWith("quick_draft_failed:"),
    `a thrown model error reaches the status surface with its own reason (got ${JSON.stringify(runtime.controls.get("quick-draft-status").textContent)})`
  );
}

test.finish();
