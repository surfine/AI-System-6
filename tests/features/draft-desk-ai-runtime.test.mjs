import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createDraftDeskVm } from "../helpers/draft-desk-vm.mjs";

const test = createFeatureTest("draft-desk-ai-runtime");

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

// Existing body: execute the real request path that previously referenced an
// out-of-scope `slot`, then prove the safety version and new body both land.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-a", "这是旧正文，带着作者自己的判断。", { title: "旧标题" });
  runtime.context.modelResponder = async () => modelResult("这是明显不同的新正文，保留判断并补上了新的结构和结尾。");
  const result = await runtime.testApi.requestQuickDraft("draft");
  test.assert(result === true, "an existing-body AI rewrite completes without a ReferenceError");
  test.assert(
    project.quickDraft.workspace.body.includes("明显不同的新正文"),
    "the rewritten body is durably stored"
  );
  test.assert(
    project.quickDraft.workspace.versions.length === 1
      && project.quickDraft.workspace.versions[0].reason === "before-ai"
      && project.quickDraft.workspace.versions[0].body.includes("旧正文"),
    "an existing body creates exactly one before-ai Version"
  );
}

// First generation: there is material to write from, but no previous body, so
// the version list must remain meaningful rather than gaining an empty entry.
{
  const runtime = createDraftDeskVm();
  const project = runtime.addProject("project-empty");
  runtime.controls.get("quick-draft-say").value = "这是我想先说清楚的判断";
  runtime.controls.get("quick-draft-sources").value = "一条真实素材";
  runtime.context.modelResponder = async () => modelResult("这是第一次生成的正文，有足够内容形成一篇完整短稿。");
  const result = await runtime.testApi.requestQuickDraft("draft");
  test.assert(result === true, "a first generation succeeds from material input");
  test.assert(project.quickDraft.workspace.versions.length === 0, "a first generation does not create an empty before-ai Version");
}

// Project affinity: pause the real model await, switch the active project and
// replace the shared textarea with Project B, then release Project A's result.
{
  const runtime = createDraftDeskVm();
  const projectA = runtime.addProject("project-a", "A 的旧正文。", { title: "A" });
  const projectB = runtime.addProject("project-b", "B 的正文绝不能变化。", { title: "B" });
  const modelGate = runtime.deferred();
  const started = runtime.deferred();
  runtime.context.modelResponder = async () => {
    started.resolve();
    await modelGate.promise;
    return modelResult("A 的模型返回结果，不得进入 B。 ");
  };
  const pending = runtime.testApi.requestQuickDraft("draft");
  await started.promise;
  runtime.setActiveProject("project-b");
  modelGate.resolve();
  const result = await pending;
  test.assert(result === false, "a response is discarded after the active project changes");
  test.assert(projectB.quickDraft.workspace.body === "B 的正文绝不能变化。", "Project B remains byte-for-byte unchanged");
  test.assert(projectA.quickDraft.workspace.body === "A 的旧正文。", "the discarded result does not write Project A through Project B's UI");
  test.assert(runtime.controls.get("quick-draft-draft").value === "B 的正文绝不能变化。", "the shared Draft Desk textarea remains Project B's body");
}

// Protect sentinel failure: the model omits the real sentinel token. The
// request must fail without adding a version or changing the working body.
{
  const runtime = createDraftDeskVm();
  const original = "第一行。\n这行必须保护。\n最后一行。";
  const project = runtime.addProject("project-protected", original, { protectedRanges: [{ start: 2, end: 2 }] });
  runtime.context.modelResponder = async () => modelResult("第一行被改了。\n保护行也被改掉。\n最后一行。");
  const result = await runtime.testApi.requestQuickDraft("draft");
  test.assert(result === false, "a broken Protect sentinel rejects the model result");
  test.assert(project.quickDraft.workspace.body === original, "sentinel failure leaves the working body unchanged");
  test.assert(project.quickDraft.workspace.versions.length === 0, "sentinel failure does not add a before-ai Version");
}

test.finish();
