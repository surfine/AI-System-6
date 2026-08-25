// Application Registry — one place that decides which app handles which
// object/intent.
//
// System semantics live here; the appearance system is never consulted and
// no theme knowledge exists in this module. App-internal logic stays in the
// target apps: registry handlers are thin adapters over existing entry
// points (openTextFile, runClaimCheck, makeDocMapFromCurrentSource, ...).
// The droplets keep their declared command contract; this registry only
// owns the object -> app routing decision.

// "develop" is 文字亮室's intent, and it is its own rather than a reuse: edit
// belongs to TeachText, which is the default opener for a text object, and
// review belongs to the Review Desk. A document is developed, not edited, when
// the negative is left alone and the change is a stack of adjustments the
// writer can switch off again.
const applicationIntents = Object.freeze(["open", "read", "edit", "review", "develop", "map", "present", "attach", "export"]);
const applicationsById = new Map();

function normalizeApplicationIntent(intent) {
  const value = String(intent || "").toLowerCase();
  return applicationIntents.includes(value) ? value : "";
}

// The item kind is the routing key. A saved DocMap file is a "docmap" object,
// not a plain TeachText document, so open routing never misplaces it.
function applicationItemKind(item) {
  if (!item) return "";
  if (item.type === "chat") return "chat";
  if (item.type === "alias") return "alias";
  if (item.type === "text") {
    if (item.docMap || (typeof isExportedDocMapMarkdown === "function" && isExportedDocMapMarkdown(String(item.body || "")))) {
      return "docmap";
    }
    return "text";
  }
  return String(item.type || item.artifactKind || "");
}

function registerApplication(descriptor) {
  if (!descriptor || typeof descriptor.id !== "string" || !descriptor.id.trim()) {
    throw new TypeError("Application id is required.");
  }
  if (applicationsById.has(descriptor.id)) {
    throw new Error(`Application already registered: ${descriptor.id}`);
  }
  if (typeof descriptor.handler !== "function") {
    throw new TypeError(`Application ${descriptor.id} requires a handler.`);
  }
  const intents = [...new Set((descriptor.acceptedIntents || []).map(normalizeApplicationIntent).filter(Boolean))];
  const kinds = [...new Set((descriptor.acceptedItemKinds || []).map(String).filter(Boolean))];
  const recordRuns = [...new Set((descriptor.recordsRuns || []).map(normalizeApplicationIntent).filter(Boolean))];
  const record = Object.freeze({
    id: descriptor.id,
    labelKey: String(descriptor.labelKey || ""),
    windowName: String(descriptor.windowName || ""),
    acceptedItemKinds: Object.freeze(kinds),
    acceptedIntents: Object.freeze(intents),
    defaultOpener: descriptor.defaultOpener === true,
    recordsRuns: Object.freeze(recordRuns),
    handler: descriptor.handler,
  });
  applicationsById.set(record.id, record);
  return record;
}

function getApplication(appId) {
  return applicationsById.get(String(appId || "")) || null;
}

function resolveApplicationForItem(item, intent = "open") {
  const normalized = normalizeApplicationIntent(intent);
  if (!normalized) return { ok: false, reason: "unknown-intent", appId: "" };
  const kind = applicationItemKind(item);
  if (!kind) return { ok: false, reason: "unknown-kind", appId: "" };
  const candidates = [...applicationsById.values()].filter((app) =>
    app.acceptedItemKinds.includes(kind) && app.acceptedIntents.includes(normalized)
  );
  if (!candidates.length) return { ok: false, reason: "no-handler", appId: "" };
  const opener = normalized === "open" || normalized === "read"
    ? candidates.find((app) => app.defaultOpener)
    : null;
  const chosen = opener || candidates[0];
  return { ok: true, appId: chosen.id, app: chosen, reason: "" };
}

