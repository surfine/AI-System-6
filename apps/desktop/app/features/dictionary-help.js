// Feature module: dictionary-help.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



function normalizeDictionaryTerm(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[`"'“”‘’「『《（([{<\s]+/, "")
    .replace(/[`"'“”‘’」』》）)\]}>.,;:!?，。；：！？\s]+$/, "")
    .trim();
}

function detectDictionaryTermLanguage(term) {
  const value = String(term || "");
  const hasHan = /[\u3400-\u9fff]/.test(value);
  const hasLatin = /[A-Za-z]/.test(value);
  if (hasHan && hasLatin) return "mixed";
  if (hasHan) return "zh";
  if (hasLatin) return "en";
  return "unknown";
}

function getProjectDictionaryTerm(term) {
  const project = getActiveProject();
  const normalized = normalizeDictionaryTerm(term).toLowerCase();
  return project?.dictionaryTerms?.find((item) =>
    [item.term, ...(item.aliases || [])].some((alias) => normalizeDictionaryTerm(alias).toLowerCase() === normalized)
  ) || null;
}

function getSystemDictionaryTerm(term) {
  const normalized = normalizeDictionaryTerm(term).toLowerCase();
  if (!normalized) return null;
  return systemDictionaryEntries.find((entry) =>
    [entry.term, ...(entry.aliases || [])].some((alias) => normalizeDictionaryTerm(alias).toLowerCase() === normalized)
  ) || null;
}

function systemHelpEntryId(entry) {
  return entry?.id || normalizeDictionaryTerm(entry?.term).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getSystemHelpEntryById(id) {
  return systemDictionaryEntries.find((entry) => systemHelpEntryId(entry) === id) || null;
}

// Group order is the reading order of the window: the writing route first, then
// the tools a writer summons, then models, then the desktop, then the rules.
const systemHelpGroupOrder = ["route", "tools", "model", "desktop", "concept"];

function systemHelpGroupLabel(group) {
  return t(`system_help_group_${group || "concept"}`);
}

function systemHelpEntryIcon(entry) {
  return entry?.icon || "systemHelp";
}

function systemHelpRouteEntries() {
  return systemDictionaryEntries
    .filter((entry) => entry.routeStop)
    .sort((left, right) => left.routeStop - right.routeStop);
}

function systemHelpActionLabel(entry) {
  if (!entry?.action) return "";
  // An entry may name its own verb ("Insert File Floppy"); otherwise the desk
  // opens the object.
  const own = currentLanguage === "zh" ? entry.actionLabelZh : entry.actionLabel;
  if (own) return own;
  return `${t("system_help_open_feature")} ${entry.term}`;
}

function systemHelpLocalizedDefinition(entry) {
  if (!entry) return "";
  if (currentLanguage === "zh") {
    return entry.definitionZh || entry.chineseExplanation || entry.definition || "";
  }
  return entry.definition || entry.definitionEn || entry.chineseExplanation || "";
}

function systemHelpLocalizedExample(entry) {
  if (!entry) return "";
  return currentLanguage === "zh" ? entry.exampleZh || "" : entry.example || "";
}

function systemHelpAssistantPrompt(entry) {
  if (currentLanguage === "zh") {
    return "请说明我在当前写作任务里应该怎样使用这个 AI System 6 概念。";
  }
  return "Explain how I should use this AI System 6 concept in my current work.";
}

function systemHelpSearchHaystack(entry) {
  return [
    entry.term,
    entry.termZh,
    ...(entry.aliases || []),
    entry.category,
    entry.definition,
    entry.definitionZh,
    entry.chineseExplanation,
    entry.example,
    entry.exampleZh,
  ].filter(Boolean).map((value) => String(value).toLowerCase()).join("\n");
}

function filteredSystemHelpEntries() {
  const query = normalizeDictionaryTerm(systemHelpQueryInput?.value || "").toLowerCase();
  return systemDictionaryEntries.filter((entry) => {
    const groupMatches = selectedSystemHelpGroup === "all" || entry.category === selectedSystemHelpGroup;
    if (!groupMatches) return false;
    if (!query) return true;
    return systemHelpSearchHaystack(entry).includes(query);
  });
}

// The route reads in route order; every other group keeps its authored order.
function orderedSystemHelpEntries(entries) {
  return [...entries].sort((left, right) => {
    const leftGroup = systemHelpGroupOrder.indexOf(left.category);
    const rightGroup = systemHelpGroupOrder.indexOf(right.category);
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    if (left.routeStop && right.routeStop) return left.routeStop - right.routeStop;
    if (left.routeStop) return -1;
    if (right.routeStop) return 1;
    return systemDictionaryEntries.indexOf(left) - systemDictionaryEntries.indexOf(right);
  });
}

function syncSystemHelpGroupSelect() {
  if (!systemHelpGroupSelect) return;
  const groups = systemHelpGroupOrder.filter((group) =>
    systemDictionaryEntries.some((entry) => entry.category === group)
  );
  const options = [{ value: "all", label: t("system_help_all") }]
    .concat(groups.map((group) => ({ value: group, label: systemHelpGroupLabel(group) })));
  systemHelpGroupSelect.replaceChildren();
  options.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    systemHelpGroupSelect.append(option);
  });
  systemHelpGroupSelect.value = options.some((option) => option.value === selectedSystemHelpGroup)
    ? selectedSystemHelpGroup
    : "all";
  // The System 6 select harness mirrors the native options, so repopulating
  // them has to refresh the visible control.
  refreshSystemSelectControl(systemHelpGroupSelect);
}

