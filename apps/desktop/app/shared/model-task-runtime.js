// Pure model-task contracts shared by the browser and the Node server.
// This file intentionally has no DOM, browser-storage, network, or Node runtime dependency.

(function exposeModelTaskRuntime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISystem6ModelTaskRuntime = api;
})(typeof globalThis !== "undefined" ? (/** @type {any} */ (globalThis)).window || null : null, () => {
  // The prompt files are generated from private editorial sources and are
  // deliberately absent from the public snapshot, so the type check there must
  // not require the module to exist. The read is already guarded at runtime:
  // absence keeps ordinary chat available; prompt-backed capabilities fail
  // explicitly when their builder tries to resolve the missing prompt.
  const readServerPromptFiles = () => {
    // @ts-ignore optional generated module
    try { return require("../generated/ai-prompt-files.json"); } catch { return []; }
  };
  const serverPromptFiles = typeof require === "function" ? readServerPromptFiles() : [];
  const protectedWritingSpans = Object.freeze([
    "number",
    "date",
    "person-name",
    "proper-noun",
    "quote",
    "citation",
    "code",
    "table-cell",
  ]);
  function registerTask(id, modelRole, outputKind = "markdown", writeTarget = "none", sourcePolicy = "registered-only", humanizer = "off") {
    return Object.freeze({
      id,
      output: Object.freeze({ kind: outputKind }),
      sourcePolicy,
      writeTarget,
      humanizer,
      modelRole,
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: writeTarget !== "none",
    });
  }
  const taskContracts = Object.freeze({
    chat: Object.freeze({
      id: "chat",
      output: Object.freeze({ kind: "markdown" }),
      sourcePolicy: "registered-only",
      writeTarget: "none",
      humanizer: "lint",
      modelRole: "default",
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: false,
    }),
    "source.extract-facts": Object.freeze({
      id: "source.extract-facts",
      output: Object.freeze({ kind: "json", schemaId: "fact-extraction-v1" }),
      sourcePolicy: "selected-only",
      writeTarget: "none",
      humanizer: "off",
      modelRole: "researcher",
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: false,
    }),
    "source.verify-claims": Object.freeze({
      id: "source.verify-claims",
      output: Object.freeze({ kind: "json", schemaId: "claim-verification-v1" }),
      sourcePolicy: "registered-only",
      writeTarget: "none",
      humanizer: "off",
      modelRole: "critic",
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: false,
    }),
    "source.translate": Object.freeze({
      id: "source.translate",
      output: Object.freeze({ kind: "plainText" }),
      sourcePolicy: "selected-only",
      writeTarget: "none",
      humanizer: "off",
      modelRole: "utility",
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: false,
    }),
    "writing.rewrite-selection": Object.freeze({
      id: "writing.rewrite-selection",
      output: Object.freeze({ kind: "patch", schemaId: "text-patch-v1" }),
      sourcePolicy: "registered-only",
      writeTarget: "manuscript",
      humanizer: "lint",
      modelRole: "writer",
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: true,
    }),
    "writing.humanize-selection": Object.freeze({
      id: "writing.humanize-selection",
      output: Object.freeze({ kind: "patch", schemaId: "text-patch-v1" }),
      sourcePolicy: "selected-only",
      writeTarget: "manuscript",
      humanizer: "explicit-rewrite",
      modelRole: "writer",
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: true,
    }),
    "system.json-repair": Object.freeze({
      id: "system.json-repair",
      output: Object.freeze({ kind: "json" }),
      sourcePolicy: "none",
      writeTarget: "none",
      humanizer: "off",
      modelRole: "utility",
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: false,
    }),
    "writing.eli5-rewrite": Object.freeze({
      id: "writing.eli5-rewrite",
      output: Object.freeze({ kind: "patch", schemaId: "text-patch-v1" }),
      sourcePolicy: "registered-only",
      writeTarget: "manuscript",
      humanizer: "lint",
      modelRole: "writer",
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: true,
    }),
    "writing.eli5-review": Object.freeze({
      id: "writing.eli5-review",
      output: Object.freeze({ kind: "json", schemaId: "eli5-review-v1" }),
      sourcePolicy: "registered-only",
      writeTarget: "none",
      humanizer: "off",
      modelRole: "critic",
      protectedSpans: protectedWritingSpans,
      requiresUserCommit: false,
    }),
    // These entries reflect actual shipped callers, rather than word matches.
    "chat.sideask": registerTask("chat.sideask", "default"),
    "chat.clio-stage": registerTask("chat.clio-stage", "default"),
    "chat.task-config": registerTask("chat.task-config", "default"),
    "system.chat-title": registerTask("system.chat-title", "utility", "plainText"),
    "system.preflight": registerTask("system.preflight", "utility"),
    "system.import-repair": registerTask("system.import-repair", "utility", "markdown", "none", "selected-only"),
    "source.audio-transcript-repair": registerTask("source.audio-transcript-repair", "utility", "plainText", "none", "selected-only"),
    "source.read": registerTask("source.read", "researcher"),
    "source.scrapbook": registerTask("source.scrapbook", "researcher", "markdown", "none", "selected-only"),
    "source.docmap": registerTask("source.docmap", "researcher", "markdown", "none", "selected-only"),
    "source.vision-ocr": registerTask("source.vision-ocr", "utility", "markdown", "none", "selected-only"),
    "source.vision-writing-context": registerTask("source.vision-writing-context", "researcher", "markdown", "none", "selected-only"),
    "source.vision-describe": registerTask("source.vision-describe", "utility", "markdown", "none", "selected-only"),
    "source.vision-layout": registerTask("source.vision-layout", "utility", "markdown", "none", "selected-only"),
    "source.vision-pages": registerTask("source.vision-pages", "utility", "markdown", "none", "selected-only"),
    "source.subtitle-translation": registerTask("source.subtitle-translation", "utility", "json", "none", "selected-only"),
    "source.endfield-rag": registerTask("source.endfield-rag", "researcher"),
    "writing.generate-outline": registerTask("writing.generate-outline", "writer", "markdown", "outline", "registered-only", "lint"),
    "writing.organize-question-sheet": registerTask("writing.organize-question-sheet", "writer", "markdown", "question-sheet", "selected-only"),
    "writing.expand-outline": registerTask("writing.expand-outline", "writer", "markdown", "outline", "registered-only", "lint"),
    "writing.rewrite-outline": registerTask("writing.rewrite-outline", "writer", "markdown", "outline", "registered-only", "lint"),
    "writing.outline-reduce": registerTask("writing.outline-reduce", "writer", "markdown", "outline", "registered-only", "lint"),
    "writing.outline-structure": registerTask("writing.outline-structure", "writer", "markdown", "outline", "registered-only", "lint"),
    "writing.outline-review": registerTask("writing.outline-review", "critic"),
    "writing.draft": registerTask("writing.draft", "writer", "markdown", "manuscript", "registered-only", "lint"),
    "writing.polish-section": registerTask("writing.polish-section", "writer", "markdown", "manuscript", "registered-only", "lint"),
    // The Section Drafts one-sentence pair: rewrite returns a whole section
    // body the writer confirms, check returns a reading in the assistant.
    // Both are reached from the same window and had no contract until the
    // registry sweep in tests/features/writing-task-contracts.test.mjs found
    // the kinds used but unregistered.
    "writing.one-sentence-rewrite": registerTask("writing.one-sentence-rewrite", "writer", "markdown", "manuscript", "registered-only", "lint"),
    "writing.one-sentence-check": registerTask("writing.one-sentence-check", "critic"),
    "writing.review-section": registerTask("writing.review-section", "critic"),
    "writing.critique": registerTask("writing.critique", "critic"),
    "writing.style-review": registerTask("writing.style-review", "critic"),
    "writing.hkrr-review": registerTask("writing.hkrr-review", "critic"),
    "writing.mingming-rewrite": registerTask("writing.mingming-rewrite", "writer", "markdown", "manuscript", "registered-only", "lint"),
    "writing.handoff-review": registerTask("writing.handoff-review", "critic"),
    "writing.rebuild": registerTask("writing.rebuild", "writer", "markdown", "manuscript", "registered-only", "lint"),
    "writing.demo": registerTask("writing.demo", "writer", "markdown", "none", "registered-only", "lint"),
    "writing.demo-rag": registerTask("writing.demo-rag", "researcher"),
    "writing.collect-vent-outline": registerTask("writing.collect-vent-outline", "writer", "markdown", "outline", "selected-only", "lint"),
    "writing.first-day-hands-on": registerTask("writing.first-day-hands-on", "writer", "markdown", "manuscript", "registered-only", "lint"),
    "writing.slides": registerTask("writing.slides", "writer", "markdown", "none", "registered-only", "lint"),
    "writing.tool-rewrite": registerTask("writing.tool-rewrite", "writer", "markdown", "manuscript", "registered-only", "lint"),
    "writing.humanizer-rewrite": registerTask("writing.humanizer-rewrite", "writer", "markdown", "manuscript", "selected-only", "explicit-rewrite"),
    "writing.tool-review": registerTask("writing.tool-review", "critic"),
    "writing.tool-summary": registerTask("writing.tool-summary", "utility", "markdown", "none", "selected-only"),
    "writing.quick-draft": registerTask("writing.quick-draft", "writer", "json", "manuscript"),
    "writing.quick-draft-review": registerTask("writing.quick-draft-review", "critic", "json"),
    "tools.sketch-outline": registerTask("tools.sketch-outline", "writer", "markdown", "outline", "selected-only"),
    "tools.image-prompt": registerTask("tools.image-prompt", "utility"),
    "tools.clio-chart": registerTask("tools.clio-chart", "utility"),
    "tools.bureaucracy-captions": registerTask("tools.bureaucracy-captions", "utility", "json"),
    "tools.bureaucracy-captions-markdown": registerTask("tools.bureaucracy-captions-markdown", "utility"),
  });
  const taskContractAliases = Object.freeze({
    "quick-draft": "writing.quick-draft",
    // Quick Draft's Traffic track asks for the same JSON shape as the rest of
    // Quick Draft (title / cover / body / ledger) and only differs in the
    // prompt, so it shares the contract rather than becoming a second one.
    "traffic_rewrite": "writing.quick-draft",
    "generate-first-body": "writing.quick-draft",
    "shorten": "writing.quick-draft",
    "hook": "writing.quick-draft",
    "spoken": "writing.quick-draft",
    "closing": "writing.quick-draft",
    "counter": "writing.quick-draft",
    "boundary": "writing.quick-draft-review",
    "strategy-check": "writing.quick-draft-review",
    "mingming": "writing.quick-draft-review",
    "luoluo": "writing.quick-draft-review",
    "clio-paint-sketch-to-outline": "tools.sketch-outline",
    "clio-paint-sketch-to-image-prompt": "tools.image-prompt",
    "outline_claim": "source.verify-claims",

    "sideask": "chat.sideask",
    "clio-stage": "chat.clio-stage",
    "task-config": "chat.task-config",
    "chat-title": "system.chat-title",
    "writing-demo-preflight": "system.preflight",
    "import-text-repair": "system.import-repair",
    "extract": "system.import-repair",
    "audio-transcript-repair": "source.audio-transcript-repair",
    "dictation-clean": "source.audio-transcript-repair",
    "reader": "source.read",
    "scrapbook": "source.scrapbook",
    "docmap": "source.docmap",
    "docmap-question": "chat.sideask",
    "ocr": "source.vision-ocr",
    "extract-vision-ocr": "source.vision-ocr",
    "extract-vision-writing-context": "source.vision-writing-context",
    "extract-vision-describe": "source.vision-describe",
    "extract-vision-layout": "source.vision-layout",
    "extract-vision-pages": "source.vision-pages",
    "subtitle-translation": "source.subtitle-translation",
    "endfield_rag": "source.endfield-rag",
    "generate-outline": "writing.generate-outline",
    "organize-question-sheet": "writing.organize-question-sheet",
    "expand-outline": "writing.expand-outline",
    "rewrite-outline": "writing.rewrite-outline",
    "review-outline": "writing.outline-review",
    "outline_critique": "writing.outline-review",
    "outline_reduce": "writing.outline-reduce",
    "outline_structure": "writing.outline-structure",
    "draft": "writing.draft",
    "draft-section": "writing.draft",
    "polish-draft": "writing.polish-section",
    "polish-section": "writing.polish-section",
    "suggest-draft": "writing.review-section",
    "review-section": "writing.review-section",
    "critique": "writing.critique",
    "style": "writing.style-review",
    "hkrr": "writing.hkrr-review",
    "docmap-hkrr": "writing.hkrr-review",
    "claim-check": "source.verify-claims",
    "mingming_rewrite": "writing.mingming-rewrite",
    "mingming-handoff-review": "writing.handoff-review",
    "mingming_handoff_card": "writing.handoff-review",
    "mingming_handoff_backstage_review": "writing.handoff-review",
    "rebuild": "writing.rebuild",
    "writing-demo": "writing.demo",
    "writing-demo-rewrite": "writing.tool-rewrite",
    "writing-demo-rag": "writing.demo-rag",
    "collect-vent-outline": "writing.collect-vent-outline",
    "first-day-hands-on": "writing.first-day-hands-on",
    "slides": "writing.slides",
    "marp": "writing.slides",
    "humanizer-repair": "writing.tool-rewrite",
    "image-prompt": "tools.image-prompt",
    "clio-chart": "tools.clio-chart",
    "bureaucracy_meme_caption": "tools.bureaucracy-captions",
    "bureaucracy_meme_caption_markdown": "tools.bureaucracy-captions-markdown",
    "praise": "writing.tool-review",
    "writing-tool-describechange": "writing.tool-rewrite",
    "writing-tool-proofread": "writing.tool-rewrite",
    "writing-tool-rewrite": "writing.tool-rewrite",
    "writing-tool-friendly": "writing.tool-rewrite",
    "writing-tool-professional": "writing.tool-rewrite",
    "writing-tool-concise": "writing.tool-rewrite",
    "writing-tool-transform": "writing.tool-rewrite",
    "writing-tool-praise": "writing.tool-review",
    "writing-tool-reviewpraise": "writing.tool-review",
    "writing-tool-summary": "writing.tool-summary",
    "writing-tool-keypoints": "writing.tool-summary",
    "writing-tool-list": "writing.tool-summary",
    "writing-tool-table": "writing.tool-summary",

    "extract-facts": "source.extract-facts",
    "source-extract-facts": "source.extract-facts",
    "verify-claims": "source.verify-claims",
    "source-verify-claims": "source.verify-claims",
    translate: "source.translate",
    translation: "source.translate",
    "rewrite-selection": "writing.rewrite-selection",
    "humanize-selection": "writing.humanize-selection",
    "humanizer-rewrite": "writing.humanizer-rewrite",
    "json-repair": "system.json-repair",
    "eli5-rewrite": "writing.eli5-rewrite",
    "eli5-review": "writing.eli5-review",
  });
  const modelRoleNames = new Set(["default", "researcher", "writer", "critic", "utility"]);

  // Every registered task contract must declare its model role explicitly.
  // This runs at module load, so adding a contract without a role (or with an
  // invalid one) fails the gate immediately instead of silently defaulting.
  for (const [id, contract] of Object.entries(taskContracts)) {
    if (typeof contract.modelRole !== "string" || !modelRoleNames.has(contract.modelRole)) {
      throw new Error(
        `Task contract "${id}" must declare a valid modelRole (one of: ${[...modelRoleNames].join(", ")}).`
      );
    }
  }
  const taskOutputKinds = new Set(["markdown", "plainText", "json", "patch"]);

  function taskContractId(taskKind = "") {
    const requested = String(taskKind || "chat").trim().toLowerCase() || "chat";
    if (Object.prototype.hasOwnProperty.call(taskContracts, requested)) return requested;
    if (Object.prototype.hasOwnProperty.call(taskContractAliases, requested)) return taskContractAliases[requested];
    const error = new Error(`Task unavailable: ${requested}`);
    Object.assign(error, { code: "task-unavailable", taskKind: requested, status: 400 });
    throw error;
  }

  function taskContractForPayload(payload = {}) {
    /** @type {Record<string, any>} */
    const source = payload && typeof payload === "object" ? payload : {};
    const base = taskContracts[taskContractId(source.ai_system6_task_kind)];
    const explicitKind = taskOutputKinds.has(source.ai_system6_output_kind)
      ? source.ai_system6_output_kind
      : "";
    const structuredKind = source.response_format || source.json_schema || source.ai_system6_output_schema ? "json" : "";
    // A registered machine-readable task cannot be downgraded to prose by a
    // generic caller's Markdown hint. Legacy Markdown parsers keep Markdown
    // unless the caller actually supplies a structured envelope.
    const outputKind = base.output.kind === "json" || base.output.kind === "patch"
      ? base.output.kind
      : explicitKind || (base.output.kind === "markdown" && structuredKind) || base.output.kind;
    const schemaId = String(
      source.ai_system6_output_schema_id
        || source.ai_system6_output_schema?.$id
        || base.output.schemaId
        || ""
    ).trim();
    const output = schemaId && (outputKind === "json" || outputKind === "patch")
      ? { kind: outputKind, schemaId }
      : { kind: outputKind };
    const structuredOverride = outputKind === "json" || outputKind === "patch";
    return Object.freeze({
      ...base,
      output: Object.freeze(output),
      humanizer: structuredOverride ? "off" : base.humanizer,
    });
  }

  const taskContractRegistry = Object.freeze({
    require(taskKind = "chat") {
      return taskContracts[taskContractId(taskKind)];
    },
    forPayload(payload = {}) {
      return taskContractForPayload(payload);
    },
  });

  function systemPromptBody(id, language = "en", projectId = null) {
    const lang = String(language).toLowerCase().startsWith("zh") ? "zh" : "en";
    const browserRuntime = globalThis?.window?.AISystem6PromptFilesRuntime;
    let status = "missing";
    let body = "";
    if (browserRuntime && typeof browserRuntime.resolvePromptFile === "function") {
      const record = browserRuntime.resolvePromptFile(id, projectId, lang);
      status = record?.status || "missing";
      if (status === "ready") body = record.body;
      // The browser is authoritative, including disabled and missing overrides.
      // Never revive a capability with a bundled system prompt after this read.
    } else {
      const record = serverPromptFiles.find((item) => item.id === id);
      body = record?.bodies?.[lang] || "";
      if (String(body).trim()) status = "ready";
    }
    if (status === "ready" && typeof body === "string" && body.trim()) return body;
    const error = new Error(`Prompt unavailable: ${id} (${lang}; ${status})`);
    Object.assign(error, { code: "prompt-unavailable", id, language: lang, promptStatus: status, status: 400 });
    throw error;
  }
  // This is a conservative byte-based estimate, not a model tokenizer. Count
  // the complete final wire structures, including tool schemas and responses.
  // Image/audio/file blocks have provider-specific token costs: include their
  // transport metadata, report the missing modality cost, and never pretend
  // that base64 transport bytes are text tokens.
  function estimateFinalChatPayloadBudget(payload = {}, options = {}) {
    const positive = (value) => {
      const number = Number(value);
      return Number.isSafeInteger(number) && number > 0 ? number : 0;
    };
    const limits = [
      payload.ai_system6_context_limit,
      payload.context_length,
      payload.loaded_context_length,
      options.contextLimit,
    ].map(positive).filter(Boolean);
    const contextLimit = limits.length ? Math.min(...limits) : 0;
    let unknownModalities = 0;
    const budgetContentBlock = (value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (["image_url", "image", "input_image", "input_audio", "audio", "file", "input_file"].includes(value.type)) {
          unknownModalities += 1;
          return { type: value.type, token_cost: "unknown" };
        }
      }
      return value;
    };
    const wireInput = {};
    for (const field of ["messages", "tools", "functions", "tool_choice", "function_call", "response_format", "json_schema"]) {
      if (payload[field] !== undefined) wireInput[field] = payload[field];
    }
    if (Array.isArray(wireInput.messages)) {
      wireInput.messages = wireInput.messages.map((message) => {
        if (!message || typeof message !== "object" || !Array.isArray(message.content)) return message;
        return { ...message, content: message.content.map(budgetContentBlock) };
      });
    }
    const serialized = JSON.stringify(wireInput);
    // TextEncoder is available in browser and Node runtimes and handles
    // non-ASCII text and lone surrogate replacement consistently.
    const inputTokens = new TextEncoder().encode(serialized).length;
    const reservedOutputTokens = Math.max(
      positive(payload.max_tokens),
      positive(payload.max_completion_tokens),
      positive(payload.ai_system6_reserved_output_tokens),
      positive(options.reservedOutputTokens),
    );
    const protocolReserveTokens = Math.max(128, Math.ceil(contextLimit * 0.02));
    const totalTokens = inputTokens + reservedOutputTokens + protocolReserveTokens;
    return Object.freeze({
      status: contextLimit && totalTokens > contextLimit
        ? "exceeded"
        : !contextLimit || unknownModalities || !reservedOutputTokens ? "unknown" : "within-limit",
      contextLimit: contextLimit || null,
      inputTokens,
      reservedOutputTokens,
      protocolReserveTokens,
      totalTokens,
      unknownModalities,
      estimator: "conservative-utf8-bytes-v1",
    });
  }

  function assertFinalChatPayloadBudget(payload = {}, options = {}) {
    const budget = estimateFinalChatPayloadBudget(payload, options);
    // Even with unknown media costs, the conservative estimate for the known
    // text/schema portion can exceed a real limit. Never remove any input.
    if (budget.contextLimit && budget.totalTokens > budget.contextLimit) {
      const error = new Error(`Final chat payload exceeds context budget: ${budget.totalTokens} > ${budget.contextLimit} (${budget.estimator})`);
      Object.assign(error, { code: "context-budget-exceeded", status: 413, budget });
      throw error;
    }
    return budget;
  }

  function cleanModelOutput(text = "") {
    return String(text || "")
      .trim()
      .replace(/^```(?:json|markdown|md|text)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  function parseJsonText(text = "") {
    const clean = cleanModelOutput(text);
    try {
      return JSON.parse(clean);
    } catch {
      const candidates = [
        [clean.indexOf("{"), clean.lastIndexOf("}")],
        [clean.indexOf("["), clean.lastIndexOf("]")],
      ];
      for (const [start, end] of candidates) {
        if (start < 0 || end <= start) continue;
        try {
          return JSON.parse(clean.slice(start, end + 1));
        } catch {}
      }
      return null;
    }
  }

  function buildImportRepairMessages(text, name = "Untitled", projectId = null) {
    return [
      {
        role: "system",
        content: systemPromptBody("other-apps.import-repair", "en", projectId),
      },
      {
        role: "user",
        content: `File: ${String(name || "Untitled")}\n\n${String(text || "")}`,
      },
    ];
  }

  // `detail` is an OpenAI-compatible hint on the image block: "low" makes the
  // cloud model read a 512x512 copy, "original" hands over the picture as
  // sent. A local VLM ignores the field, so the two routes stay equivalent
  // and only the cloud one gets cheaper.
  function buildVisionMessages({ mode = "writing-context", name = "Image", dataUrl = "", detail = "", projectId = null } = {}) {
    const ocr = mode === "ocr";
    const imageUrl = detail ? { url: dataUrl, detail } : { url: dataUrl };
    return [
      {
        role: "system",
        content: systemPromptBody(ocr ? "other-apps.vision-ocr" : "other-apps.vision-writing-context", "en", projectId),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: ocr
              ? `Transcribe all readable text in this image as Markdown. Image name: ${name}`
              : `Describe this image for writing context in concise Markdown. Include visible subject, setting, notable details, readable text, and uncertainty. Image name: ${name}`,
          },
          { type: "image_url", image_url: imageUrl },
        ],
      },
    ];
  }

  function buildSubtitleMessages(blocks = [], mode = "en", projectId = null) {
    const target = mode === "tw" ? "natural Taiwan Traditional Chinese" : "natural English";
    return [
      {
        role: "system",
        content: systemPromptBody("other-apps.subtitle-translation", "en", projectId).replace("{{target}}", target),
      },
      {
        role: "user",
        content: JSON.stringify(blocks.map((block, index) => ({
          item: index + 1,
          text: block.text,
        }))),
      },
    ];
  }

  function buildBureaucracyMessages({ topic = "", tone = "", mood = "", imageDataUrl = "", projectId = null } = {}) {
    /** @type {any[]} */
    const content = [
      {
        type: "text",
        text: [
          `Topic: ${topic}`,
          `Tone: ${tone}`,
          `Mood: ${mood || "dry bureaucratic comedy"}`,
          "Return exactly 6 bilingual captions.",
        ].join("\n"),
      },
    ];
    if (imageDataUrl) content.push({ type: "image_url", image_url: { url: imageDataUrl } });
    return [
      {
        role: "system",
        content: systemPromptBody("other-apps.bureaucracy-captions", "en", projectId),
      },
      { role: "user", content },
    ];
  }

  function buildQuickDraftMessages(payload = {}, { projectId = null } = {}) {
    return [
      {
        role: "system",
        content: systemPromptBody("other-apps.quick-draft", "en", projectId),
      },
      { role: "user", content: JSON.stringify(payload) },
    ];
  }

  function localTaskMaxTokens(taskKind = "chat") {
    const kind = String(taskKind || "chat").toLowerCase();
    if (/mingming/.test(kind)) return 5200;
    if (/sideask|reader|scrapbook|clio-stage|docmap-question/.test(kind)) return 520;
    if (/dictation|speech|transcript/.test(kind)) return 900;
    if (/organize-question-sheet|question-sheet/.test(kind)) return 420;
    if (/generate-outline|dictionary/.test(kind)) return 900;
    if (/writing-demo-rag/.test(kind)) return 260;
    if (/docmap|outline|draft|rebuild|writing_object|hkrr|slides|marp|critique|review|claim/.test(kind)) return 2600;
    if (/bureaucracy|meme|caption/.test(kind)) return 1200;
    return 1600;
  }

  function localChatDefaults(modelName, options = {}) {
    const model = String(modelName || "");
    const taskKind = String(options.taskKind || "chat").toLowerCase();
    const defaults = {
      max_tokens: localTaskMaxTokens(taskKind),
      enable_thinking: false,
      thinking: { type: "disabled" },
      reasoning_effort: "none",
      chat_template_kwargs: { enable_thinking: false },
    };
    if (/gemma[-_/ ]?4/i.test(model)) {
      Object.assign(defaults, {
        temperature: Number.isFinite(options.temperature) ? options.temperature : 1.0,
        top_p: 0.95,
        top_k: 64,
        min_p: 0,
      });
    }
    if (/qwen[-_/ ]?3\.[5-9]|bonsai/i.test(model)) {
      const qwenTemperature = /dictation|speech|transcript/.test(taskKind)
        ? 0.25
        : /draft|rewrite|polish|writing-tool|continue|chat/.test(taskKind)
          ? 0.55
          : /organize-question-sheet|question-sheet|generate-outline|docmap|review|claim|hkrr|dictionary/.test(taskKind)
            ? 0.35
            : 0.6;
      Object.assign(defaults, {
        temperature: Number.isFinite(options.temperature) ? options.temperature : qwenTemperature,
        top_p: 0.8,
        top_k: 20,
        min_p: 0,
        presence_penalty: 1.5,
      });
    }
    return defaults;
  }

  function scrubVisibleModelOutput(text = "") {
    return cleanModelOutput(text)
      .replace(/<\|channel\>thought[\s\S]*?<channel\|>/gi, "")
      .replace(/<\|channel\>(?:final|answer)\s*/gi, "")
      .replace(/<channel\|>/gi, "")
      .trim();
  }

  const humanizerOutputPatterns = Object.freeze([
    /(?:此外|至关重要|深入探讨|不断演变的格局|彰显|赋能|无缝|奠定基础|打下基础|重要的一步|完美闭环)/,
    /(?:智能系统框架|智能系统架构|高级认知|自主学习|决策能力|自我优化|内部反馈机制)/,
    /(?:当然啦|所以啊|那叫一个|天下没有白吃的午餐|缺乏灵魂|生命质感|概率拼接|塑料做的假花)/,
    /\b(?:great question|i hope this helps|let'?s dive in|evolving landscape|plays? a vital role)\b/i,
  ]);

  function shouldRepairHumanizerOutput(taskKind = "") {
    return taskContractRegistry.require(taskKind).humanizer === "explicit-rewrite";
  }

  function findHumanizerOutputHits(text = "") {
    const value = String(text || "");
    return humanizerOutputPatterns
      .filter((pattern) => pattern.test(value))
      .map((pattern) => pattern.source);
  }

  function buildHumanizerRepairMessages(text = "") {
    return [
      {
        role: "system",
        content: [
          "Rewrite the supplied assistant draft once to remove generic AI phrasing.",
          "Preserve facts, citations, Markdown structure, quoted source text, uncertainty, the writer's meaning, and concrete details.",
          "Do not add new claims or commentary. Return only the repaired draft.",
        ].join(" "),
      },
      { role: "user", content: String(text || "") },
    ];
  }

  // The creator-facing names for the nine ELI5 problem types, shared by the
  // chat report and the inline finding rows.
  function eli5ReviewLabels(language = "zh") {
    const zh = String(language || "").toLowerCase().startsWith("zh");
    return zh
      ? {
          "missing-step": "少了一步",
          "undefined-term": "词没解释",
          "abstract-wording": "太抽象",
          "ambiguous-reference": "指代不清",
          "number-context": "数字缺上下文",
          "analogy-risk": "类比可能误导",
          "visual-dependence": "太依赖画面",
          "fact-boundary": "事实边界太满",
          pace: "节奏",
        }
      : {
          "missing-step": "Missing step",
          "undefined-term": "Undefined term",
          "abstract-wording": "Abstract wording",
          "ambiguous-reference": "Ambiguous reference",
          "number-context": "Number lacks context",
          "analogy-risk": "Analogy risk",
          "visual-dependence": "Visual dependence",
          "fact-boundary": "Fact boundary too absolute",
          pace: "Pace",
        };
  }

  /**
   * @param {{
   *   verdict?: string,
   *   premiseStatus?: string,
   *   question?: string,
   *   findings?: Array<{
   *     type?: string,
   *     quote?: string,
   *     whyViewerGetsLost?: string,
   *     minimumChange?: string,
   *   }>,
   *   keep?: string[],
   * }} data
   * @param {string} [language]
   */
  function eli5ReviewMarkdown(data = {}, language = "zh") {
    const zh = String(language || "").toLowerCase().startsWith("zh");
    const source = data && typeof data === "object" ? data : {};
    const typeLabels = eli5ReviewLabels(language);
    const premiseLabels = zh
      ? { sound: "前提成立", needs_correction: "前提需要纠正", uncertain: "前提不确定" }
      : { sound: "Premise sound", needs_correction: "Premise needs correction", uncertain: "Premise uncertain" };
    const verdictLabels = zh
      ? { clear: "已经清楚", needs_revision: "需要修改" }
      : { clear: "Clear", needs_revision: "Needs revision" };
    const cell = (value) => String(value || "")
      .replace(/\|/g, "\\|")
      .replace(/\r?\n/g, " ")
      .trim();

    const lines = [];
    const verdict = String(source.verdict || "");
    if (verdictLabels[verdict]) {
      lines.push(`**${zh ? "结论" : "Verdict"}：${verdictLabels[verdict]}**`);
    }
    const premise = String(source.premiseStatus || "");
    if (premiseLabels[premise]) {
      lines.push(`${zh ? "前提" : "Premise"}：${premiseLabels[premise]}`);
    }
    if (String(source.question || "").trim()) {
      lines.push(`${zh ? "真正的问题" : "The real question"}：${cell(source.question)}`);
    }

    const findings = Array.isArray(source.findings) ? source.findings.slice(0, 6) : [];
    lines.push("");
    lines.push(
      zh
        ? "| 原句 | 问题 | 观众为什么会听丢 | 最小修改 |"
        : "| Quote | Problem | Why the viewer gets lost | Minimal change |"
    );
    lines.push("| --- | --- | --- | --- |");
    for (const finding of findings) {
      if (!finding || typeof finding !== "object") continue;
      const type = typeLabels[String(finding.type || "")] || cell(finding.type);
      lines.push(
        `| ${cell(finding.quote)} | ${cell(type)} | ${cell(finding.whyViewerGetsLost)} | ${cell(finding.minimumChange)} |`
      );
    }

    const keep = (Array.isArray(source.keep) ? source.keep : []).slice(0, 3).filter((item) => String(item || "").trim());
    if (keep.length) {
      lines.push("");
      lines.push(zh ? "**这几处已经讲明白**" : "**Already explained well**");
      keep.forEach((item) => lines.push(`- ${cell(item)}`));
    }

    return lines.join("\n").trim();
  }

  return Object.freeze({
    systemPromptBody,
    estimateFinalChatPayloadBudget,
    assertFinalChatPayloadBudget,
    cleanModelOutput,
    parseJsonText,
    buildImportRepairMessages,
    buildVisionMessages,
    buildSubtitleMessages,
    buildBureaucracyMessages,
    buildQuickDraftMessages,
    taskContractForPayload,
    taskContractRegistry,
    localTaskMaxTokens,
    localChatDefaults,
    scrubVisibleModelOutput,
    shouldRepairHumanizerOutput,
    findHumanizerOutputHits,
    buildHumanizerRepairMessages,
    eli5ReviewLabels,
    eli5ReviewMarkdown,
  });
});
