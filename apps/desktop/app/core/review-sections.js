// Review Desk section layer.
//
// The writing-route AI commands (Question Sheet -> Outline, outline critique /
// reduce / structure, draft polish and suggest, Claim Check) live in the lazy
// app/features/outline-claim.js module: they are summoned by a menu item, and
// 68 KB of prompt text should not be parsed at every boot.
//
// What stays here is everything the *eager* surfaces call synchronously, which
// the lazy module therefore cannot own:
//
//   - getTeachTextSectionBlocks() / getClaimCheckSectionBlocks() split the
//     manuscript into review sections. updateMenuState() calls them on every
//     menu open and needs the return value, not a promise.
//   - renderClaimCheckSections() runs on every TeachText keystroke and on every
//     Review Desk open. A lazy stub would drag the module in behind ordinary
//     typing.
//   - selectedClaimSectionIndex is written by actions.js and translation.js.
//     A script-scope binding cannot be replaced by a window stub at all.
//   - stripRebuildMarkdownFence() / getRebuildParagraphs() / inferRebuildClaims()
//     are pure helpers that actions.js and translation.js call inline, and that
//     two *other* lazy modules (DocMap, Writing Flow) call bare — one lazy
//     module must never depend on another being loaded first.
//   - openCitationContextItem() answers a citation click in ClioTalk and
//     Scrapbook, which have nothing to do with Claim Check.
//
// Everything else — the model calls, prompts, verdict rendering — is lazy.

let selectedClaimSectionIndex = 0;

// Shared heuristic for spotting checkable claims (numbers, years, percentages,
// announcements, absolutes) used by both the local outline extraction and the
// online claim check.
const onlineClaimPattern = /(\d{4}|\d+%|\d+\s*(?:个|项|种|users?|features?)|宣布|推出|支持|更新|将|首次|available|announced|supports?|will|new\s+features?)/i;