// Moves the list selection without re-rendering the rows, so the scroll
// offset and keyboard focus survive the tap. Only the detail pane redraws.
function selectSystemHelpEntry(id) {
  if (!systemHelpListEl || !systemHelpDetailEl) return;
  selectedSystemHelpEntryId = id;
  systemHelpListEl.querySelectorAll("[data-help-entry]").forEach((row) => {
    const isSelected = row.dataset.helpEntry === id;
    row.classList.toggle("is-selected", isSelected);
    row.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
  renderSystemHelpDetail(getSystemHelpEntryById(id));
}

function renderSystemHelp() {
  if (!systemHelpListEl || !systemHelpDetailEl) return;

  const query = normalizeDictionaryTerm(systemHelpQueryInput?.value || "");
  const visibleEntries = orderedSystemHelpEntries(filteredSystemHelpEntries());
  const visibleIds = new Set(visibleEntries.map(systemHelpEntryId));

  if (!selectedSystemHelpEntryId || !visibleIds.has(selectedSystemHelpEntryId)) {
    selectedSystemHelpEntryId = systemHelpEntryId(visibleEntries[0]) || systemHelpEntryId(systemDictionaryEntries[0]);
  }

  syncSystemHelpGroupSelect();

  if (systemHelpScopeEl) {
    systemHelpScopeEl.textContent = query ? t("system_help_searching", query) : t("system_help_terms");
  }
  if (systemHelpCountEl) {
    systemHelpCountEl.textContent = t("system_help_count", visibleEntries.length, systemDictionaryEntries.length);
  }

  systemHelpListEl.replaceChildren();
  if (!visibleEntries.length) {
    systemHelpListEl.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("system_help_empty"))}</p>`;
    systemHelpDetailEl.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("system_help_empty"))}</p>`;
    return;
  }

  let renderedGroup = "";
  visibleEntries.forEach((entry) => {
    const id = systemHelpEntryId(entry);
    if (entry.category !== renderedGroup) {
      renderedGroup = entry.category;
      const heading = document.createElement("p");
      heading.className = "system-help-group";
      // A listbox owns options; the group heading is a visual divider.
      heading.setAttribute("role", "presentation");
      heading.textContent = systemHelpGroupLabel(entry.category);
      systemHelpListEl.append(heading);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    button.dataset.helpEntry = id;
    button.setAttribute("aria-selected", id === selectedSystemHelpEntryId ? "true" : "false");
    button.className = id === selectedSystemHelpEntryId ? "is-selected" : "";
    const secondaryName = currentLanguage === "zh" ? entry.termZh : "";
    button.innerHTML = `
      ${renderSystemIcon(systemHelpEntryIcon(entry), { size: "help-row" })}
      <b>${escapeHtml(entry.term)}</b>
      <small>${escapeHtml(secondaryName && secondaryName !== entry.term ? secondaryName : "")}</small>
    `;
    // Selecting a row must not rebuild the list: replaceChildren() drops the
    // scroll offset and the focused element, so on a phone the list snapped
    // back to the top and lost focus on every tap.
    button.addEventListener("click", () => {
      selectSystemHelpEntry(id);
    });
    systemHelpListEl.append(button);
  });

  const selectedEntry = getSystemHelpEntryById(selectedSystemHelpEntryId) || visibleEntries[0];
  renderSystemHelpDetail(selectedEntry);
}

function systemHelpRouteRibbon(entry) {
  const stops = systemHelpRouteEntries();
  if (!stops.length) return "";
  const marks = stops.map((stop) => {
    const label = currentLanguage === "zh" ? stop.termZh || stop.term : stop.term;
    const isCurrent = stop.id === entry.id;
    return `<span${isCurrent ? ' class="is-current"' : ""}>${escapeHtml(label)}</span>`;
  });
  return `<p class="system-help-route">${marks.join("<span aria-hidden=\"true\">&rsaquo;</span>")}</p>`;
}

// The entry reads like a Get Info window: object header, then labelled rows the
// user does not have to guess at, then the actions the object itself owns.
function renderSystemHelpDetail(entry) {
  if (!systemHelpDetailEl || !entry) return;
  // Aliases stay language-matched: an English desk does not list 术语表.
  const aliases = (entry.aliases || []).filter((alias) =>
    normalizeDictionaryTerm(alias) !== normalizeDictionaryTerm(entry.term)
    && normalizeDictionaryTerm(alias) !== normalizeDictionaryTerm(entry.termZh)
    && (currentLanguage === "zh" || detectDictionaryTermLanguage(alias) !== "zh")
  );
  const relatedEntries = (entry.related || []).map(getSystemHelpEntryById).filter(Boolean);
  // System Help never offers to open System Help; the window is already here.
  const actionLabel = entry.action === "open-system-help" ? "" : systemHelpActionLabel(entry);
  const definition = systemHelpLocalizedDefinition(entry);
  const example = systemHelpLocalizedExample(entry);
  const secondaryName = currentLanguage === "zh" && entry.termZh && entry.termZh !== entry.term ? entry.termZh : "";
  const routeRibbon = entry.category === "route" ? systemHelpRouteRibbon(entry) : "";

  systemHelpDetailEl.innerHTML = `
    <article class="system-help-card">
      <header class="system-help-head">
        ${renderSystemIcon(systemHelpEntryIcon(entry), { size: "help-object" })}
        <div>
          <h3>${escapeHtml(entry.term)}</h3>
          <p>${escapeHtml([secondaryName, systemHelpGroupLabel(entry.category)].filter(Boolean).join(" · "))}</p>
        </div>
      </header>
      <div class="system-help-card-scroll">
        <dl class="system-help-info">
          ${routeRibbon ? `
            <dt>${escapeHtml(t("system_help_position"))}</dt>
            <dd>${routeRibbon}</dd>
          ` : ""}
          <dt>${escapeHtml(t("system_help_definition"))}</dt>
          <dd>${escapeHtml(definition)}</dd>
          ${example ? `
            <dt>${escapeHtml(t("dictionary_example"))}</dt>
            <dd>${escapeHtml(example)}</dd>
          ` : ""}
          ${aliases.length ? `
            <dt>${escapeHtml(t("system_help_aliases"))}</dt>
            <dd class="system-help-aliases">${aliases.map((alias) => `<span>${escapeHtml(alias)}</span>`).join("")}</dd>
          ` : ""}
          ${relatedEntries.length ? `
            <dt>${escapeHtml(t("system_help_related"))}</dt>
            <dd class="system-help-related">${relatedEntries.map((related) => `<button type="button" class="system-help-related-link" data-system-help-related="${escapeHtml(systemHelpEntryId(related))}">${escapeHtml(currentLanguage === "zh" ? related.termZh || related.term : related.term)}</button>`).join("")}</dd>
          ` : ""}
        </dl>
      </div>
      <div class="button-row system-help-actions">
        <button type="button" class="btn" data-system-help-action="lookup">${escapeHtml(t("system_help_lookup_dictionary"))}</button>
        <button type="button" class="btn${actionLabel ? "" : " default"}" data-system-help-action="ask">${escapeHtml(t("system_help_ask_assistant"))}</button>
        ${actionLabel ? `<button type="button" class="btn default" data-system-help-action="open">${escapeHtml(actionLabel)}</button>` : ""}
      </div>
    </article>
  `;

  systemHelpDetailEl.querySelectorAll("[data-system-help-related]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSystemHelpEntryId = button.dataset.systemHelpRelated;
      renderSystemHelp();
    });
  });

  systemHelpDetailEl.querySelector('[data-system-help-action="open"]')?.addEventListener("click", () => {
    handleAction(entry.action);
    setStatus(t("system_help_opened", entry.term));
  });
  systemHelpDetailEl.querySelector('[data-system-help-action="lookup"]')?.addEventListener("click", () => {
    openDictionaryForSystemHelpEntry(entry);
  });
  systemHelpDetailEl.querySelector('[data-system-help-action="ask"]')?.addEventListener("click", () => {
    askAssistantAboutSystemHelpEntry(entry);
  });
}

