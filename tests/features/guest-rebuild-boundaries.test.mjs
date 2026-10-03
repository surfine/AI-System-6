// Real ProjectStore and receipt lifecycle; only persistence/confirmation and
// the independently durable revision store are controlled at their boundaries.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import { read } from "../helpers/feature-test-harness.mjs";

const manuscript = "# 灯塔\n\n开头。\n\n## 一\n\n甲。\n\n## 二\n\n乙。\n\n## 三\n\n丙。\n\n## 四\n\n丁。\n\n## 五\n\n戊。\n\n## 六\n\n己。";
const heads = ["一", "二", "三", "四", "五", "六"];
const keys = ["projects", "chatFiles", "chatFolders", "scraps", "projectReferences", "projectCdItems", "trashItems"];
const sources = ["core/state-stores", "core/run-receipts", "core/rebuild-pack", "features/guest-tools"];
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  const history = [];
  const statuses = [];
  const confirmations = [];
  const approval = { status: "approved", privilege: "change" };
  const context = {
    console: { warn() {} }, structuredClone, crypto: { randomUUID },
    document: { getElementById: () => null }, t: (key) => key,
    projects: [{ id: "p9", name: "灯塔", questionSheet: "# 问题单 · 灯塔", outline: "", drafts: [] }],
    activeProjectId: "p9",
    chatFiles: [{ id: "m1", projectId: "p9", type: "text", name: "灯塔", label: "final", body: manuscript }],
    chatFolders: [], scraps: [], projectReferences: [], projectCdItems: [], trashItems: [], imageAttachments: [],
    ragChunks: [], lastRetrievedContextItems: [], runtimeEnvironment: "multifinder", workspaceProfile: "writing",
    saveDeskState: async () => true, markDeskDirty() {}, renderPipeline() {}, scheduleRenderTasks() {}, updateMenuState() {},
    ensureRebuildPackModule: async () => true, setStatus: (message) => statuses.push(message),
    listDocumentRevisions: async () => history.slice().reverse(),
    createDocumentRevision: async (input) => { const revision = { id: randomUUID(), ...structuredClone(input) }; history.push(revision); return revision; },
    showSystemModal: () => { const gate = deferred(); confirmations.push(gate); return gate.promise; },
    getActiveProject: () => context.projects.find((project) => project.id === context.activeProjectId),
    createProjectRecord: (name) => ({ id: randomUUID(), name, outline: "", questionSheet: "", drafts: [] }),
    mountProject: (project) => { context.activeProjectId = project.id; },
    AISystem6GuestExecutor: { approvalFor: () => approval },
    AISystem6WriteLease: { assertCanWrite() {}, isReadOnly: () => false },
  };
  context.window = context;
  vm.createContext(context);
  for (const source of sources) vm.runInContext(read(`app/${source}.js`), context, { filename: `${source}.js` });
  const page = context.AISystem6GuestTools;
  const guest = { name: "Tester", privilege: "change", requestedPrivilege: "change" };
  const call = (tool, args = {}) => page.handleExecutorCall("tool.call", { tool, arguments: args, guest });
  const opened = await call("open_rebuild_context");
  const pack = {
    packVersion: 1, mode: "own", target: { kind: "round", projectId: "p9", sourceRevision: opened.sourceRevision },
    roundDate: "2026-09-26", roundTitle: "验收", manuscript: { markdown: manuscript, base: { text: manuscript }, changes: [] },
    sections: heads.map((title) => ({ title, covers: [title] })), factLedger: [], dossiers: [],
  };
  const created = await context.AISystem6RunReceipts.createReceipt({
    projectId: "p9", sourceAppId: "guest:Tester", intent: "rebuild", extraFields: {
      rebuildPack: pack, guestRebuild: { sourceRevision: opened.sourceRevision },
    },
  });
  assert.equal(created.ok, true, "fixture uses the real successful receipt commit");
  await context.AISystem6RunReceipts.updateReceipt(created.receiptId, { checkpointState: "awaitingCommit" });
  await context.AISystem6RunReceipts.finishReceipt(created.receiptId, { status: "completed" });
  const receipt = () => context.AISystem6RunReceipts.getReceipt(created.receiptId);
  const state = () => JSON.stringify(Object.fromEntries(keys.map((key) => [key, context[key]])));
  const pendingAdoption = async () => {
    const before = confirmations.length;
    const pending = page.adoptRebuildPack(created.receiptId);
    for (let attempt = 0; confirmations.length === before && attempt < 20; attempt++) await Promise.resolve();
    assert.ok(confirmations.length > before, "adoption actually reaches the confirmation boundary");
    return { pending, confirm: confirmations.at(-1) };
  };
  return { context, page, approval, call, history, statuses, confirmations, pack, receipt, state, pendingAdoption, receiptId: created.receiptId };
}