function stripRebuildMarkdownFence(markdown) {
  return String(markdown || "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function getRebuildParagraphs(text) {
  const blocks = String(text || "")
    .split(/\n\s*\n+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 30);

  if (blocks.length >= 3) return blocks;

  return String(text || "")
    .split(/(?<=[。！？.!?])\s+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 30);
}

function inferRebuildClaims(paragraphs) {
  return paragraphs
    .filter((paragraph) => onlineClaimPattern.test(paragraph))
    .slice(0, 6)
    .map((paragraph) => shortClaimText(paragraph, currentLanguage === "zh" ? 96 : 140));
}

function shortClaimText(text, max = 80) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function openCitationContextItem(contextItem) {
  if (!contextItem) {
    setStatus(t("citation_not_found"));
    return;
  }

  if (contextItem.kind === "scrap" && contextItem.id && isInActiveProject(contextItem)) {
    selectedScrapId = contextItem.id;
    selectedScrapIds.clear();
    selectedScrapIds.add(contextItem.id);
    renderScraps();
    openWindow("scrapbook");
    setStatus(contextSourceLabel(contextItem));
    return;
  }

  if (contextItem.kind === "file" && contextItem.id && isInActiveProject(contextItem)) {
    openTextFile(contextItem.id);
    setStatus(contextSourceLabel(contextItem));
    return;
  }

  if (contextItem.fromProjectReference && contextItem.referenceId && contextItem.projectId === activeProjectId) {
    selectedProjectReferenceId = contextItem.referenceId;
    renderProjectReferences();
    openSelectedProjectReference();
    setStatus(contextSourceLabel(contextItem));
    return;
  }

  if (contextItem.source && contextItem.projectId === activeProjectId) {
    selectedMountedFile = contextItem.source;
    renderMountedTextDisk();
    openWindow("textDisk");
    openMountedTextFile(contextItem.source);
    setStatus(contextSourceLabel(contextItem));
    return;
  }

  setStatus(t("citation_not_found"));
}

function resolveCitationRef(ref) {
  const rawRef = String(ref || "");
  const exact = claimCitationContextItems.find((contextItem) =>
    contextItem.citationId === rawRef
  );
  if (exact) return exact;

  const sourceMatch = rawRef.match(/\[S(\d+)(?::(\d+))?\]/i);
  if (sourceMatch) {
    const sourceId = `S${sourceMatch[1]}`;
    const sourceItem = buildProjectSourceRegistry().find((source) => source.sourceId === sourceId);
    if (!sourceItem) return null;
    const sourceKey = sourceItem.key;
    const contextItems = claimCitationContextItems.filter((contextItem) => getContextSourceKey(contextItem) === sourceKey);
    if (sourceMatch[2]) return contextItems[Number(sourceMatch[2]) - 1] || contextItems[0] || null;
    return contextItems[0] || null;
  }

  const match = rawRef.match(/\[([MR])(\d+)\]/i);
  if (!match) return null;
  const prefix = match[1].toUpperCase();
  const citationId = `[${prefix}${match[2]}]`;
  const byCitationId = claimCitationContextItems.find((contextItem) =>
    contextItem.citationId === citationId
  );
  if (byCitationId) return byCitationId;
  const index = parseInt(match[2], 10) - 1;
  const contextItems = claimCitationContextItems.filter((contextItem) =>
    prefix === "M" ? contextItem.type === "curated" : contextItem.type === "ranked"
  );
  return contextItems[index] || null;
}

function normalizeReviewSectionBlock(block, index = 0) {
  const title = String(block?.title || "").trim() || `${t("claim_check_section")} ${index + 1}`;
  const source = String(block?.source || block?.sourceMarkdown || "").trim();
  const text = source || [`## ${title}`, block?.body || ""].filter(Boolean).join("\n\n");
  return {
    index,
    title,
    body: String(block?.body || "").trim(),
    text: text.trim(),
    offset: Math.max(0, Number(block?.offset) || 0),
  };
}

function reviewMarkdownSectionBlocks(raw) {
  const levelTwoBlocks = markdownDocumentSectionBlocks(raw, 2);
  if (levelTwoBlocks.length) return levelTwoBlocks;

  const levelOneBlocks = markdownDocumentSectionBlocks(raw, 1);
  if (levelOneBlocks.length) return levelOneBlocks;

  const levelThreeBlocks = markdownDocumentSectionBlocks(raw, 3);
  if (levelThreeBlocks.length) return levelThreeBlocks;

  return [];
}

function looksLikePlainReviewHeading(line, previousLine, nextLine) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  if (text.length > 32) return false;
  if (/^[>“"']/.test(text)) return false;
  if (/[。！？!?，,；;：:]$/.test(text)) return false;
  if (/^\s*(?:[-*+]|\d+[.)、])\s+/.test(text)) return false;

  const hasBoundaryBefore = !String(previousLine || "").trim();
  const hasBodyAfter = String(nextLine || "").trim().length >= 8;
  if (!hasBoundaryBefore || !hasBodyAfter) return false;

  return /^(?:第.{1,12}[章节]|[一二三四五六七八九十]+[、.]\s*.+|\d+[.)]\s*.+|[\p{L}\p{N}][\p{L}\p{N}\s&/＋+\-—：:·「」《》()（）]{0,31})$/u.test(text);
}

function plainReviewSectionBlocks(raw) {
  const lines = normalizeMarkdownText(raw).split("\n");
  const starts = [];

  lines.forEach((line, index) => {
    const previousLine = index > 0 ? lines[index - 1] : "";
    const nextLine = lines.slice(index + 1).find((item) => item.trim()) || "";
    if (looksLikePlainReviewHeading(line, previousLine, nextLine)) {
      starts.push({ index, title: line.trim() });
    }
  });

  if (starts.length < 2 || starts.length > 24) return [];

  const blocks = starts.map((start, index) => {
    const endLine = starts[index + 1]?.index ?? lines.length;
    const sourceLines = trimMarkdownBlockLines(lines.slice(start.index, endLine));
    const bodyLines = trimMarkdownBlockLines(sourceLines.slice(1));
    const source = sourceLines.join("\n").trim();
    return {
      title: stripMarkdownInlineSyntax(start.title),
      body: bodyLines.join("\n").trim(),
      source,
      offset: raw.indexOf(source),
    };
  }).filter((block) => block.source);

  return blocks.length >= 2 ? blocks : [];
}

function getTeachTextSectionBlocks(body = teachTextBodyInput?.value || "") {
  const raw = String(body || "").trim();
  if (!raw) return [];

  const markdownBlocks = reviewMarkdownSectionBlocks(raw);
  const blocks = markdownBlocks.length ? markdownBlocks : plainReviewSectionBlocks(raw);

  if (blocks.length) {
    return blocks
      .map((block, index) => normalizeReviewSectionBlock(block, index))
      .filter((block) => block.text);
  }

  return [{
    index: 0,
    title: markdownDocumentTitle(raw) || t("claim_scope_manuscript"),
    body: raw,
    text: raw,
    offset: 0,
  }];
}