async function openSystemHelpEntry(termOrId) {
  await ensureSystemDictionaryData();
  const normalized = normalizeDictionaryTerm(termOrId).toLowerCase();
  const entry = getSystemHelpEntryById(termOrId)
    || systemDictionaryEntries.find((item) =>
      [item.term, ...(item.aliases || [])].some((alias) => normalizeDictionaryTerm(alias).toLowerCase() === normalized)
    );
  if (entry) selectedSystemHelpEntryId = systemHelpEntryId(entry);
  renderSystemHelp();
  openWindow("systemHelp");
}

function openDictionaryForSystemHelpEntry(entry) {
  if (!entry) return;
  const result = normalizeSystemDictionaryResult(entry, {
    text: entry.term,
    surface: "systemHelp",
    source: { title: t("system_help") },
  });
  renderDictionaryResult(result);
  openWindow("dictionary");
  setStatus(t("dictionary_ready"));
}

function askAssistantAboutSystemHelpEntry(entry) {
  if (!entry) return;
  const definition = systemHelpLocalizedDefinition(entry);
  const example = systemHelpLocalizedExample(entry);
  promptInput.value = [
    `${t("system_help")}: ${entry.term}`,
    "",
    definition,
    example ? `${t("dictionary_example")}: ${example}` : "",
    "",
    systemHelpAssistantPrompt(entry),
  ].filter(Boolean).join("\n");
  openWindow("assistant");
  promptInput.focus();
  setStatus(t("system_help_sent_assistant"));
}