async function resolveDispatchItems(items = []) {
  const files = [];
  const seenTargetIds = new Set();
  if (typeof ensureFinderObjectsModule === "function") await ensureFinderObjectsModule();
  for (const item of items) {
    if (!item) continue;
    if (item.type !== "alias") {
      if (!seenTargetIds.has(item.id)) {
        seenTargetIds.add(item.id);
        files.push(item);
      }
      continue;
    }
    const resolver = window.AISystem6FinderObjects?.resolveProjectFileForUse;
    const resolution = typeof resolver === "function" ? resolver(item) : null;
    if (!resolution || resolution.reason === "broken-alias") {
      return { blocked: true, reason: "broken-alias", file: item, files: [] };
    }
    if (resolution.reason === "non-file-alias") {
      return { blocked: true, reason: "non-file-alias", file: item, files: [] };
    }
    const target = resolution.target;
    if (target && !seenTargetIds.has(target.id)) {
      seenTargetIds.add(target.id);
      files.push(target);
    }
  }
  return { blocked: false, files };
}

async function recordDispatchFailure(appId, receiptId, activityHandle, { status, publicErrorReason, reason, result = null, error = null }) {
  if (receiptId && typeof window.AISystem6RunReceipts?.finishReceipt === "function") {
    try {
      await window.AISystem6RunReceipts.finishReceipt(receiptId, {
        status,
        publicErrorReason,
        outputObjectIds: Array.isArray(result?.outputObjectIds) ? result.outputObjectIds : [],
        destination: String(result?.destination || ""),
      });
    } catch (receiptError) {
      console.warn("Run receipt failure recording failed.", receiptError);
    }
  }
  if (activityHandle && typeof window.AISystem6AssistantActivity?.endOperation === "function") {
    try {
      window.AISystem6AssistantActivity.endOperation(activityHandle, { ok: false, error });
    } catch (activityError) {
      console.warn("Assistant activity error recording failed.", activityError);
    }
  }
  return { ok: false, appId, receiptId, reason, result, error };
}

function applicationDispatchStatus(reason) {
  if (reason === "broken-alias") return t("alias_broken", "—");
  if (reason === "non-file-alias") return t("application_dispatch_non_file");
  if (reason === "cross-project") return t("application_dispatch_cross_project");
  if (reason === "no-handler") return t("application_dispatch_no_handler");
  if (reason === "unsupported-intent") return t("application_dispatch_unsupported_intent");
  if (reason === "unsupported-kind") return t("application_dispatch_unsupported_kind");
  if (reason === "no-items") return t("select_finder_item_first");
  return "";
}

