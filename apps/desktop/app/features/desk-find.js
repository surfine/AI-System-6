// Find… — one search across the whole desk (lazy; the menu row says Find…).
//
// Find File used to look at the mounted project only, Search Conversations
// matched chat titles only, and Key Caps was a third place to look for a
// command. This is one window with one field. It ranks, in one list grouped by
// kind: projects (names), documents and their sections (text), scraps,
// Stickies, ClioTalk conversations (titles and message text) and commands.
// Every hit opens the thing in place: a project in its Finder window, a
// section in the writing window at that heading, a conversation in ClioTalk at
// that message, a command by running it.
//
// Matching is words-in-a-name first, then words-in-the-text, over what is
// already in memory. Nothing is indexed for this. If the embedding store
// already holds chunks for the mounted project and the route that made them is
// local, the hits are re-ranked by them a moment later; with no chunks, or a
// hosted route (the query would leave the machine), that step does not run.
//
// Searcher stays the web-sources tool (findpath.js). The window, its loader and
// the open-find-file command keep their ids: this module owns what they call.

const DESK_FIND_KINDS = ["project", "document", "section", "scrap", "sticky", "conversation", "command"];
const DESK_FIND_GROUP_LIMIT = 8;
let deskFindToken = 0;
let deskFindTimer = 0;
let deskFindCommandsReady = null;

function deskFindNorm(value) {
  return String(value || "").toLocaleLowerCase();
}

// Every word must be somewhere; a hit in the name outranks one in the text,
// the start of a name outranks the middle, and the whole name outranks both.
function deskFindScore(words, name, body = "") {
  const title = deskFindNorm(name);
  const text = deskFindNorm(body);
  let score = 0;
  for (const word of words) {
    const at = title.indexOf(word);
    if (at >= 0) score += at === 0 ? 100 : /[\s\-_/·.:：—]/.test(title[at - 1]) ? 80 : 60;
    else if (text.includes(word)) score += 20;
    else return 0;
  }
  if (title && title === words.join(" ")) score += 50;
  return score;
}

function deskFindSnippet(words, text) {
  const source = String(text || "").replace(/\s+/g, " ");
  const lower = deskFindNorm(source);
  const at = Math.max(0, Math.min(...words.map((word) => (lower.indexOf(word) < 0 ? Infinity : lower.indexOf(word)))));
  if (!Number.isFinite(at)) return "";
  const start = Math.max(0, at - 24);
  return `${start ? "…" : ""}${source.slice(start, start + 90)}${source.length > start + 90 ? "…" : ""}`;
}

function deskFindProjectName(projectId) {
  const project = projects.find((item) => item.id === projectId);
  return project ? projectDisplayName(project) : "";
}

function deskFindFilePath(file) {
  const folder = file.folderId && typeof getFolderPath === "function" ? getFolderPath(file.folderId, file.projectId).join(" / ") : "";
  return [deskFindProjectName(file.projectId), folder].filter(Boolean).join(" / ");
}

// Markdown headings with their offsets, the same shape the writing window
// reads (a trailing {#id} is not part of the title).
function deskFindSections(body) {
  const sections = [];
  const pattern = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
  let match;
  while ((match = pattern.exec(body))) {
    const title = typeof stripMarkdownSectionId === "function" ? stripMarkdownSectionId(match[2]) : match[2];
    if (sections.length) sections[sections.length - 1].end = match.index;
    sections.push({ title, offset: match.index, end: body.length });
  }
  return sections;
}

async function deskFindMount(projectId) {
  if (isProjectMounted && activeProjectId === projectId) return true;
  await switchProject(projectId);
  return isProjectMounted && activeProjectId === projectId;
}

function deskFindRevealIn(projectId, patch) {
  return async () => {
    if (!await deskFindMount(projectId)) return;
    selectedFolderId = patch.folderId ?? "all";
    selectedChatFileId = patch.fileId ?? null;
    selectedDocumentFolderId = null;
    selectedProjectRootItemId = patch.rootId ?? null;
    renderProjectDisks();
    openWindow("projects");
  };
}