function normalizeSystemDictionaryResult(entry, context) {
  const definition = systemHelpLocalizedDefinition(entry);
  const example = systemHelpLocalizedExample(entry);
  return normalizeDictionaryResult({
    term: entry.term,
    language: currentLanguage,
    kind: entry.kind,
    definition,
    chineseExplanation: "",
    example,
    sourceLabel: t("system_help"),
    systemHelpId: systemHelpEntryId(entry),
  }, entry.term, context, t("dictionary_system_source"));
}

function quickDictionaryKind(term, language = detectDictionaryTermLanguage(term)) {
  const value = String(term || "").trim();
  if (language === "zh") return value.length > 1 ? "phrase" : "word";
  if (/\s/.test(value)) return "phrase";
  return "word";
}

function stripDictionaryMarkdownFence(markdown) {
  return String(markdown || "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function dictionaryMarkdownField(markdown, labels) {
  const source = stripDictionaryMarkdownFence(markdown);
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = source.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?(?:${labelPattern})(?:\\*\\*)?\\s*[:：]\\s*(.+)`, "i"));
  return match?.[1]?.trim() || "";
}

function dictionaryMarkdownDefinition(markdown) {
  const source = stripDictionaryMarkdownFence(markdown);
  const headingMatch = source.match(/(?:^|\n)#{2,4}\s*(?:Definition|释义|解释)\s*\n+([\s\S]*?)(?=\n#{2,4}\s+|$)/i);
  if (headingMatch?.[1]) return headingMatch[1].trim();
  const field = dictionaryMarkdownField(source, ["Definition", "释义", "解释"]);
  if (field) return field;
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !/^(kind|类型|language|语言|example|例句)\s*[:：]/i.test(line))
    .join("\n")
    .trim();
}

function dictionaryMarkdownExample(markdown) {
  const source = stripDictionaryMarkdownFence(markdown);
  const headingMatch = source.match(/(?:^|\n)#{2,4}\s*(?:Example|例句|用例)\s*\n+([\s\S]*?)(?=\n#{2,4}\s+|$)/i);
  if (headingMatch?.[1]) return headingMatch[1].trim();
  return dictionaryMarkdownField(source, ["Example", "例句", "用例"]);
}

function normalizeDictionaryMarkdownResult(markdown, term, context, sourceMode = t("dictionary_ai_source")) {
  const clean = stripDictionaryMarkdownFence(markdown);
  return normalizeDictionaryResult({
    term,
    language: dictionaryMarkdownField(clean, ["Language", "语言"]) || detectDictionaryTermLanguage(term),
    kind: dictionaryMarkdownField(clean, ["Kind", "类型"]) || quickDictionaryKind(term),
    definition: dictionaryMarkdownDefinition(clean),
    example: dictionaryMarkdownExample(clean),
    markdown: clean,
  }, term, context, sourceMode);
}

function normalizeDictionaryResult(data, term, context, sourceMode = t("dictionary_ai_source")) {
  const detectedLanguage = detectTextLanguage(term);
  return {
    term: normalizeDictionaryTerm(data?.term || term),
    language: data?.language || (detectedLanguage === "unknown" ? detectDictionaryTermLanguage(term) : detectedLanguage),
    kind: String(data?.kind || "term").slice(0, 40),
    definition: String(data?.definition || data?.shortDefinition || "").trim(),
    chineseExplanation: String(data?.chineseExplanation || data?.chinese || "").trim(),
    example: String(data?.example || data?.exampleSentence || data?.examples?.[0]?.text || "").trim(),
    markdown: String(data?.markdown || "").trim(),
    sourceMode,
    sourceLabel: data?.sourceLabel || selectionLabelForContext(context),
    sourceContext: data?.sourceContext || sourceContextText(context),
    sourceSurface: data?.sourceSurface || context?.surface || "",
    systemHelpId: data?.systemHelpId || "",
    selectionStart: Number.isFinite(context?.start) ? context.start : data?.selectionStart ?? null,
    selectionEnd: Number.isFinite(context?.end) ? context.end : data?.selectionEnd ?? null,
    model: sourceMode === t("dictionary_ai_source") ? currentTranslationModel() : data?.model || "",
    updatedAt: data?.updatedAt || new Date().toISOString(),
  };
}

function rememberDictionaryResult(result) {
  if (!result?.term || !(result.definition || result.chineseExplanation)) return;
  const key = normalizeDictionaryTerm(result.term).toLowerCase();
  dictionaryRecentResults = [
    result,
    ...dictionaryRecentResults.filter((item) => normalizeDictionaryTerm(item.term).toLowerCase() !== key),
  ].slice(0, 5);
  renderDictionaryRecent();
}

function renderDictionaryRecent() {
  if (!dictionaryRecentEl) return;
  dictionaryRecentEl.replaceChildren();
  const label = document.createElement("b");
  label.textContent = `${t("dictionary_recent")}:`;
  dictionaryRecentEl.append(label);
  if (!dictionaryRecentResults.length) {
    const empty = document.createElement("span");
    empty.textContent = t("dictionary_recent_empty");
    dictionaryRecentEl.append(empty);
    return;
  }
  dictionaryRecentResults.forEach((result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn mini-btn";
    button.textContent = result.term;
    button.title = result.term;
    button.addEventListener("click", () => renderDictionaryResult(result));
    dictionaryRecentEl.append(button);
  });
}

function formatDictionaryMarkdown(result = currentDictionaryResult) {
  if (!result) return "";
  return [
    `# ${result.term}`,
    "",
    `${t("branch_kind")}: ${result.kind || "term"}`,
    `${t("dictionary_language")}: ${languageDisplayName(result.language) || result.language || "unknown"}`,
    `${t("dictionary_source_mode")}: ${result.sourceMode || t("dictionary_no_source")}`,
    result.model ? `Model: ${result.model}` : "",
    "",
    `## ${t("dictionary_definition")}`,
    result.definition || "",
    result.chineseExplanation ? ["", `## ${t("dictionary_chinese")}`, result.chineseExplanation].join("\n") : "",
    result.example ? ["", `## ${t("dictionary_example")}`, result.example].join("\n") : "",
    result.sourceLabel ? ["", "## Source", result.sourceLabel, result.sourceContext || ""].join("\n") : "",
  ].filter(Boolean).join("\n");
}

