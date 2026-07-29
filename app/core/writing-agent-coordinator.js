// Browser adapter for the pure Writing Agent runtime.
// It coordinates one model run but never saves, inserts, exports, or commits output.

const writingAgentToolRegistry = window.AISystem6WritingAgentRuntime.createToolRegistry({ maxRounds: 3 });

function writingAgentSourceScope(options = {}) {
  if (options.sourceScope) return options.sourceScope;
  return {
    sourceIds: Array.isArray(options.sourceIds) ? options.sourceIds : [],
    citationIds: Array.isArray(options.citationIds) ? options.citationIds : [],
  };
}

function writingAgentEvidenceSnapshot(projectId, sourceScope) {
  const runtime = window.AISystem6RetrievalRuntime;
  const retrievedAt = new Date().toISOString();
  return (lastRetrievedContextItems || [])
    .filter((item) => item?.included !== false && !item?.excluded)
    .map((item) => runtime.normalizeEvidence(item, { projectId, retrievedAt }))
    .filter((item) => runtime.evidenceBelongsToScope(item, {
      projectId,
      ...window.AISystem6WritingAgentRuntime.normalizeSourceScope(sourceScope),
    }));
}

function writingAgentClip(value, maxChars = 12000) {
  const text = String(value || "");
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}…` : text;
}

function writingAgentProjectToolContext(projectId) {
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (!project || String(project.id || "") !== String(projectId || "")) {
    return { docMaps: [], scraps: [], drafts: [], terms: [] };
  }
  const docMaps = (typeof getDocumentTabs === "function" ? getDocumentTabs("docMap", project) : [])
    .map((tab) => {
      const map = tab?.state?.map || tab?.map || null;
      const markdown = map && typeof formatDocMapMarkdown === "function"
        ? formatDocMapMarkdown(map)
        : JSON.stringify(map || tab?.state || {});
      return {
        projectId,
        docMapId: String(tab?.id || ""),
        title: String(tab?.title || map?.title || ""),
        sourceLabel: String(map?.sourceLabel || ""),
        markdown: writingAgentClip(markdown, 16000),
      };
    });
  const projectScraps = typeof getProjectScraps === "function" ? getProjectScraps() : [];
  const scrapSnapshot = projectScraps.map((scrap) => ({
    projectId,
    scrapId: String(scrap?.id || ""),
    title: String(scrap?.title || ""),
    body: writingAgentClip(scrap?.body || scrap?.selectedText || "", 8000),
    sourceId: String(scrap?.sourceId || ""),
    sourceTitle: String(scrap?.sourceTitle || ""),
    tags: Array.isArray(scrap?.tags) ? scrap.tags.slice(0, 12).map(String) : [],
  }));
  const drafts = (Array.isArray(project.drafts) ? project.drafts : []).map((draft, index) => ({
    projectId,
    draftId: String(draft?.id || `draft-${index + 1}`),
    title: String(draft?.title || draft?.sectionTitle || ""),
    headings: String(draft?.body || "")
      .split("\n")
      .map((line) => line.match(/^#{1,6}\s+(.+)/)?.[1]?.trim() || "")
      .filter(Boolean)
      .slice(0, 24),
    bodyChars: String(draft?.body || "").length,
  }));
  const terms = (Array.isArray(project.dictionaryTerms) ? project.dictionaryTerms : []).map((term) => ({
    projectId,
    term: String(term?.term || ""),
    definition: writingAgentClip(term?.definition || term?.chineseExplanation || "", 1200),
    kind: String(term?.kind || ""),
  }));
  return { docMaps, scraps: scrapSnapshot, drafts, terms };
}

function writingAgentTextMatches(item, query) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  if (!needle) return true;
  return JSON.stringify(item).toLocaleLowerCase().includes(needle);
}

function registerWritingAgentTools() {
  const evidenceArraySchema = {
    type: "array",
    items: {
      type: "object",
      required: ["projectId", "sourceId", "chunkId", "text"],
      properties: {
        projectId: { type: "string" },
        sourceId: { type: "string" },
        chunkId: { type: "string" },
        text: { type: "string" },
        citation: { type: "string" },
        score: { type: "number" },
      },
      additionalProperties: true,
    },
  };

  writingAgentToolRegistry.register({
    name: "searchProjectSources",
    description: "Search only the evidence packet assembled for the active project.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1, maxLength: 2000 },
        count: { type: "integer", minimum: 1, maximum: 12 },
      },
      additionalProperties: false,
    },
    outputSchema: evidenceArraySchema,
    scope: ["project", "source"],
    effect: "read",
    timeoutMs: 8000,
    maxResults: 12,
    run(context, input) {
      const runtime = window.AISystem6RetrievalRuntime;
      const words = runtime.getQueryWords(input.query);
      const count = input.count ?? 6;
      const data = (context.evidence || [])
        .map((item) => ({ ...item, score: Math.max(Number(item.score || 0), runtime.keywordScore(item.text, words)) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, count);
      return { data, provenance: data, truncated: data.length >= count };
    },
  });

  writingAgentToolRegistry.register({
    name: "readSourceDocMap",
    description: "Read a saved DocMap snapshot from the active project without changing it.",
    inputSchema: {
      type: "object",
      properties: {
        docMapId: { type: "string", maxLength: 160 },
        query: { type: "string", maxLength: 1000 },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: { type: "object", additionalProperties: true } },
    scope: ["project", "docmap"],
    effect: "read",
    timeoutMs: 2000,
    maxResults: 6,
    run(context, input) {
      const data = (context.projectTools?.docMaps || [])
        .filter((item) => !input.docMapId || item.docMapId === input.docMapId)
        .filter((item) => writingAgentTextMatches(item, input.query))
        .slice(0, 6);
      return { data, provenance: [], truncated: data.length >= 6 };
    },
  });

  writingAgentToolRegistry.register({
    name: "readProjectScrap",
    description: "Read matching Scrapbook clips from the active project snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        scrapId: { type: "string", maxLength: 160 },
        query: { type: "string", maxLength: 1000 },
        count: { type: "integer", minimum: 1, maximum: 12 },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: { type: "object", additionalProperties: true } },
    scope: ["project", "scrap"],
    effect: "read",
    timeoutMs: 2000,
    maxResults: 12,
    run(context, input) {
      const count = input.count ?? 6;
      const data = (context.projectTools?.scraps || [])
        .filter((item) => !input.scrapId || item.scrapId === input.scrapId)
        .filter((item) => writingAgentTextMatches(item, input.query))
        .slice(0, count);
      return { data, provenance: [], truncated: data.length >= count };
    },
  });

  writingAgentToolRegistry.register({
    name: "readDraftStructure",
    description: "Read section titles, headings, and sizes for active-project drafts; never read or overwrite the manuscript body.",
    inputSchema: {
      type: "object",
      properties: { draftId: { type: "string", maxLength: 160 } },
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: { type: "object", additionalProperties: true } },
    scope: ["project", "draft"],
    effect: "read",
    timeoutMs: 2000,
    maxResults: 24,
    run(context, input) {
      const data = (context.projectTools?.drafts || [])
        .filter((item) => !input.draftId || item.draftId === input.draftId)
        .slice(0, 24);
      return { data, provenance: [], truncated: data.length >= 24 };
    },
  });

  writingAgentToolRegistry.register({
    name: "checkExistingCitation",
    description: "Check whether a citation is present in the already-authorized evidence packet.",
    inputSchema: {
      type: "object",
      required: ["citationId"],
      properties: { citationId: { type: "string", minLength: 1, maxLength: 160 } },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      required: ["exists", "citationId", "matches"],
      properties: {
        exists: { type: "boolean" },
        citationId: { type: "string" },
        matches: evidenceArraySchema,
      },
      additionalProperties: false,
    },
    scope: ["project", "source"],
    effect: "read",
    timeoutMs: 2000,
    maxResults: 12,
    run(context, input) {
      const matches = (context.evidence || []).filter((item) =>
        item.citation === input.citationId || item.citationId === input.citationId
      );
      return {
        data: { exists: matches.length > 0, citationId: input.citationId, matches },
        provenance: matches,
        truncated: false,
      };
    },
  });

  writingAgentToolRegistry.register({
    name: "readProjectTerms",
    description: "Read terminology explicitly saved in the active project's dictionary.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 500 },
        count: { type: "integer", minimum: 1, maximum: 24 },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: { type: "object", additionalProperties: true } },
    scope: ["project", "terms"],
    effect: "read",
    timeoutMs: 2000,
    maxResults: 24,
    run(context, input) {
      const count = input.count ?? 12;
      const data = (context.projectTools?.terms || [])
        .filter((item) => writingAgentTextMatches(item, input.query))
        .slice(0, count);
      return { data, provenance: [], truncated: data.length >= count };
    },
  });

  writingAgentToolRegistry.register({
    name: "readCitation",
    description: "Read one citation from the already-authorized evidence packet.",
    inputSchema: {
      type: "object",
      required: ["citationId"],
      properties: { citationId: { type: "string", minLength: 1, maxLength: 160 } },
      additionalProperties: false,
    },
    outputSchema: evidenceArraySchema,
    scope: ["project", "source"],
    effect: "read",
    timeoutMs: 2000,
    maxResults: 12,
    run(context, input) {
      const data = (context.evidence || []).filter((item) => item.citation === input.citationId);
      return { data, provenance: data, truncated: false };
    },
  });

  writingAgentToolRegistry.register({
    name: "proposeManuscriptPatch",
    description: "Create a temporary manuscript patch proposal without applying it.",
    inputSchema: {
      type: "object",
      required: ["target", "replacement", "reason"],
      properties: {
        target: { type: "string", minLength: 1, maxLength: 12000 },
        replacement: { type: "string", maxLength: 24000 },
        reason: { type: "string", minLength: 1, maxLength: 2000 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      required: ["kind", "status", "target", "replacement", "reason"],
      properties: {
        kind: { const: "manuscript-patch" },
        status: { const: "proposal" },
        target: { type: "string" },
        replacement: { type: "string" },
        reason: { type: "string" },
      },
      additionalProperties: false,
    },
    scope: ["project", "manuscript"],
    effect: "proposal",
    timeoutMs: 2000,
    maxResults: 1,
    run(context, input) {
      return {
        data: { kind: "manuscript-patch", status: "proposal", ...input },
        provenance: [],
        truncated: false,
      };
    },
  });
}

registerWritingAgentTools();

const browserWritingAgentCoordinator = window.AISystem6WritingAgentRuntime.createWritingAgentCoordinator({
  preflight(input) {
    const effect = "proposal";
    const projectId = String(input.projectId || "");
    if (input.requiresProject && !projectId) throw new Error("A mounted project is required for this writing task.");
    return {
      effect,
      allowedEffects: ["read", "proposal"],
      skipRetrieval: input.options?.skipContext === true || input.options?.temporaryChat === true,
    };
  },
  async retrieve(input) {
    const { userText, signal, options = {} } = input;
    const sideAskChat = sideAskEnabled && !isMultiFinderMode();
    const shouldRank = !sideAskChat
      && (rememberInput.checked || attachedClipIds.size > 0 || hasMountedFileDiskContext());
    if (shouldRank) await rankChunksForQuery(userText, signal);
    const payload = options.payload || buildPayload(userText, { ...options, taskKind: input.taskKind });
    return {
      payload,
      evidence: writingAgentEvidenceSnapshot(input.projectId, input.sourceScope),
      projectTools: writingAgentProjectToolContext(input.projectId),
    };
  },
  async generate(input, run, prepared) {
    const payload = prepared.payload || buildPayload(input.userText, {
      ...input.options,
      taskKind: input.taskKind,
    });
    const taskKind = String(input.taskKind || "").toLowerCase();
    const supportsInteractiveTools = !!input.projectId
      && input.options?.disableAgentTools !== true
      && !payload.response_format
      && /^(chat|sideask|reader|scrapbook|docmap-question)$/.test(taskKind);
    if (!supportsInteractiveTools) {
      const result = await sendLocalModelTask({
        ...input.options,
        userText: input.userText,
        signal: input.signal,
        taskKind: input.taskKind,
        payload,
      });
      return { output: result.text, modelResult: result };
    }

    const runtime = window.AISystem6WritingAgentRuntime;
    const providerTools = runtime.providerToolDefinitions(
      writingAgentToolRegistry.list(),
      prepared.allowedEffects
    );
    const { tools: _ignoredTools, tool_choice: _ignoredToolChoice, ...payloadWithoutTools } = payload;
    const messages = Array.isArray(payloadWithoutTools.messages)
      ? payloadWithoutTools.messages.map((message) => ({ ...message }))
      : [];
    let appendedToolResults = 0;
    let lastResult = null;
    const loopResult = await writingAgentToolRegistry.runToolLoop({
      maxRounds: 3,
      context: {
        projectId: input.projectId,
        sourceScope: input.sourceScope,
        evidence: prepared.evidence || [],
        projectTools: prepared.projectTools || {},
        allowedEffects: prepared.allowedEffects || ["read", "proposal"],
      },
      async next({ toolResults, toolsDisabled = false }) {
        toolResults.slice(appendedToolResults).forEach((entry) => {
          messages.push({
            role: "tool",
            tool_call_id: entry.id,
            name: entry.name,
            content: JSON.stringify(entry.result),
          });
        });
        appendedToolResults = toolResults.length;
        const modelPayload = {
          ...payloadWithoutTools,
          messages,
          ...(toolsDisabled || !providerTools.length
            ? {}
            : { tools: providerTools, tool_choice: "auto" }),
        };
        lastResult = await sendLocalModelTask({
          ...input.options,
          userText: input.userText,
          signal: input.signal,
          taskKind: input.taskKind,
          payload: modelPayload,
          streamPreference: "json",
        });
        const calls = runtime.normalizeProviderToolCalls(lastResult.message);
        if (!calls.length) return { done: true, output: lastResult.text };
        messages.push({
          role: "assistant",
          content: lastResult.message?.content || null,
          tool_calls: lastResult.toolCalls,
        });
        return { calls, output: lastResult.text };
      },
    });
    const result = lastResult || { text: String(loopResult.output || "") };
    return {
      output: String(loopResult.output ?? result.text ?? ""),
      modelResult: result,
      toolCalls: loopResult.toolCalls,
      toolLoopTruncated: loopResult.truncated === true,
    };
  },
  onTransition(run) {
    window.lastWritingAgentRun = run;
  },
});

async function runWritingTask(options = {}) {
  const taskKind = String(options.taskKind || "chat");
  const projectId = String(options.projectId || activeProjectId || "");
  try {
    const result = await browserWritingAgentCoordinator.run({
      projectId,
      taskKind,
      sourceScope: writingAgentSourceScope(options),
      retryOf: options.retryOf || options.continueFromMessageId || "",
      userText: String(options.userInput || options.userText || ""),
      selection: options.selection || null,
      signal: options.signal,
      requiresProject: options.requiresProject === true,
      options,
    });
    window.lastWritingAgentRun = result.run;
    if (window.lastTaskRunManifest) {
      window.lastTaskRunManifest.agentRun = window.AISystem6WritingAgentRuntime.snapshotAgentRun(result.run);
    }
    return result.output;
  } catch (error) {
    if (error?.agentRun) {
      window.lastWritingAgentRun = error.agentRun;
      if (window.lastTaskRunManifest) {
        window.lastTaskRunManifest.agentRun = window.AISystem6WritingAgentRuntime.snapshotAgentRun(error.agentRun);
      }
    }
    throw error;
  }
}

window.AISystem6WritingAgent = Object.freeze({
  runWritingTask,
  toolRegistry: writingAgentToolRegistry,
});