function deskFindOpenSection(file, section) {
  return async () => {
    if (!await deskFindMount(file.projectId)) return;
    openTextFile(file.id);
    const input = typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput : null;
    if (!input || !section) return;
    // The window may still be settling its own focus; aim once it has.
    requestAnimationFrame(() => {
      const current = deskFindSections(input.value).find((item) => item.title === section.title) || section;
      const lineEnd = input.value.indexOf("\n", current.offset);
      const end = lineEnd < 0 ? input.value.length : lineEnd;
      input.focus({ preventScroll: true });
      input.setSelectionRange(current.offset, end);
      scrollTextareaToOffset(input, current.offset);
    });
  };
}

function deskFindOpenConversation(file, words, messageId) {
  return async () => {
    if (!await deskFindMount(file.projectId)) return;
    if (typeof activeAbortController !== "undefined" && activeAbortController) {
      setStatus(t("task_already_running", (typeof localModelState !== "undefined" && localModelState?.task) || t("working_locally")));
      return;
    }
    await openWindow("assistant");
    if (activeChatFileId !== file.id) {
      selectedChatFileId = file.id;
      await openChatFile();
    }
    window.AISystem6ClioTalkShell?.refresh?.();
    if (!messageId) return;
    // ClioTalk's own in-conversation find knows how to centre a message: aim it
    // at this one by choosing which match it is on.
    const matches = conversation.filter((message) => deskFindNorm(message?.content).includes(words[0]));
    clioTalkFindQuery = words[0];
    clioTalkFindMatchIndex = Math.max(0, matches.findIndex((message) => message.id === messageId));
    await findInClioTalkConversation(words[0], { prompt: false, advance: false });
  };
}