function renderDictionaryResult(result = currentDictionaryResult, message = "") {
  if (!dictionaryResultEl) return;
  if (result !== undefined) currentDictionaryResult = result;
  const active = currentDictionaryResult;
  if (dictionaryTermEl) dictionaryTermEl.textContent = active?.term || t("dictionary_no_term");
  if (dictionarySourceEl) dictionarySourceEl.textContent = active?.sourceMode || t("dictionary_no_source");

  const usable = !!active && !message && !!(active.definition || active.chineseExplanation);
  const hasSource = active?.sourceMode !== t("dictionary_no_source");
  if (usable && hasSource) rememberDictionaryResult(active);
  else renderDictionaryRecent();

  if (message) {
    dictionaryResultEl.innerHTML = `<p class="empty-folder-note">${escapeHtml(message)}</p>`;
    return;
  }
  if (!active) {
    dictionaryResultEl.innerHTML = `<p class="empty-folder-note">${escapeHtml(t("dictionary_empty"))}</p>`;
    return;
  }
  if (active.markdown) {
    dictionaryResultEl.innerHTML = `
      <article class="dictionary-card dictionary-markdown-card">
        ${markdownToSystemHtml(active.markdown)}
      </article>
    `;
    return;
  }

  dictionaryResultEl.innerHTML = `
    <article class="dictionary-card">
      <h3>${escapeHtml(active.term)}</h3>
      <dl>
        <dt>${escapeHtml(t("dictionary_language"))}</dt>
        <dd>${escapeHtml(languageDisplayName(active.language) || active.language || "unknown")}</dd>
        <dt>${escapeHtml(t("branch_kind"))}</dt>
        <dd>${escapeHtml(active.kind || "term")}</dd>
        <dt>${escapeHtml(t("dictionary_source_mode"))}</dt>
        <dd>${escapeHtml(active.sourceMode || t("dictionary_no_source"))}</dd>
        <dt>${escapeHtml(t("dictionary_definition"))}</dt>
        <dd>${escapeHtml(active.definition || "")}</dd>
        ${active.chineseExplanation ? `<dt>${escapeHtml(t("dictionary_chinese"))}</dt><dd>${escapeHtml(active.chineseExplanation)}</dd>` : ""}
        ${active.example ? `<dt>${escapeHtml(t("dictionary_example"))}</dt><dd>${escapeHtml(active.example)}</dd>` : ""}
        ${active.sourceContext ? `<dt>${escapeHtml(t("dictionary_context"))}</dt><dd>${escapeHtml(clipDictionaryContext(active.sourceContext, 240))}</dd>` : ""}
      </dl>
    </article>
  `;
}