// Handler result contract: { ok, reason?, publicErrorReason?,
// outputObjectIds?, affectedObjectIds?, destination? }. `ok:false` is a
// normal business failure (empty input, failed attach, ...), not an
// exception; it must produce an unsuccessful terminal path so receipts are
// never marked completed and Assistant Activity never enters ready.
async function dispatchApplicationIntent(appId, { intent, items = [], sourceAppId = "", projectId = "", options = {} } = {}) {
  const normalized = normalizeApplicationIntent(intent);
  if (!normalized) {
    return { ok: false, reason: "unknown-intent", appId: "" };
  }

  const resolved = await resolveDispatchItems(Array.isArray(items) ? items : [items]);
  if (resolved.blocked) {
    const message = applicationDispatchStatus(resolved.reason);
    if (message && typeof setStatus === "function") setStatus(message);
    return { ok: false, reason: resolved.reason, appId: "" };
  }
  if (!resolved.files.length) {
    if (typeof setStatus === "function") setStatus(applicationDispatchStatus("no-items"));
    return { ok: false, reason: "no-items", appId: "" };
  }

  const targetProjectId = String(
    projectId
    || (typeof getActiveProject === "function" ? getActiveProject()?.id : "")
    || activeProjectId
    || ""
  );
  const foreign = resolved.files.find((file) =>
    targetProjectId && String(file.projectId || "") && String(file.projectId) !== targetProjectId
  );
  if (foreign) {
    if (typeof setStatus === "function") setStatus(applicationDispatchStatus("cross-project"));
    return { ok: false, reason: "cross-project", appId: "" };
  }

  let app = appId ? getApplication(appId) : null;
  if (!app) {
    const resolution = resolveApplicationForItem(resolved.files[0], normalized);
    app = resolution.ok ? resolution.app : null;
  }
  if (!app) {
    if (typeof setStatus === "function") setStatus(applicationDispatchStatus("no-handler"));
    return { ok: false, reason: "no-handler", appId: "" };
  }

  // Explicit appId cannot bypass descriptor capability; fail closed before
  // the handler runs so no receipt is created on a mismatch.
  if (!app.acceptedIntents.includes(normalized)) {
    if (typeof setStatus === "function") setStatus(applicationDispatchStatus("unsupported-intent"));
    return { ok: false, reason: "unsupported-intent", appId: app.id };
  }
  const unsupportedKind = resolved.files.find((file) => !app.acceptedItemKinds.includes(applicationItemKind(file)));
  if (unsupportedKind) {
    if (typeof setStatus === "function") setStatus(applicationDispatchStatus("unsupported-kind"));
    return { ok: false, reason: "unsupported-kind", appId: app.id };
  }

  const shouldRecord = app.recordsRuns.includes(normalized);
  let receiptId = "";
  if (shouldRecord && typeof window.AISystem6RunReceipts?.createReceipt === "function") {
    try {
      const created = await window.AISystem6RunReceipts.createReceipt({
        projectId: targetProjectId,
        sourceAppId: sourceAppId || app.id,
        intent: normalized,
        inputObjectIds: resolved.files.map((file) => file.id),
        sourceScope: options.sourceScope || null,
        provider: options.provider || "",
        model: options.model || "",
        options: { labelKey: app.labelKey },
        replayContract: {
          appId: app.id,
          intent: normalized,
          inputObjectIds: resolved.files.map((file) => file.id),
        },
      });
      if (created?.ok) receiptId = created.receiptId;
    } catch (error) {
      console.warn("Run receipt creation failed; dispatch continues.", error);
    }
  }

  let activityHandle = null;
  if (shouldRecord && typeof window.AISystem6AssistantActivity?.beginOperation === "function") {
    try {
      activityHandle = window.AISystem6AssistantActivity.beginOperation({
        runId: receiptId || "",
        projectId: targetProjectId,
        ownerAppId: app.id,
        windowName: app.windowName,
        targetObjectId: resolved.files[0]?.id || "",
        labelKey: app.labelKey || "",
        cancellable: options.cancellable === true,
      });
    } catch (error) {
      console.warn("Assistant activity begin failed; dispatch continues.", error);
    }
  }

  try {
    const result = await app.handler(resolved.files, {
      intent: normalized,
      sourceAppId,
      projectId: targetProjectId,
      options,
      receiptId,
    });
    if (result?.ok === false) {
      const publicErrorReason = String(result.publicErrorReason || "");
      if (publicErrorReason && typeof setStatus === "function") setStatus(publicErrorReason);
      return recordDispatchFailure(app.id, receiptId, activityHandle, {
        status: "failed",
        publicErrorReason,
        reason: String(result.reason || "handler-rejected"),
        result,
      });
    }
    const outputObjectIds = Array.isArray(result?.outputObjectIds) ? result.outputObjectIds : [];
    const affectedObjectIds = Array.isArray(result?.affectedObjectIds) ? result.affectedObjectIds : [];
    const destination = String(result?.destination || "");
    if (receiptId && typeof window.AISystem6RunReceipts?.finishReceipt === "function") {
      try {
        await window.AISystem6RunReceipts.finishReceipt(receiptId, {
          status: "completed",
          outputObjectIds,
          affectedObjectIds,
          destination,
        });
      } catch (error) {
        console.warn("Run receipt finish failed.", error);
      }
    }
    if (activityHandle && typeof window.AISystem6AssistantActivity?.endOperation === "function") {
      try {
        window.AISystem6AssistantActivity.endOperation(activityHandle, { ok: true });
      } catch (error) {
        console.warn("Assistant activity end failed.", error);
      }
    }
    return { ok: true, appId: app.id, receiptId, result };
  } catch (error) {
    const cancelled = error?.name === "AbortError" || options?.signal?.aborted === true;
    if (typeof setStatus === "function") {
      setStatus(cancelled ? t("stopped") : String(error?.message || error));
    }
    return recordDispatchFailure(app.id, receiptId, activityHandle, {
      status: cancelled ? "cancelled" : "failed",
      publicErrorReason: cancelled ? "" : String(error?.message || error),
      reason: cancelled ? "cancelled" : "handler-error",
      error,
    });
  }
}