function loadActualProjectCdWriter(f) {
  const source = read("app/features/export-import.js");
  f.context.activeTextFileId = "m1"; f.context.currentLanguage = "zh";
  f.context.sanitizeFilename = (name) => name; f.context.countMarkdownWords = (body) => body.length;
  f.context.selectedProjectCdItemIds = new Set(); f.context.renderProjectCd = () => {};
  vm.runInContext(source.slice(source.indexOf("async function addProjectCdItem("), source.indexOf("function activeTeachTextCanBurn(")), f.context, { filename: "export-import.ProjectCd.js" });
}

const cases = [];
function check(name, body) { cases.push({ name, body }); }

check("failed adoption keeps its awaiting receipt and old text; retry adopts atomically", async () => {
  const f = await fixture();
  const before = f.state();
  let saves = 0;
  f.context.saveDeskState = async () => { saves++; return false; };
  const first = await f.pendingAdoption(); first.confirm.resolve("yes");
  await assert.rejects(first.pending, (error) => error.code === "STORE_PERSIST_FAILED");
  assert.equal(f.state(), before, "real store restores manuscript, other objects AND waiting receipt");
  assert.equal(f.receipt().runReceipt.userAction, "");
  assert.equal(f.receipt().runReceipt.checkpointState, "awaitingCommit");
  assert.ok(f.history.some((revision) => revision.operation === "restore-before" && revision.body === manuscript), "old durable text remains recoverable");
  assert.ok(f.history.some((revision) => revision.operation === "rebuild-candidate"), "unadopted generated text is explicitly a candidate");
  assert.ok(!f.history.some((revision) => revision.operation === "rebuild-round"), "failed landing never claims an adopted history head");
  assert.ok(!f.statuses.includes("guest_rebuild_adopted"));
  assert.equal(saves, 1, "adoption attempts one atomic desk save");
  f.context.saveDeskState = async () => { saves++; return true; };
  const second = await f.pendingAdoption(); second.confirm.resolve("yes");
  assert.ok(await second.pending);
  assert.equal(saves, 2, "retry does not split receipt acceptance into later saves");
  assert.equal(f.receipt().runReceipt.userAction, "accept");
  assert.equal(f.receipt().runReceipt.status, "completed");
  assert.equal(f.receipt().runReceipt.destination, "projectDisk");
  assert.ok(f.receipt().body.includes("Adopted: yes"), "receipt projection matches stored acceptance");
  assert.equal(await f.page.adoptRebuildPack(f.receiptId), null, "already accepted receipt cannot land twice");
});

for (const change of ["revoke", "project", "text", "lease"]) {
  check(`confirmation rechecks ${change} before writing revisions or target`, async () => {
    const f = await fixture();
    const opening = await f.pendingAdoption();
    if (change === "revoke") f.approval.status = "denied";
    if (change === "project") { f.context.projects.push({ id: "other", name: "其他" }); f.context.activeProjectId = "other"; }
    if (change === "text") f.context.chatFiles.find((file) => file.id === "m1").body += "\n作者新写。";
    if (change === "lease") f.context.AISystem6WriteLease.assertCanWrite = () => { throw new Error("read-only"); };
    const afterWriterChange = f.state();
    let saves = 0; f.context.saveDeskState = async () => { saves++; return true; };
    opening.confirm.resolve("yes");
    const outcome = await opening.pending.catch((error) => error);
    assert.ok(outcome === null || outcome instanceof Error || String(outcome?.message || ""), "stale/revoked adoption is refused");
    assert.equal(f.state(), afterWriterChange, "refusal leaves writer changes and original candidate receipt intact");
    assert.equal(saves, 0); assert.equal(f.history.length, 0);
    assert.notEqual(f.receipt().runReceipt.userAction, "accept");
  });
}

check("queued confirmation cannot adopt an accepted receipt after its lock releases", async () => {
  const f = await fixture();
  // A legacy waiting receipt has no bound source revision; acceptance must be
  // checked independently of the source-change guard and in-flight lock.
  f.receipt().guestRebuild.sourceRevision = "";
  const first = await f.pendingAdoption();
  const secondPending = f.page.adoptRebuildPack(f.receiptId);
  for (let attempt = 0; f.confirmations.length < 2 && attempt < 20; attempt++) await Promise.resolve();
  assert.equal(f.confirmations.length, 2);
  let saves = 0; f.context.saveDeskState = async () => { saves++; return true; };
  first.confirm.resolve("yes"); assert.ok(await first.pending);
  const adoptedState = f.state(); const adoptedHistory = f.history.length;
  f.confirmations[1].resolve("yes");
  assert.equal(await secondPending, null);
  assert.equal(saves, 1); assert.equal(f.history.length, adoptedHistory); assert.equal(f.state(), adoptedState);
});