function clipDictionaryContext(text, max = 240) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}...`;
}

async function lookupSelectionTerm(context = getSelectionServiceContext()) {
  if (!context?.text) {
    setStatus(t("dictionary_select_word"));
    return;
  }
  const term = normalizeDictionaryTerm(context.text);
  if (!term) {
    setStatus(t("dictionary_select_word"));
    return;
  }
  if (term.length > dictionaryMaxSelectionChars || countSelectionWords(term) > 12) {
    setStatus(t("dictionary_too_long"));
    openWindow("dictionary");
    renderDictionaryResult(null, t("dictionary_too_long"));
    return;
  }

  const pendingResult = normalizeDictionaryResult({
    term,
    language: detectDictionaryTermLanguage(term),
    kind: quickDictionaryKind(term),
  }, term, context, t("dictionary_ai_source"));
  renderDictionaryResult(pendingResult, t("dictionary_loading"));
  openWindow("dictionary");

  await ensureSystemDictionaryData();
  const saved = getProjectDictionaryTerm(term);
  if (saved) {
    renderDictionaryResult(normalizeDictionaryResult(saved, term, context, t("dictionary_project_source")));
    setStatus(t("dictionary_ready"));
    return;
  }

  const systemTerm = getSystemDictionaryTerm(term);
  if (systemTerm) {
    renderDictionaryResult(normalizeSystemDictionaryResult(systemTerm, context));
    setStatus(t("dictionary_ready"));
    return;
  }

  if (!beginLongTask("dictionary", t("dictionary_loading"))) return;
  try {
    const outputLanguage = currentLanguage === "zh" ? "简体中文" : "English";
    const prompt = `请为写作者解释这个词条。只返回 Markdown，不要 JSON。

