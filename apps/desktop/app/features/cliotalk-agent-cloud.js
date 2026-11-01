// ClioTalk agent mode on the public web: the browser half of a cloud run.
//
// Loaded lazily (ensureAgentCloudModule in config.js) by ClioTalk's agent UI
// when the desk is a public deployment. It owns three things and no UI:
//
//   1. The upload bundle: only the Project Hard Disk items the visitor ticked,
//      text files as UTF-8 and Office documents as their stored bytes
//      (AISystem6NativeBinaries.readDocumentBytes), each with its sha-256.
//   2. The run's routes, through the "agent.cloud" service provider
//      (app/core/agent-cloud-providers.js): status, start, events (SSE),
//      stop, changes, discard.
//   3. applyCloudChanges: the accepted changes go back into IndexedDB through
//      the Project Store's commit (text) and NativeBinaries.writeProjectBytes
//      (Office bytes), after checking each against what was uploaded. A file
//      that changed on the desk since the upload is a conflict and is left
//      alone unless the caller names it. Deletes are never applied here.
//
// API: window.AISystem6AgentCloud = { available, buildUploadBundle, start,
// events, stop, changes, discard, applyCloudChanges, savedRuns, noteRunState,
// forgetRun, pickedFiles, notePickedFiles }. Everything from savedRuns on is
// the page's own memory of its runs (sessionStorage), so a reload restores
// the ticked files, a finished run's pending put-back and a working run's
// stream. docs/AGENT-HARNESS.md, "Cloud sandbox (web)".
(function installAgentCloud(root) {
  "use strict";

  const OFFICE_FORMATS = { docx: 1, xlsx: 1, pptx: 1 };
  const TERMINAL = { done: 1, stopped: 1, error: 1, discarded: 1 };
  /** runId → { projectId, entries: { [path]: entry } } for applying later. */
  const runIndex = new Map();

  // ---- This page's memory of its runs ---------------------------------------
  //
  // The server keeps no put-back state and the sandbox is removed 20 minutes
  // after a run ends, so what survives a reload is what this page remembers:
  // the ticked files, each run's upload entries, the paths already put back,
  // the proposal decisions, and whether a run had not ended yet. sessionStorage
  // holds exactly that — it lasts the reload and dies with the tab, which is
  // the same lifetime the server's workspace already has.

  const RUNS_KEY = "ai-system6-agent-cloud-runs";
  const MOST_RUNS_REMEMBERED = 6;

  function savedState() {
    try {
      const parsed = JSON.parse(root.sessionStorage.getItem(RUNS_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeSavedState(state) {
    try { root.sessionStorage.setItem(RUNS_KEY, JSON.stringify(state)); } catch (error) { /* full or absent: the run still works, only the reload loses it */ }
  }

  function savedRuns() {
    const runs = savedState().runs;
    return (Array.isArray(runs) ? runs : []).filter((run) => run && typeof run.runId === "string");
  }

  function saveRunRecord(record) {
    const runs = savedRuns().filter((run) => run.runId !== record.runId);
    runs.push(record);
    while (runs.length > MOST_RUNS_REMEMBERED) {
      // Drop the oldest finished record first; a working run is never the one
      // to forget (and only one can exist per session on the server anyway).
      const oldestEnded = runs.findIndex((run) => run.ended);
      runs.splice(oldestEnded >= 0 ? oldestEnded : 0, 1);
    }
    writeSavedState({ ...savedState(), runs });
  }

  /** The agent UI folds its own fields in (pending, applied, decisions, …). */
  function noteRunState(runId, patch) {
    const current = savedRuns().find((run) => run.runId === runId);
    if (current) saveRunRecord({ ...current, ...patch, runId });
  }

  function forgetRun(runId) {
    writeSavedState({ ...savedState(), runs: savedRuns().filter((run) => run.runId !== runId) });
  }

  // A fresh load re-seeds runIndex from the memory, so applying a restored
  // run's changes works without the caller re-supplying the upload entries.
  for (const run of savedRuns()) {
    if (run.entries && typeof run.entries === "object") runIndex.set(run.runId, { projectId: String(run.projectId || ""), entries: run.entries });
  }

  function cloudError(code, message, extra) {
    const error = new Error(message || code);
    error.code = code;
    if (extra) Object.assign(error, extra);
    return error;
  }

  function service(input) {
    return root.AISystem6Capabilities.requestService("agent.cloud", input);
  }

  async function json(response) {
    let body = null;
    try { body = await response.json(); } catch (error) { body = null; }
    if (!response.ok) {
      throw cloudError(String(body?.code || `http_${response.status}`), String(body?.error || response.statusText || "Request failed"), {
        status: response.status,
        retryAfter: Number(response.headers?.get?.("Retry-After")) || 0,
      });
    }
    return body;
  }

  async function sha256Hex(bytes) {
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return root.btoa(binary);
  }

  function base64ToBytes(text) {
    const binary = root.atob(String(text || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function liveFiles() {
    return root.AISystem6StateStores?.projects?.files?.() || (typeof chatFiles !== "undefined" ? chatFiles : []);
  }

  function liveFolders() {
    return root.AISystem6StateStores?.projects?.folders?.() || (typeof chatFolders !== "undefined" ? chatFolders : []);
  }

  function segment(name) {
    const clean = String(name || "").replace(/[\/\\\u0000-\u001f]/g, "-").trim();
    return clean && clean !== "." && clean !== ".." ? clean.slice(0, 120) : "untitled";
  }

  function folderPath(folderId, folders) {
    const parts = [];
    const seen = new Set();
    let current = folders.find((folder) => folder && folder.id === folderId);
    while (current && !seen.has(current.id) && parts.length < 16) {
      seen.add(current.id);
      parts.unshift(segment(current.name));
      current = current.parentId ? folders.find((folder) => folder && folder.id === current.parentId) : null;
    }
    return parts;
  }

  function hasExtension(name) {
    return /\.[A-Za-z0-9]{1,8}$/.test(String(name || ""));
  }

  /**
   * The bundle for the ticked items. Only text and Office project files can
   * travel; anything else is listed in `skipped`.
   * @param {string[]} fileIds
   * @param {{ projectId?: string }} [options]
   */
  async function buildUploadBundle(fileIds, options = {}) {
    const wanted = new Set((fileIds || []).map(String));
    const folders = liveFolders();
    const files = [];
    const entries = {};
    const skipped = [];
    const taken = new Set();
    let projectId = String(options.projectId || "");
    for (const item of liveFiles()) {
      if (!item || !wanted.has(String(item.id))) continue;
      if (projectId && item.projectId !== projectId) {
        skipped.push({ id: item.id, reason: "other-project" });
        continue;
      }
      projectId = projectId || String(item.projectId || "");
      let bytes;
      let kind;
      let format = "";
      if (item.type === "text") {
        bytes = encoder.encode(String(item.body || ""));
        kind = "text";
      } else if (item.type === "office" && OFFICE_FORMATS[item.format] && root.AISystem6NativeBinaries?.readDocumentBytes) {
        const row = await root.AISystem6NativeBinaries.readDocumentBytes(item.nativeDocumentId);
        if (!row?.bytes) {
          skipped.push({ id: item.id, reason: "bytes-missing" });
          continue;
        }
        bytes = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
        kind = "office";
        format = item.format;
      } else {
        skipped.push({ id: item.id, reason: "unsupported-type" });
        continue;
      }
      let name = segment(item.name);
      if (kind === "text" && !hasExtension(name)) name += ".md";
      if (kind === "office" && !name.toLowerCase().endsWith(`.${format}`)) name += `.${format}`;
      const dir = folderPath(item.folderId, folders);
      let rel = [...dir, name].join("/");
      for (let index = 2; taken.has(rel.toLowerCase()); index += 1) {
        rel = [...dir, name.replace(/(\.[^.]+)?$/, ` ${index}$1`)].join("/");
      }
      taken.add(rel.toLowerCase());
      const digest = await sha256Hex(bytes);
      files.push(kind === "text"
        ? { path: rel, encoding: "utf8", content: decoder.decode(bytes), sha256: digest, id: String(item.id) }
        : { path: rel, encoding: "base64", content: bytesToBase64(bytes), sha256: digest, id: String(item.id) });
      entries[rel] = { fileId: String(item.id), kind, format, folderId: item.folderId || null, name: item.name, addedExtension: name !== segment(item.name), sha256: digest };
    }
    return { projectId, files, entries, skipped, bytes: files.reduce((sum, file) => sum + (file.encoding === "base64" ? Math.floor(file.content.length * 3 / 4) : encoder.encode(file.content).length), 0) };
  }

  /** Is cloud agent mode served here, and with what caps? Never opens a dialog. */
  async function available() {
    const capabilities = await root.AISystem6PublicAccess?.getCapabilities?.().catch(() => null);
    if (!capabilities?.features?.agent_cloud) return { available: false, reason: "not_served" };
    if (capabilities.public_deployment && !root.AISystem6PublicAccess?.hasSession?.()) {
      return { available: true, reason: "verification_required", shared: !!capabilities.features.cloud_shared };
    }
    try {
      return await json(await service({ op: "status" }));
    } catch (error) {
      return { available: false, reason: error.code || "status_failed" };
    }
  }

  /**
   * Start a run over the ticked items.
   * @param {{ fileIds: string[], prompt: string, model?: string, key?: string, projectId?: string }} input
   */
  // A missing Turnstile session is handled by public-access.js's fetch guard:
  // a 401 verification_required opens the check and retries the request.
  async function start(input = {}) {
    const bundle = await buildUploadBundle(input.fileIds || [], { projectId: input.projectId });
    const body = { prompt: String(input.prompt || ""), files: bundle.files };
    if (input.model) body.model = String(input.model);
    if (input.key) body.key = String(input.key);
    const run = await json(await service({ op: "start", body }));
    runIndex.set(run.runId, { projectId: bundle.projectId, entries: bundle.entries });
    // The key never reaches this record; it lives in the request only.
    saveRunRecord({
      runId: run.runId,
      projectId: bundle.projectId,
      entries: bundle.entries,
      fileIds: (input.fileIds || []).map(String),
      model: String(input.model || ""),
      applied: [],
      decisions: [],
      pending: 0,
      ended: false,
    });
    return { ...run, skipped: bundle.skipped };
  }

  /**
   * Follow a run's events. Resolves with the last seq when the stream closes
   * (a terminal status closes it); call again with `after` to resume.
   * @param {string} runId
   * @param {(event: { type: string, seq: number, data: any }) => void} onEvent
   * @param {{ after?: number, signal?: AbortSignal }} [options]
   */
  async function events(runId, onEvent, options = {}) {
    const response = await service({ op: "events", runId, after: options.after || 0, signal: options.signal });
    if (!response.ok) await json(response);
    const reader = response.body.getReader();
    const textDecoder = new TextDecoder();
    let buffer = "";
    let last = Number(options.after) || 0;
    let terminal = false;
    while (!terminal) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += textDecoder.decode(value, { stream: true });
      let split;
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        let type = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) type = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        let parsed;
        try { parsed = JSON.parse(data); } catch (error) { continue; }
        last = Math.max(last, Number(parsed.seq) || 0);
        onEvent({ type, seq: Number(parsed.seq) || 0, data: parsed });
        if (type === "status" && TERMINAL[parsed.state]) terminal = true;
      }
    }
    try { reader.cancel(); } catch (error) { /* already closed */ }
    // A terminal status is the run's end as this page knows it; a stream that
    // merely dropped leaves the record open, so a reload can rejoin.
    if (terminal) noteRunState(runId, { ended: true });
    return last;
  }

  async function stop(runId) {
    return json(await service({ op: "stop", runId }));
  }

  async function changes(runId) {
    return json(await service({ op: "changes", runId }));
  }

  async function discard(runId) {
    const result = await json(await service({ op: "discard", runId }));
    runIndex.delete(runId);
    forgetRun(runId);
    return result;
  }

  function changeBytes(change) {
    if (typeof change.contentBase64 === "string") return base64ToBytes(change.contentBase64);
    return encoder.encode(String(change.content ?? ""));
  }

  function resolveFolder(draft, projectId, dirParts) {
    let parentId = null;
    for (const part of dirParts) {
      let folder = draft.chatFolders.find((candidate) => candidate && candidate.projectId === projectId
        && (candidate.parentId || null) === parentId && segment(candidate.name) === part);
      if (!folder) {
        folder = { id: root.crypto.randomUUID(), projectId, name: part, parentId, createdAt: new Date().toISOString() };
        draft.chatFolders.push(folder);
      }
      parentId = folder.id;
    }
    return parentId;
  }

  /**
   * Write accepted changes back to the Project Hard Disk.
   * @param {Array<any>} list        the `changes` array from changes(runId)
   * @param {{ runId?: string, projectId?: string, entries?: Record<string, any>, paths?: string[], overwriteConflicts?: string[] }} [options]
   */
  async function applyCloudChanges(list, options = {}) {
    const index = (options.runId && runIndex.get(options.runId)) || {};
    const entries = options.entries || index.entries || {};
    const projectId = String(options.projectId || index.projectId || "");
    const accepted = options.paths ? new Set(options.paths) : null;
    const overwrite = new Set(options.overwriteConflicts || []);
    const result = { applied: [], conflicts: [], skipped: [], pendingDeletes: [] };
    const files = liveFiles();
    const textWrites = [];
    const officeWrites = [];

    for (const change of Array.isArray(list) ? list : []) {
      const rel = String(change?.path || "");
      if (!rel || (accepted && !accepted.has(rel))) continue;
      const entry = entries[rel] || null;
      if (change.kind === "deleted") {
        result.pendingDeletes.push(rel);
        continue;
      }
      const bytes = changeBytes(change);
      if (change.sha256 && (await sha256Hex(bytes)) !== change.sha256) {
        result.skipped.push({ path: rel, reason: "corrupt" });
        continue;
      }
      if (change.kind === "modified") {
        const item = entry ? files.find((file) => file && String(file.id) === entry.fileId) : null;
        if (!entry || !item) {
          result.conflicts.push({ path: rel, reason: entry ? "deleted-since-upload" : "not-uploaded" });
          continue;
        }
        let current = "";
        if (entry.kind === "text") current = await sha256Hex(encoder.encode(String(item.body || "")));
        else {
          const row = await root.AISystem6NativeBinaries.readDocumentBytes(item.nativeDocumentId);
          current = row ? (row.sha256 || await sha256Hex(row.bytes)) : "";
        }
        if (current !== (change.baseSha256 || entry.sha256) && !overwrite.has(rel)) {
          result.conflicts.push({ path: rel, reason: "changed-since-upload" });
          continue;
        }
        if (entry.kind === "text") {
          if (change.binary) {
            result.skipped.push({ path: rel, reason: "binary-for-text" });
            continue;
          }
          textWrites.push({ rel, kind: "modified", fileId: entry.fileId, body: decoder.decode(bytes) });
        } else {
          officeWrites.push({ rel, kind: "modified", fileId: entry.fileId, bytes });
        }
        continue;
      }
      // Added: a new project file in the folder its path names.
      const parts = rel.split("/");
      const base = parts.pop();
      const extension = (base.match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase() || "";
      const name = extension === "md" ? base.slice(0, -3) : base;
      const sameName = files.find((file) => file && file.projectId === projectId
        && segment(file.name) === segment(OFFICE_FORMATS[extension] ? base : name)
        && folderPath(file.folderId, liveFolders()).join("/") === parts.join("/"));
      if (sameName && !overwrite.has(rel)) {
        result.conflicts.push({ path: rel, reason: "created-since-upload" });
        continue;
      }
      if (OFFICE_FORMATS[extension]) officeWrites.push({ rel, kind: "added", dir: parts, name: base, format: extension, bytes });
      else if (change.binary) result.skipped.push({ path: rel, reason: "unsupported-binary" });
      else textWrites.push({ rel, kind: "added", dir: parts, name, body: decoder.decode(bytes) });
    }

    if (textWrites.length) {
      if (!projectId) throw cloudError("project_required", "A project is required to apply changes.");
      const now = new Date().toISOString();
      const made = {};
      await window.AISystem6StateStores.projects.commit((draft) => {
        for (const write of textWrites) {
          if (write.kind === "modified") {
            const item = draft.chatFiles.find((file) => file && String(file.id) === write.fileId);
            if (!item) continue;
            item.body = write.body;
            item.updatedAt = now;
          } else {
            const id = root.crypto.randomUUID();
            made[write.rel] = id;
            draft.chatFiles.unshift({
              id,
              projectId,
              type: "text",
              name: write.name,
              folderId: resolveFolder(draft, projectId, write.dir),
              body: write.body,
              source: "ClioTalk",
              durable: true,
              label: "ai",
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      });
      for (const write of textWrites) {
        result.applied.push({ path: write.rel, kind: write.kind, fileId: write.fileId || made[write.rel] });
      }
    }

    for (const write of officeWrites) {
      const binaries = root.AISystem6NativeBinaries;
      if (write.kind === "modified") {
        await binaries.openProjectDocument(write.fileId);
        await binaries.writeProjectBytes(binaries.projectHandle(write.fileId), write.bytes);
        result.applied.push({ path: write.rel, kind: "modified", fileId: write.fileId });
      } else {
        let folderId = null;
        if (write.dir.length) {
          await window.AISystem6StateStores.projects.commit((draft) => {
            folderId = resolveFolder(draft, projectId, write.dir);
          });
        }
        const item = await binaries.createProjectDocument({ projectId, name: write.name, folderId, format: write.format, bytes: write.bytes });
        result.applied.push({ path: write.rel, kind: "added", fileId: item?.id || "" });
      }
    }
    // What is applied never waits on the strip again after a reload either.
    if (options.runId && result.applied.length) {
      const current = savedRuns().find((run) => run.runId === options.runId);
      if (current) saveRunRecord({ ...current, applied: [...new Set([...(current.applied || []), ...result.applied.map((entry) => entry.path)])] });
    }
    return result;
  }

  root.AISystem6AgentCloud = Object.freeze({
    available,
    buildUploadBundle,
    start,
    events,
    stop,
    changes,
    discard,
    applyCloudChanges,
    apply: applyCloudChanges,
    savedRuns,
    noteRunState,
    forgetRun,
    pickedFiles: () => {
      const picks = savedState().picks;
      return Array.isArray(picks) ? picks.map(String) : [];
    },
    notePickedFiles: (ids) => {
      writeSavedState({ ...savedState(), picks: (ids || []).map(String) });
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