check("new-project failed first save does not strand an empty mounted project", async () => {
  const f = await fixture(); const before = f.state(); const active = f.context.activeProjectId;
  const pack = { ...f.pack, target: { kind: "new-project", name: "新硬盘" }, manuscript: { markdown: manuscript, base: { text: manuscript }, changes: [] } };
  f.context.saveDeskState = async () => false;
  const error = await f.page.createProjectFromRebuildPack(pack).then(() => null, (cause) => cause);
  assert.ok(error, "a genuine first-save refusal rejects");
  assert.ok(!String(error.message).includes("spec is not defined"), "construction must reach the actual save boundary");
  assert.equal(f.state(), before); assert.equal(f.context.activeProjectId, active);
});

check("blocked document, revision, receipt and resource reads fail closed", async () => {
  const f = await fixture();
  const file = f.context.chatFiles.find((entry) => entry.id === "m1"); file.finderLabel = "blocked";
  f.receipt().finderLabel = "blocked";
  f.context.AISystem6DocumentRevisions = { list: async () => [{ id: "rev1", body: "禁止旧稿正文", createdAt: "2026-09-30" }] };
  for (const [tool, args] of [
    ["read_project_object", { kind: "file", objectId: "m1" }],
    ["map_document", { objectId: "m1" }],
    ["read_document_revision", { documentId: "m1", revisionId: "rev1" }],
    ["read_run_receipt", { receiptId: f.receiptId }],
    ["open_rebuild_context", {}],
  ]) await assert.rejects(f.call(tool, args), /source-blocked/, tool);
  assert.throws(() => f.page.readResource({ uri: "ais6://file/m1" }), /source-blocked/);
});

check("a revision save failure never starts the desk landing commit", async () => {
  const f = await fixture(); const before = f.state();
  let saves = 0; f.context.saveDeskState = async () => { saves++; return true; };
  f.context.createDocumentRevision = async () => { throw new Error("revision-persist-failed"); };
  const opening = await f.pendingAdoption(); opening.confirm.resolve("yes");
  await assert.rejects(opening.pending, /revision-persist-failed/);
  assert.equal(saves, 0); assert.equal(f.state(), before);
});

check("revocation during revision persistence is rechecked before the queued desk commit", async () => {
  const f = await fixture(); const before = f.state();
  const revisionGate = deferred(); const entered = deferred();
  f.context.createDocumentRevision = async (input) => {
    f.history.push(structuredClone(input)); entered.resolve(); await revisionGate.promise;
  };
  let saves = 0; f.context.saveDeskState = async () => { saves++; return true; };
  const opening = await f.pendingAdoption(); opening.confirm.resolve("yes");
  await entered.promise; f.approval.status = "denied"; revisionGate.resolve();
  await assert.rejects(opening.pending, /guest-permission-revoked/);
  assert.equal(saves, 0); assert.equal(f.state(), before);
  assert.ok(!f.history.some((revision) => revision.operation === "rebuild-round"));
});

check("a failed save preserves author edits made while persistence was awaiting", async () => {
  const f = await fixture(); const saveGate = deferred(); const entered = deferred();
  f.context.saveDeskState = () => { entered.resolve(); return saveGate.promise; };
  const opening = await f.pendingAdoption(); opening.confirm.resolve("yes"); await entered.promise;
  f.context.chatFiles.find((file) => file.id === "m1").body = "# 作者在保存期间新写";
  saveGate.resolve(false);
  await assert.rejects(opening.pending, (error) => error.code === "STORE_PERSIST_FAILED");
  assert.equal(f.context.chatFiles.find((file) => file.id === "m1").body, "# 作者在保存期间新写");
  assert.equal(f.receipt().runReceipt.userAction, "");
  assert.equal(f.receipt().runReceipt.checkpointState, "awaitingCommit");
});

check("new-project rollback preserves an author edit during its first save", async () => {
  const f = await fixture(); const saveGate = deferred(); const entered = deferred();
  const pack = { ...f.pack, target: { kind: "new-project", name: "新硬盘" } };
  f.context.saveDeskState = () => { entered.resolve(); return saveGate.promise; };
  const pending = f.page.createProjectFromRebuildPack(pack); await entered.promise;
  const newProject = f.context.getActiveProject(); newProject.outline = "## 作者已开始编辑";
  saveGate.resolve(false); await assert.rejects(pending, /receipt could not be written/);
  assert.equal(f.context.getActiveProject().id, newProject.id);
  assert.equal(f.context.getActiveProject().outline, "## 作者已开始编辑");
  assert.ok(f.context.projects.some((project) => project.id === "p9"));
});