function deskFindCandidates(words) {
  const hits = [];
  const push = (hit, score, boost = 0) => {
    if (score > 0) hits.push({ ...hit, score: score + boost + (hit.projectId && hit.projectId === activeProjectId ? 5 : 0) });
  };

  projects.forEach((project) => {
    const name = projectDisplayName(project);
    push({
      kind: "project", id: project.id, projectId: project.id, name, path: t("find_group_project"),
      modifiedAt: project.updatedAt || project.createdAt,
      open: async () => {
        selectedProjectId = project.id;
        await switchProject(project.id);
        renderProjectDisks();
        openWindow("projects");
      },
      reveal: null,
    }, deskFindScore(words, name));
  });

  chatFiles.forEach((file) => {
    if (file.type === "text") {
      const body = file.body || "";
      const path = deskFindFilePath(file);
      const base = {
        id: file.id, sourceId: file.id, projectId: file.projectId, modifiedAt: file.updatedAt || file.createdAt,
        reveal: deskFindRevealIn(file.projectId, { folderId: file.folderId || "all", fileId: file.id }),
      };
      const nameScore = deskFindScore(words, file.name || t("untitled"));
      let documentListed = false;
      if (nameScore) {
        documentListed = true;
        push({ ...base, kind: "document", name: file.name || t("untitled"), path, open: deskFindOpenSection(file, null) }, nameScore);
      }
      const sections = deskFindSections(body);
      const first = sections.length ? sections[0].offset : body.length;
      if (!documentListed) {
        const introScore = deskFindScore(words, "", body.slice(0, first));
        if (introScore) {
          documentListed = true;
          push({ ...base, kind: "document", name: file.name || t("untitled"), path, snippet: deskFindSnippet(words, body.slice(0, first)), open: deskFindOpenSection(file, null) }, introScore);
        }
      }
      sections.slice(0, 200).forEach((section) => {
        const score = deskFindScore(words, section.title, body.slice(section.offset, section.end));
        if (!score) return;
        push({
          ...base, kind: "section", id: `${file.id}#${section.offset}`, name: section.title || file.name,
          path: [path, file.name].filter(Boolean).join(" / "),
          snippet: deskFindNorm(section.title).includes(words[0]) ? "" : deskFindSnippet(words, body.slice(section.offset, section.end)),
          open: deskFindOpenSection(file, section),
        }, score);
      });
      return;
    }
    if (!Array.isArray(file.messages)) return;
    const name = file.name || t("untitled");
    const all = file.messages.map((message) => String(message?.content || "")).join("\n");
    const score = deskFindScore(words, name, all);
    if (!score) return;
    const message = file.messages.find((item) => words.every((word) => deskFindNorm(item?.content).includes(word)));
    push({
      kind: "conversation", id: file.id, sourceId: file.id, projectId: file.projectId, name,
      path: deskFindFilePath(file), modifiedAt: file.updatedAt || file.createdAt,
      snippet: message && !deskFindNorm(name).includes(words[0]) ? deskFindSnippet(words, message.content) : "",
      open: deskFindOpenConversation(file, words, message?.id || ""),
      reveal: deskFindRevealIn(file.projectId, { folderId: file.folderId || "all", fileId: file.id }),
    }, score);
  });

  scraps.forEach((scrap) => {
    const name = scrap.title || t("untitled");
    const text = (typeof scrapDocumentText === "function" ? scrapDocumentText(scrap) : "") || scrap.selectedText || "";
    push({
      kind: "scrap", id: scrap.id, sourceId: scrap.id, projectId: scrap.projectId, name,
      path: [deskFindProjectName(scrap.projectId), t("scrapbook_label")].filter(Boolean).join(" / "),
      modifiedAt: scrap.updatedAt || scrap.createdAt, snippet: deskFindNorm(name).includes(words[0]) ? "" : deskFindSnippet(words, text),
      open: async () => {
        if (!await deskFindMount(scrap.projectId)) return;
        selectedScrapId = scrap.id;
        selectedScrapIds.clear();
        selectedScrapIds.add(scrap.id);
        selectedScrapStack = "all";
        if (typeof renderScraps === "function") renderScraps();
        openWindow("scrapbook");
      },
      reveal: deskFindRevealIn(scrap.projectId, { rootId: "scrapbook" }),
    }, deskFindScore(words, name, text));
  });

  deskStickies.forEach((sticky) => {
    const text = String(sticky.text || "");
    const name = text.split("\n").find((line) => line.trim())?.trim() || t("untitled");
    const view = sticky.done ? "done" : sticky.kind === "action" ? "next" : sticky.kind === "held" ? "held" : sticky.inbox ? "inbox" : "notes";
    push({
      kind: "sticky", id: sticky.id, name: name.slice(0, 120), path: sticky.projectName || deskFindProjectName(sticky.projectId) || t("find_group_sticky"),
      modifiedAt: sticky.updatedAt || sticky.createdAt, snippet: text.trim() === name ? "" : deskFindSnippet(words, text),
      open: async () => {
        await ensureTodoDaModule();
        await window.AISystem6Stickies?.open?.(view, sticky.id);
      },
      reveal: null,
    }, deskFindScore(words, name, text));
  });

  const rows = window.AISystem6CommandSheet?.rows?.() || [];
  rows.forEach((row) => {
    if (!row.enabled || row.action === "open-find-file") return;
    push({
      kind: "command", id: `cmd:${row.action}`, name: row.label, path: [row.menu, row.key].filter(Boolean).join(" · "),
      open: async () => {
        await closeWindow("findFile");
        handleAction(row.action);
      },
      reveal: null,
    }, deskFindScore(words, row.label, row.menu));
  });
  return hits;
}

// One list, grouped by kind: groups ordered by their best hit, rows by score
// then recency, each group capped so one kind cannot bury the rest.
function deskFindArrange(hits) {
  const groups = new Map();
  hits.forEach((hit) => {
    if (!groups.has(hit.kind)) groups.set(hit.kind, []);
    groups.get(hit.kind).push(hit);
  });
  const order = [...groups.entries()].map(([kind, rows]) => {
    rows.sort((a, b) => b.score - a.score || String(b.modifiedAt || "").localeCompare(String(a.modifiedAt || "")));
    return { kind, rows: rows.slice(0, DESK_FIND_GROUP_LIMIT), best: rows[0].score };
  });
  order.sort((a, b) => b.best - a.best || DESK_FIND_KINDS.indexOf(a.kind) - DESK_FIND_KINDS.indexOf(b.kind));
  return order.flatMap((group) => group.rows);
}

