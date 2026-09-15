import { readdirSync } from "node:fs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { read } from "../helpers/feature-test-harness.mjs";
import { createDraftDeskVm } from "../helpers/draft-desk-vm.mjs";

const test = createFeatureTest("draft-desk-ai-runtime");
const composition = read("app/features/quick-draft-composition.js");

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
    (project.quickDraft.workspace.pendingDarkroom?.versions || []).length === 1
      && (project.quickDraft.workspace.pendingDarkroom?.versions || [])[0]?.reason === "before-ai"
      && (project.quickDraft.workspace.pendingDarkroom?.versions || [])[0]?.body.includes("旧正文"),
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
  test.assert((project.quickDraft.workspace.pendingDarkroom?.versions || []).length === 0, "a first generation does not create an empty before-ai Version");
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

// Mingming project affinity: the response is discarded when the active
// project changes, and neither project's durable body moves.
{
  const runtime = createDraftDeskVm();
  const projectA = runtime.addProject("project-a", "A 的正文。");
  const projectB = runtime.addProject("project-b", "B 的正文绝不能变化。");
  runtime.controls.get("quick-draft-format").value = "first-day-hands-on";
  // The lens loads on demand now, so the flow asks for it before it builds a
  // prompt. The sandbox supplies the loader beside the builder it already had.
  runtime.context.ensureMingmingLensModule = async () => {};
  runtime.context.buildMingmingRewritePrompt = () => "mingming prompt fixture";
  runtime.context.withMarkdownModelMessages = (messages) => messages;
  const modelGate = runtime.deferred();
  const started = runtime.deferred();
  runtime.context.fetchModelPayload = async () => {
    started.resolve();
    await modelGate.promise;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "A 的模型返回结果，完全不同的结构，不得进入 B。" } }] }),
    };
  };
  const pending = runtime.testApi.requestMingmingQuickDraft();
  await started.promise;
  runtime.setActiveProject("project-b");
  modelGate.resolve();
  const result = await pending;
  test.assert(result === false, "Mingming discards its result after the active project changes");
  test.assert(projectA.quickDraft.workspace.body === "A 的正文。", "Project A keeps its pre-request body");
  test.assert(projectB.quickDraft.workspace.body === "B 的正文绝不能变化。", "Project B is byte-for-byte unchanged");
  test.assert(runtime.controls.get("quick-draft-draft").value === "B 的正文绝不能变化。", "the shared textarea remains Project B's body");
}

// Adjustment Apply project affinity: a composite that lands after the project
// switch is discarded and never writes through Project B.
{
  const runtime = createDraftDeskVm();
  const projectA = runtime.addProject("project-a", "A 的正文。", {
    adjustmentLayers: [{ kind: "mingming", enabled: true, strength: 1 }],
  });
  const projectB = runtime.addProject("project-b", "B 的正文绝不能变化。");
  runtime.context.withMarkdownModelMessages = (messages) => messages;
  const modelGate = runtime.deferred();
  const started = runtime.deferred();
  runtime.context.fetchModelPayload = async () => {
    started.resolve();
    await modelGate.promise;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "合成的 A 文本，完全不同的内容结构，不得进入 B。" } }] }),
    };
  };
  const pending = runtime.testApi.applyAdjustmentLayers();
  await started.promise;
  runtime.setActiveProject("project-b");
  modelGate.resolve();
  const result = await pending;
  test.assert(result === false, "Adjustment Apply discards its composite after the project changes");
  test.assert((projectA.quickDraft.workspace.pendingDarkroom?.composition?.composite || "") === "", "Project A records no stale composite");
  test.assert(projectB.quickDraft.workspace.body === "B 的正文绝不能变化。", "Project B is byte-for-byte unchanged");
  test.assert(runtime.controls.get("quick-draft-draft").value === "B 的正文绝不能变化。", "the shared textarea remains Project B's body");
}

// Develop also guards its owning project after the confirm await and the
// revision write.
test.assertIncludes(composition, "createQuickDraftAsyncTask({ create: false })", "develop owns its project task");
test.assertIncludes(composition, "task.stillOwnsActiveProject()", "develop re-checks ownership after awaits");
test.assertIncludes(composition, "task.commit(patch, { captureForm: false })", "develop commits back to its owner project only");

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
  test.assert((project.quickDraft.workspace.pendingDarkroom?.versions || []).length === 0, "sentinel failure does not add a before-ai Version");
}

// Every Quick Draft request rides the watchdog, and the shared controller has
// exactly one owner.
//
// The raw pattern this replaces — `if (requestController)
// requestController.abort(); requestController = new AbortController();` with
// a bare `requestController = null` in `finally` — gives a cloud fetch no
// deadline. A request that never settles never reaches its `finally`, so
// `setBusy(true)` stands forever and the surface is wedged with no way back.
// Six call sites carried it before it was drained, which is why this is a gate
// and not a review note: a seventh must fail here rather than ship.
{
  const laneDir = new URL("../../apps/desktop/app/features/", import.meta.url);
  const laneFiles = readdirSync(laneDir)
    .filter((name) => name === "draft-desk.js" || /^quick-draft-.*\.js$/.test(name))
    .sort();
  test.assert(laneFiles.includes("draft-desk.js"), "the lane gate can see the module that owns the controller");
  test.assert(laneFiles.length > 1, "the lane gate can see the Quick Draft call sites");
  for (const name of laneFiles) {
    const source = read(`app/features/${name}`);
    if (name === "draft-desk.js") continue;
    test.assert(
      !source.includes("new AbortController()"),
      `${name} opens no raw AbortController — it calls beginQuickDraftRequest()`
    );
    test.assert(
      !source.includes("requestController"),
      `${name} never touches the shared controller directly`
    );
  }
  const owner = read("app/features/draft-desk.js");
  for (const helper of ["beginQuickDraftRequest", "settleQuickDraftRequest", "quickDraftRequestTimedOut"]) {
    test.assertIncludes(owner, `function ${helper}(`, `draft-desk.js still defines ${helper}`);
  }
  // The watchdog rides its own controller. A single shared timer id let one
  // request's settle defuse a newer request's watchdog, and that newer request
  // then hung forever — the exact wedge the deadline exists to prevent.
  test.assertIncludes(owner, "controller.quickDraftTimer", "the watchdog timer stays on the controller it guards");
}

test.finish();