async function openProjectObject(itemOrId, intent = "open") {
  let item = itemOrId;
  if (typeof itemOrId === "string" && typeof chatFiles !== "undefined" && typeof isInActiveProject === "function") {
    item = chatFiles.find((file) => file.id === itemOrId && isInActiveProject(file)) || null;
  }
  if (!item) {
    if (typeof setStatus === "function") setStatus(t("select_finder_item_first"));
    return { ok: false, reason: "missing" };
  }
  return dispatchApplicationIntent("", { intent, items: [item], sourceAppId: "finder" });
}

// ---- First-phase registrations -------------------------------------------
// These are thin adapters over existing entry points; the registry owns the
// routing decision only. `recordsRuns` marks intents that produce a durable
// Run Receipt (model-backed or artifact-transforming work); plain opens are
// not logged so the Run Records folder stays quiet.

registerApplication({
  id: "teachText",
  labelKey: "teachtext_label",
  windowName: "teachText",
  acceptedItemKinds: ["text"],
  acceptedIntents: ["open", "read", "edit", "export"],
  defaultOpener: true,
  recordsRuns: ["export"],
  handler: async (items, context) => {
    const file = items[0];
    if (!file) return { ok: false, reason: "missing" };
    if (context.intent === "export") {
      if (typeof downloadMarkdown === "function") {
        downloadMarkdown(String(file.body || ""), file.name);
      }
      // A download is not a Project durable object; the source document is
      // only affected (read + exported), never produced by this run.
      return { ok: true, affectedObjectIds: [file.id], destination: "download" };
    }
    if (typeof openTextFile === "function") openTextFile(file.id);
    return { ok: true };
  },
});

registerApplication({
  id: "docMap",
  labelKey: "docmap",
  windowName: "docMap",
  acceptedItemKinds: ["text", "docmap"],
  acceptedIntents: ["open", "map"],
  defaultOpener: true,
  recordsRuns: ["map"],
  handler: async (items, context) => {
    const file = items[0];
    if (!file) return { ok: false, reason: "missing" };
    if (context.intent === "map") {
      if (!String(file.body || "").trim()) {
        return { ok: false, reason: "empty", publicErrorReason: t("docmap_no_text") };
      }
      if (typeof ensureDocMapModule === "function") await ensureDocMapModule();
      if (typeof makeDocMapFromCurrentSource === "function") {
        await makeDocMapFromCurrentSource({
          text: file.body.trim(),
          label: file.name,
          scope: "documents",
          meta: { fileId: file.id, fileType: file.type },
          threshold: typeof docMapMinDocumentChars === "number" ? docMapMinDocumentChars : 1,
        });
      }
      // DocMap renders a temporary UI map; it creates no durable Project
      // file here, so nothing was produced. The source is the affected object.
      return { ok: true, affectedObjectIds: [file.id] };
    }
    if (!window.AISystem6DocMapLoaded && typeof ensureDocMapModule === "function") {
      await ensureDocMapModule();
    }
    if (typeof openSavedDocMapFile === "function" && openSavedDocMapFile(file)) {
      return { ok: true };
    }
    return { ok: false, reason: "not-docmap" };
  },
});