function deskFindRouteIsLocal() {
  if (typeof currentHostedEmbeddingRoute === "function" && currentHostedEmbeddingRoute()) return false;
  const cloud = typeof cloudConfig !== "undefined" && cloudConfig?.active && typeof cloudCredentialReady === "function" && cloudCredentialReady();
  if (!cloud) return true;
  const provider = cloudConfig.provider;
  return provider === "deepseek" || provider === "anthropic" || (typeof isSubscriptionCloudProvider === "function" && isSubscriptionCloudProvider());
}

async function deskFindRerank(token) {
  if (!isProjectMounted || !activeProjectId || typeof rankChunksForQuery !== "function") return;
  const mine = ragChunks.filter((chunk) => chunk.projectId === activeProjectId && Array.isArray(chunk.embedding));
  if (!mine.length || !deskFindRouteIsLocal()) return;
  const query = findFileQueryInput?.value.trim() || "";
  await rankChunksForQuery(query);
  if (token !== deskFindToken) return;
  const best = new Map();
  mine.forEach((chunk) => {
    const id = chunk.fileId || chunk.chatFileId || chunk.sourceId;
    if (id && chunk.lastQueryScore > 0) best.set(id, Math.max(best.get(id) || 0, chunk.lastQueryScore));
  });
  if (!best.size) return;
  const picked = getSelectedFindFileResult();
  const boosted = findFileResults.map((hit) => (best.has(hit.sourceId) ? { ...hit, score: hit.score + best.get(hit.sourceId) * 60 } : hit));
  findFileResults.splice(0, findFileResults.length, ...deskFindArrange(boosted));
  const at = picked ? findFileResults.findIndex((hit) => hit.id === picked.id) : -1;
  selectedFindFileIndex = findFileResults.length ? Math.max(0, at) : null;
  renderFindFileResults();
}

async function runFindFileSearch() {
  const token = ++deskFindToken;
  const words = deskFindNorm(findFileQueryInput?.value.trim()).split(/\s+/).filter(Boolean);
  findFileResults.splice(0, findFileResults.length);
  selectedFindFileIndex = null;
  if (words.length) {
    // Commands are Key Caps' rows, read from the live menus.
    deskFindCommandsReady ||= ensureCommandSheetModule().catch(() => {});
    await deskFindCommandsReady;
    if (token !== deskFindToken) return;
    findFileResults.push(...deskFindArrange(deskFindCandidates(words)));
    selectedFindFileIndex = findFileResults.length ? 0 : null;
  }
  renderFindFileResults();
  if (words.length && findFileResults.length) deskFindRerank(token).catch(() => {});
}

const DESK_FIND_GROUP_KEYS = {
  project: "find_group_project", document: "find_group_document", section: "find_group_section", scrap: "find_group_scrap",
  sticky: "find_group_sticky", conversation: "find_group_conversation", command: "find_group_command",
};

// Open / Reveal grey and say why, like Searcher's, instead of scolding after a click.
function syncFindFileActions() {
  const hit = getSelectedFindFileResult();
  const pane = findFileResultsEl?.closest(".find-file-pane");
  if (!pane) return;
  const query = findFileQueryInput?.value.trim() || "";
  const why = !query || !findFileResults.length ? "balloon_find_file_needs_search" : "balloon_find_file_needs_result";
  pane.querySelectorAll('[data-action="open-selected-find-file"], [data-action="reveal-selected-find-file"]').forEach((button) => {
    const enabled = !!hit && (button.dataset.action === "open-selected-find-file" || !!hit.reveal);
    button.disabled = !enabled;
    button.classList.toggle("is-disabled", !enabled);
    button.dataset.balloonHelpDisabled = why;
    button.dataset.grayAffordance = enabled ? "0" : "1";
  });
}