function getClaimCheckSectionBlocks(body = teachTextBodyInput?.value || "") {
  return getTeachTextSectionBlocks(body);
}

function revealReviewDeskSection(index = selectedStyleSectionIndex) {
  if (!reviewDeskBodyInput || getWindow("reviewDesk")?.classList.contains("is-hidden")) return;
  const source = teachTextBodyInput?.value || "";
  const sections = getTeachTextSectionBlocks(source);
  const section = sections[Math.max(0, Math.min(sections.length - 1, Number(index) || 0))];
  if (!section) return;

  syncReviewDeskFromTeachText({ force: true });
  reviewDeskBodyInput.classList.remove("is-hidden");
  reviewDeskPreviewEl?.classList.add("is-hidden");
  reviewDeskBodyInput.focus({ preventScroll: true });
  reviewDeskBodyInput.setSelectionRange(0, Math.min(reviewDeskBodyInput.value.length, Math.max(1, section.title.length)));
  reviewDeskBodyInput.scrollTop = 0;
  scrollTextareaToOffset(teachTextBodyInput, section.offset || 0);
}

function selectedClaimCheckSection() {
  const sections = getClaimCheckSectionBlocks();
  if (!sections.length) return null;
  selectedClaimSectionIndex = Math.max(0, Math.min(sections.length - 1, selectedClaimSectionIndex));
  return sections[selectedClaimSectionIndex];
}

function renderClaimCheckSections() {
  if (!claimSectionSelectEl) return;
  const sections = getClaimCheckSectionBlocks();
  const previous = selectedClaimSectionIndex;
  claimSectionSelectEl.replaceChildren();

  if (!sections.length) {
    selectedClaimSectionIndex = 0;
    claimSectionSelectEl.disabled = true;
    [claimSectionPreviousButton, claimSectionNextButton].forEach((button) => {
      if (button) button.disabled = true;
    });
    if (claimSectionMetaEl) claimSectionMetaEl.textContent = t("claim_section_empty");
    updateReviewDeskStatusTitle?.();
    return;
  }

  selectedClaimSectionIndex = Math.max(0, Math.min(sections.length - 1, previous));
  sections.forEach((section, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${section.title}`;
    claimSectionSelectEl.append(option);
  });
  claimSectionSelectEl.disabled = false;
  claimSectionSelectEl.value = String(selectedClaimSectionIndex);
  [claimSectionPreviousButton, claimSectionNextButton].forEach((button) => {
    if (button) button.disabled = sections.length < 2;
  });

  const active = sections[selectedClaimSectionIndex];
  if (claimSectionMetaEl) {
    claimSectionMetaEl.textContent = t("claim_section_meta", selectedClaimSectionIndex + 1, sections.length, active.title);
  }
  updateReviewDeskStatusTitle?.();
}

function selectClaimCheckSection(index) {
  const sections = getClaimCheckSectionBlocks();
  if (!sections.length) {
    renderClaimCheckSections();
    return;
  }
  selectedClaimSectionIndex = Math.max(0, Math.min(sections.length - 1, Number.isFinite(index) ? index : 0));
  selectedStyleSectionIndex = selectedClaimSectionIndex;
  renderStyleCheckSections();
  renderClaimCheckSections();
  revealReviewDeskSection(selectedClaimSectionIndex);
}

function showAdjacentClaimCheckSection(direction) {
  const sections = getClaimCheckSectionBlocks();
  if (!sections.length) {
    renderClaimCheckSections();
    return;
  }
  const next = selectedClaimSectionIndex + direction;
  selectClaimCheckSection((next + sections.length) % sections.length);
}

function setClaimCheckWaiting(message) {
  claimResultsEl.replaceChildren();
  const waiting = document.createElement("div");
  waiting.className = "empty-folder-note";
  waiting.textContent = message;
  claimResultsEl.append(waiting);
  setStatus(message);
}

// Called from the claim-check stream snapshot and from HKRR review, both of
// which repaint many times per run: it has to be a plain synchronous repaint.
function renderClaimCheckDraft(markdown) {
  if (!claimResultsEl) return;
  const clean = stripRebuildMarkdownFence(markdown);
  claimResultsEl.innerHTML = clean.trim()
    ? markdownToSystemHtml(clean)
    : `<div class="empty-folder-note">${escapeHtml(t("running_check"))}</div>`;
}