check("blocked active manuscript cannot be read through writing route", async () => {
  const f = await fixture();
  f.context.activeTextFileId = "m1";
  f.context.teachTextBodyInput = { value: manuscript };
  f.context.chatFiles.find((file) => file.id === "m1").finderLabel = "blocked";
  await assert.rejects(f.call("read_route_document", { document: "manuscript" }), /source-blocked/);
  assert.throws(() => f.page.readResource({ uri: "ais6://route/manuscript" }), /source-blocked/);
});

check("blocked receipt proposal is omitted from list previews", async () => {
  const f = await fixture();
  f.receipt().finderLabel = "blocked"; f.receipt().runReceipt.proposal = "禁止回执提议正文";
  const listed = await f.call("list_run_receipts");
  assert.ok(!JSON.stringify(listed).includes("禁止回执提议正文"));
});

check("blocked DocMap resource cannot disclose copied source labels", async () => {
  const f = await fixture();
  f.context.chatFiles.push({ id: "map1", projectId: "p9", name: "禁止结构", finderLabel: "blocked", docMap: { nodes: [{ label: "禁止节点正文", snippet: "禁止原文片段" }], edges: [] } });
  assert.throws(() => f.page.readResource({ uri: "ais6://docmap/map1" }), /source-blocked|No such DocMap/);
});

check("successful landing keeps author input typed during its save", async () => {
  const f = await fixture(); const saveGate = deferred(); const entered = deferred();
  f.context.activeTextFileId = "m1";
  f.context.teachTextBodyInput = { value: manuscript };
  f.context.questionSheetBodyInput = { value: f.context.getActiveProject().questionSheet };
  f.context.saveDeskState = () => { entered.resolve(); return saveGate.promise; };
  const opening = await f.pendingAdoption(); opening.confirm.resolve("yes"); await entered.promise;
  f.context.teachTextBodyInput.value = "# 作者在保存成功前继续写";
  f.context.questionSheetBodyInput.value = "# 作者继续修改问题";
  saveGate.resolve(true); assert.ok(await opening.pending);
  assert.equal(f.context.teachTextBodyInput.value, "# 作者在保存成功前继续写");
  assert.equal(f.context.questionSheetBodyInput.value, "# 作者继续修改问题");
  assert.equal(f.receipt().runReceipt.userAction, "accept");
});

check("personal full backup returns only metadata to the guest", async () => {
  const f = await fixture();
  f.context.chatFiles.find((file) => file.id === "m1").finderLabel = "blocked";
  f.context.buildProjectDiskExport = async () => ({ format: "ais6", integrity: { contentHash: "owner-backup" }, counts: { files: 1 }, files: [{ body: "作者个人备份的禁止正文" }] });
  let downloaded = false; f.context.exportActiveProjectDisk = async () => { downloaded = true; return true; };
  const result = await f.call("export_project_disk");
  assert.equal(downloaded, true); assert.equal(result.downloaded, true);
  assert.ok(!JSON.stringify(result).includes("作者个人备份的禁止正文"));
  assert.equal(result.contentHash, "owner-backup");
});

check("review archive and accepted receipt share the actual Project CD transaction", async () => {
  const f = await fixture(); loadActualProjectCdWriter(f);
  await f.context.AISystem6RunReceipts.updateReceipt(f.receiptId, { proposal: "作者可参考的评阅意见。" });
  const before = f.state(); let saves = 0;
  f.context.saveDeskState = async () => { saves++; return false; };
  const pending = f.page.adoptGuestReview(f.receiptId);
  while (!f.confirmations.length) await Promise.resolve();
  f.confirmations.at(-1).resolve("yes");
  await assert.rejects(pending, (error) => error.code === "STORE_PERSIST_FAILED");
  assert.equal(f.state(), before); assert.equal(f.receipt().runReceipt.userAction, "");
  assert.equal(f.context.projectCdItems.length, 0);
  assert.equal(saves, 1, "CD and receipt attempt only one storage commit");
  f.context.saveDeskState = async () => { saves++; return true; };
  const retry = f.page.adoptGuestReview(f.receiptId);
  while (f.confirmations.length < 2) await Promise.resolve();
  f.confirmations.at(-1).resolve("yes");
  const item = await retry;
  assert.equal(saves, 2); assert.equal(f.receipt().runReceipt.userAction, "accept");
  assert.equal(f.receipt().runReceipt.destination, "projectCd");
  assert.ok(f.receipt().body.includes("Adopted: yes"));
  assert.equal(f.receipt().runReceipt.outputObjectIds[0], item.id);
  assert.equal(f.context.projectCdItems.length, 1);
  assert.equal(await f.page.adoptGuestReview(f.receiptId), null);
});

const failures = [];
for (const { name, body } of cases) {
  try { await body(); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error }); console.error(`FAIL ${name}: ${error.stack}`); }
}
if (failures.length) process.exitCode = 1;
else console.log(`guest-rebuild-boundaries: ${cases.length} behavior checks passed`);