function renderFindFileResults() {
  if (!findFileResultsEl) return;
  if (findFileScopeEl) findFileScopeEl.textContent = t("find_scope_desk");
  if (findFileCountEl) findFileCountEl.textContent = t("items_count", findFileResults.length);
  findFileResultsEl.replaceChildren();

  if (!findFileQueryInput?.value.trim() || !findFileResults.length) {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note empty-next-note";
    const text = document.createElement("p");
    const asked = !!findFileQueryInput?.value.trim();
    text.textContent = t(asked ? "find_file_no_results" : "find_file_empty");
    // A tappable next step, so the eye does not stop on a dead note.
    const next = document.createElement("button");
    next.type = "button";
    if (asked) {
      next.className = "btn default";
      next.dataset.action = "open-project-disks";
      next.textContent = t("open_project_disks");
    } else {
      next.className = "btn";
      next.textContent = t("type_a_query");
      next.addEventListener("click", () => {
        findFileQueryInput?.focus?.();
        findFileQueryInput?.select?.();
      });
    }
    empty.append(text, next);
    findFileResultsEl.append(empty);
    syncFindFileActions();
    return;
  }

  let lastKind = "";
  findFileResults.forEach((result, index) => {
    if (result.kind !== lastKind) {
      lastKind = result.kind;
      const heading = document.createElement("div");
      heading.className = "find-file-group";
      heading.setAttribute("role", "presentation");
      heading.textContent = t(DESK_FIND_GROUP_KEYS[result.kind]);
      findFileResultsEl.append(heading);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `find-file-result${index === selectedFindFileIndex ? " is-selected" : ""}`;
    button.dataset.kind = result.kind;
    const modified = result.modifiedAt ? new Date(result.modifiedAt).toLocaleString() : "";
    button.innerHTML = `
      <strong>${escapeHtml(result.name)}</strong>
      <span>${escapeHtml(result.path)}</span>
      ${result.snippet ? `<span>${escapeHtml(result.snippet)}</span>` : ""}
      ${modified ? `<small>${escapeHtml(modified)}</small>` : ""}
    `;
    button.addEventListener("click", (event) => {
      if (
        selectedFindFileIndex === index
        && typeof window.matchMedia === "function"
        && !window.matchMedia("(hover: hover) and (pointer: fine)").matches
      ) {
        openFindFileResult(result);
        return;
      }
      selectedFindFileIndex = index;
      const hintDetail = event.detail;
      renderFindFileResults();
      updateMenuState();
      const next = findFileResultsEl?.querySelector(".find-file-result.is-selected");
      revealSelectOpenTapHint(next, { detail: hintDetail });
    });
    button.addEventListener("dblclick", () => openFindFileResult(result));
    findFileResultsEl.append(button);
  });
  syncFindFileActions();
}

function getSelectedFindFileResult() {
  return selectedFindFileIndex === null ? null : findFileResults[selectedFindFileIndex] || null;
}

function openFindFileResult(result) {
  if (!result) {
    setStatus(t("select_find_file_first"));
    return;
  }
  Promise.resolve(result.open?.()).catch((error) => console.warn("Find: could not open the hit.", error));
}

function openSelectedFindFileResult() {
  openFindFileResult(getSelectedFindFileResult());
}

function revealSelectedFindFileResult() {
  const result = getSelectedFindFileResult();
  if (!result) {
    setStatus(t("select_find_file_first"));
    return;
  }
  result.reveal?.();
}

// Type, arrows, Return opens, Escape closes. The field keeps focus the whole
// time, so the list is driven from it.
function wireDeskFind() {
  if (!findFileQueryInput || findFileQueryInput.dataset.deskFind) return;
  findFileQueryInput.dataset.deskFind = "1";
  findFileQueryInput.addEventListener("input", () => {
    clearTimeout(deskFindTimer);
    deskFindTimer = setTimeout(runFindFileSearch, 90);
  });
  // On the window, not the field: the window can hold focus for a moment after
  // it opens, and Escape has to close it from there too.
  (findFileQueryInput.closest(".find-file-window") || findFileQueryInput).addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (event.target !== findFileQueryInput && !event.target.closest?.(".find-file-results")) return;
      if (!findFileResults.length) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      selectedFindFileIndex = ((selectedFindFileIndex ?? (step > 0 ? -1 : 0)) + step + findFileResults.length) % findFileResults.length;
      renderFindFileResults();
      findFileResultsEl?.querySelector(".find-file-result.is-selected")?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeWindow("findFile");
    }
  });
}

wireDeskFind();
window.AISystem6DeskFindLoaded = true;
