// Pure model-task contracts shared by the browser and the Node server.
// This file intentionally has no DOM, browser-storage, network, or Node runtime dependency.

(function exposeModelTaskRuntime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISystem6ModelTaskRuntime = api;
})(typeof globalThis !== "undefined" ? (/** @type {any} */ (globalThis)).window || null : null, () => {
  const serverPromptFiles = typeof require === "function"
    ? (() => { try { return require("../generated/ai-prompt-files.json"); } catch { return []; } })()
    : [];

  function systemPromptBody(id, language = "en") {
    const browserRecord = globalThis?.window?.AISystem6PromptFilesRuntime?.resolvePromptFile(id, null, language);
    if (browserRecord?.status === "ready") return browserRecord.body;
    const record = serverPromptFiles.find((item) => item.id === id);
    return record?.bodies?.[String(language).startsWith("zh") ? "zh" : "en"] || record?.body || "";
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

  function buildImportRepairMessages(text, name = "Untitled") {
    return [
      {
        role: "system",
        content: systemPromptBody("other-apps.import-repair", "en"),
      },
      {
        role: "user",
        content: `File: ${String(name || "Untitled")}\n\n${String(text || "")}`,
      },
    ];
  }

  function buildVisionMessages({ mode = "writing-context", name = "Image", dataUrl = "" } = {}) {
    const ocr = mode === "ocr";
    return [
      {
        role: "system",
        content: systemPromptBody(ocr ? "other-apps.vision-ocr" : "other-apps.vision-writing-context", "en"),
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
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ];
  }

  function buildSubtitleMessages(blocks = [], mode = "en") {
    const target = mode === "tw" ? "natural Taiwan Traditional Chinese" : "natural English";
    return [
      {
        role: "system",
        content: systemPromptBody("other-apps.subtitle-translation", "en").replace("{{target}}", target),
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

  function buildEndfieldMessages(query, evidence) {
    return [
      {
        role: "system",
        content: systemPromptBody("other-apps.endfield-lore", "zh"),
      },
      {
        role: "user",
        content: `用户问题：${String(query || "")}\n\n【剧情证据】\n${String(evidence || "")}`,
      },
    ];
  }

  function buildBureaucracyMessages({ topic = "", tone = "", mood = "", imageDataUrl = "" } = {}) {
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
        content: systemPromptBody("other-apps.bureaucracy-captions", "en"),
      },
      { role: "user", content },
    ];
  }

  function buildQuickDraftMessages(payload = {}) {
    return [
      {
        role: "system",
        content: systemPromptBody("other-apps.quick-draft", "en"),
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
    if (/qwen(?:[-_/ ]?3\.[56]|3\.[56])/i.test(model)) {
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
    const kind = String(taskKind || "chat").toLowerCase();
    if (/(?:translate|translation|dictionary|claim|fact|evidence|extract|ocr|reader|search|docmap|review|humanizer-repair)/.test(kind)) return false;
    return /(?:chat|draft|rewrite|polish|continue|outline|summary|bureaucracy|meme|caption)/.test(kind);
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

  return Object.freeze({
    cleanModelOutput,
    parseJsonText,
    buildImportRepairMessages,
    buildVisionMessages,
    buildSubtitleMessages,
    buildEndfieldMessages,
    buildBureaucracyMessages,
    buildQuickDraftMessages,
    localTaskMaxTokens,
    localChatDefaults,
    scrubVisibleModelOutput,
    shouldRepairHumanizerOutput,
    findHumanizerOutputHits,
    buildHumanizerRepairMessages,
  });
});