registerApplication({
  id: "reviewDesk",
  labelKey: "review_desk",
  windowName: "reviewDesk",
  acceptedItemKinds: ["text"],
  acceptedIntents: ["open", "review"],
  recordsRuns: ["review"],
  handler: async (items, context) => {
    const file = items[0];
    if (!file) return { ok: false, reason: "missing" };
    if (context.intent === "open") {
      if (typeof window.AISystem6ReviewDesk?.openDocument === "function") {
        const opened = await window.AISystem6ReviewDesk.openDocument({
          documentId: file.id,
          mode: context.options?.mode || "facts",
        });
        return { ok: opened !== false };
      }
      if (typeof openTextFile === "function") openTextFile(file.id);
      if (typeof openWindow === "function") openWindow("reviewDesk");
      return { ok: true };
    }
    if (typeof openTextFile === "function") openTextFile(file.id);
    if (typeof openWindow === "function") openWindow("teachText");
    if (typeof runClaimCheck === "function") await runClaimCheck();
    // Review Desk shows its results in the window; the manuscript is
    // inspected (affected) but not produced by this run.
    return { ok: true, affectedObjectIds: [file.id] };
  },
});

registerApplication({
  id: "clioStage",
  labelKey: "clio_stage_label",
  windowName: "clioStage",
  acceptedItemKinds: ["text", "docmap"],
  acceptedIntents: ["present"],
  recordsRuns: ["present"],
  handler: async (items) => {
    const file = items[0];
    if (!file || !String(file.body || "").trim()) return { ok: false, reason: "empty" };
    if (typeof ensureSlidesExportModule === "function") await ensureSlidesExportModule();
    let createdFile = null;
    if (typeof generateMarpMarkdownAndOpenClioStage === "function") {
      createdFile = await generateMarpMarkdownAndOpenClioStage({
        markdown: file.body,
        title: file.name,
        folder: typeof preferredFolderName === "function" ? preferredFolderName() : "",
      });
    }
    if (!createdFile) return { ok: false, reason: "present-failed" };
    // ClioStage writes a durable *.slides.md document; only that new object
    // is the run's output. The source document was used as input/affected.
    return {
      ok: true,
      outputObjectIds: [createdFile.id],
      affectedObjectIds: [file.id],
    };
  },
});

registerApplication({
  id: "lightroom",
  labelKey: "lightroom_title",
  windowName: "lightroom",
  acceptedItemKinds: ["text"],
  acceptedIntents: ["develop"],
  // Opening the darkroom produces nothing on its own: it reads a document and
  // shows what earlier passes did to it. Develop, the action that writes, keeps
  // its own receipt where it happens.
  recordsRuns: [],
  handler: async (items) => {
    const file = items[0];
    if (!file) return { ok: false, reason: "missing" };
    const runtime = window.AISystem6QuickDraft;
    if (typeof runtime?.developDocument !== "function") return { ok: false, reason: "no-handler" };
    const opened = await runtime.developDocument(file.id);
    if (!opened) return { ok: false, reason: "develop-failed" };
    return { ok: true, affectedObjectIds: [file.id], destination: "lightroom" };
  },
});

registerApplication({
  id: "projectCd",
  labelKey: "project_cd",
  windowName: "projectCd",
  acceptedItemKinds: ["text"],
  acceptedIntents: ["attach"],
  recordsRuns: ["attach"],
  handler: async (items) => {
    const file = items[0];
    if (!file || !String(file.body || "").trim()) return { ok: false, reason: "empty" };
    if (typeof addProjectCdItem === "function") {
      const item = await addProjectCdItem(file.body, file.name, {
        sourceDocumentId: file.id,
        sourceKind: "markdown",
      });
      if (!item) return { ok: false, reason: "attach-failed" };
      if (typeof openWindow === "function") openWindow("projectCd");
      return { ok: true, outputObjectIds: [item.id], destination: "projectCd" };
    }
    return { ok: false, reason: "no-handler" };
  },
});

registerApplication({
  id: "clioTalk",
  labelKey: "assistant_label",
  windowName: "assistant",
  acceptedItemKinds: ["chat"],
  acceptedIntents: ["open", "read", "edit", "attach"],
  defaultOpener: true,
  recordsRuns: [],
  handler: async (items) => {
    const file = items[0];
    if (!file) return { ok: false, reason: "missing" };
    if (typeof openChatFileWindow === "function") openChatFileWindow(file.id);
    return { ok: true };
  },
});