# ${term}

- ${t("dictionary_language")}:
- ${t("branch_kind")}:

## ${t("dictionary_definition")}

## ${t("dictionary_example")}

规则：
- 使用${outputLanguage}。
- 释义控制在 1 到 2 句。
- 例句只给 1 句。
- 如果语境不足，可以说明常见用法，不要编造来源。

词条：${term}

语境：
${sourceContextText(context) || "(none)"}`;

    const response = await fetchModelPayload({
      model: getLocalModelRequestName(),
      messages: withMarkdownModelMessages([
        { role: "system", content: resolveWritingRoutePrompt("other-apps.dictionary-markdown") },
        { role: "user", content: prompt },
      ]),
      temperature: 0.1,
      max_tokens: 180,
      stream: false,
    }, getLongTaskSignal());
    const data = await readChatJson(response);
    const content = data?.choices?.[0]?.message?.content || "";
    const result = normalizeDictionaryMarkdownResult(content, term, context, t("dictionary_ai_source"));
    if (!(result.definition || result.chineseExplanation)) {
      throw new Error("lmstudio_bad_response: empty dictionary explanation");
    }
    renderDictionaryResult(result);
    setStatus(t("dictionary_ready"));
  } catch (error) {
    if (!isAbortError(error)) {
      const message = friendlyLocalModelError(error.message || "");
      renderDictionaryResult(pendingResult, t("dictionary_model_failed", message));
      setStatus(t("dictionary_model_failed", message));
    }
  } finally {
    endLongTask("dictionary");
  }
}

function lookupDictionaryInput(event) {
  event?.preventDefault();
  const term = normalizeDictionaryTerm(dictionaryQueryInput?.value || "");
  if (!term) {
    dictionaryQueryInput?.focus();
    setStatus(t("dictionary_select_word"));
    return;
  }
  lookupSelectionTerm({
    surface: "dictionary",
    label: t("dictionary"),
    text: term,
    fullText: term,
    start: 0,
    end: term.length,
  });
}

window.AISystem6DictionaryHelpLoaded = true;