// ---- Application lifecycle -----------------------------------------------
// Optional. An application that registers no lifecycle behaves exactly as it
// did before: the desktop only calls hooks an app declared.
//
//   onSuspend()  save recoverable state, stop the continuing cost
//   onResume()   bring the running app back; never re-initialize it
//   onDispose()  release everything
//
// The registry owns the state machine and the error boundary, and reads no
// DOM: the caller decides which applications are in the foreground and hands
// that set in. The same contract therefore covers a hidden window, a hidden
// MultiFinder app, and a backgrounded Home Screen App.

const applicationLifecycles = new Map();

function registerApplicationLifecycle(appId, handlers = {}) {
  const id = String(appId || "").trim();
  if (!id) throw new TypeError("Application lifecycle requires an app id.");
  const hook = (name) => (typeof handlers[name] === "function" ? handlers[name] : null);
  // Re-registering (a module reloaded, an app rebuilt after dispose) starts
  // the app active again — dispose is never the resting state of a live app.
  const record = {
    id,
    state: "active",
    onSuspend: hook("onSuspend"),
    onResume: hook("onResume"),
    onDispose: hook("onDispose"),
  };
  applicationLifecycles.set(id, record);
  return () => {
    if (applicationLifecycles.get(id) === record) applicationLifecycles.delete(id);
  };
}

function getApplicationLifecycleState(appId) {
  return applicationLifecycles.get(String(appId || ""))?.state || "";
}

// A throwing hook must not wedge the app: the state still advances, so an app
// whose suspend half-failed can still be resumed instead of staying dark.
async function runApplicationLifecycleHook(record, hookName, nextState, reason) {
  const handler = record[hookName];
  record.state = nextState;
  if (!handler) return true;
  try {
    await handler({ appId: record.id, reason: String(reason || "") });
    return true;
  } catch (error) {
    console.warn(`Application ${record.id} ${hookName} failed.`, error);
    return false;
  }
}

async function suspendApplication(appId, reason = "") {
  const record = applicationLifecycles.get(String(appId || ""));
  if (!record || record.state !== "active") return false;
  return runApplicationLifecycleHook(record, "onSuspend", "suspended", reason);
}

async function resumeApplication(appId, reason = "") {
  const record = applicationLifecycles.get(String(appId || ""));
  if (!record || record.state !== "suspended") return false;
  return runApplicationLifecycleHook(record, "onResume", "active", reason);
}

// Total release. Nothing resumes a disposed app; its next attach registers the
// lifecycle again, and that is what makes it active.
async function disposeApplication(appId, reason = "") {
  const record = applicationLifecycles.get(String(appId || ""));
  if (!record || record.state === "disposed") return false;
  return runApplicationLifecycleHook(record, "onDispose", "disposed", reason);
}

async function syncApplicationLifecycle({ foregroundAppIds = [], documentHidden = false, reason = "" } = {}) {
  const foreground = foregroundAppIds instanceof Set ? foregroundAppIds : new Set(foregroundAppIds);
  const pending = [];
  for (const record of applicationLifecycles.values()) {
    if (record.state === "disposed") continue;
    const shouldRun = !documentHidden && foreground.has(record.id);
    if (shouldRun && record.state === "suspended") {
      pending.push(resumeApplication(record.id, reason || "foreground"));
    } else if (!shouldRun && record.state === "active") {
      pending.push(suspendApplication(record.id, reason || "background"));
    }
  }
  return Promise.all(pending);
}

window.AISystem6ApplicationRegistry = Object.freeze({
  intents: applicationIntents,
  registerApplication,
  getApplication,
  resolveApplicationForItem,
  dispatchApplicationIntent,
  openProjectObject,
  itemKind: applicationItemKind,
  registerApplicationLifecycle,
  getApplicationLifecycleState,
  suspendApplication,
  resumeApplication,
  disposeApplication,
  syncApplicationLifecycle,
});
