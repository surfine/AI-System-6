// Bureaucracy meme caption generator backing /api/bureaucracy/captions.
//
// Lifts the full pipeline from root server.js:
//   - tone / topic normalization
//   - template registry lookup (apps/desktop/data/bureaucracy-templates.json)
//   - banned-term filter (real-show references)
//   - markdown-table / markdown-list caption parser
//   - validator with dedup + length limits
//   - model-payload builder
//   - cloud-or-local model routing (postBureaucracyChatPayload)

"use strict";

const path = require("node:path");

const { desktopRoot } = require("./lib/build-info.js");
const { postJsonWithFallback } = require("./lib/fetch.js");
const { getLocalUrls } = require("./lib/local-urls.js");
const {
  DEEPSEEK_API_KEY_DEFAULT,
  DEEPSEEK_BASE_URL_DEFAULT,
  resolveCloudTarget,
} = require("./cloud.js");
const { preparePublicCloudCall } = require("./lib/cloud-route.js");
const { isPublicDeployment } = require("./runtime-profile.js");
const { tuneLmStudioChatPayload } = require("./chat.js");
const { humanizerModelInstruction } = require("./humanizer.js");
const {
  getLoadedLmStudioModelInfo,
  postLocalChatWithModelAutoload,
} = require("./lmstudio.js");
const { resolveCloudCredential } = require("./credential-vault.js");

/**
 * Permitted tone values for the caption generator. Mirrors
 * `bureaucracyTones` from root server.js exactly.
 *
 * @type {readonly string[]}
 */
const bureaucracyTones = Object.freeze([
  "senior_civil_servant",
  "confused_minister",
  "literal_assistant",
  "mixed",
]);

/**
 * Tone → archetype mapping. Mirrors `bureaucracyArchetypes` from root.
 *
 * @type {Readonly<Record<string, string>>}
 */
const bureaucracyArchetypes = Object.freeze({
  senior_civil_servant: "senior_civil_servant",
  confused_minister: "confused_minister",
  literal_assistant: "literal_assistant",
  mixed: "senior_civil_servant",
});

/**
 * Banned reference list. Captions containing any of these strings are
 * rejected by hasBannedBureaucracyTerm. Mirrors
 * `bureaucracyBannedTerms` from root.
 */
const bureaucracyBannedTerms = [
  "Yes Minister",
  "Yes Prime Minister",
  "Sir Humphrey",
  "Jim Hacker",
  "Bernard Woolley",
  "Humphrey",
  "Hacker",
  "Bernard",
  "是，大臣",
  "是，首相",
  "汉弗莱",
  "哈克",
  "伯纳德",
];

/**
 * Template registry, loaded once at startup from
 * apps/desktop/data/bureaucracy-templates.json. A missing file
 * is treated as an empty registry (matches root behavior).
 *
 * @type {Array<{ id: string, mood?: string, sceneDescription?: string }>}
 */
let bureaucracyTemplates = [];
try {
  bureaucracyTemplates = require(path.join(desktopRoot, "data", "bureaucracy-templates.json"));
} catch {
  bureaucracyTemplates = [];
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeBureaucracyTone(value) {
  return bureaucracyTones.includes(/** @type {string} */ (value)) ? /** @type {string} */ (value) : "mixed";
}

/**
 * @param {unknown} templateId
 * @returns {{ id: string, mood?: string, sceneDescription?: string }}
 */
function bureaucracyTemplateById(templateId) {
  return bureaucracyTemplates.find((template) => template.id === templateId)
    || bureaucracyTemplates[0]
    || {
      id: "default",
      mood: "dry British bureaucratic satire",
      sceneDescription: "An original fictional bureaucratic comedy scene with no real TV show, actor, or character.",
    };
}

/**
 * Trim and strip trailing punctuation noise from a topic string.
 *
 * @param {unknown} topic
 * @returns {string}
 */
function normalizeBureaucracyTopic(topic) {
  return String(topic || "")
    .trim()
    .replace(/[。！？!?,，、；;：:]+$/u, "")
    .replace(/\s+/g, " ");
}

/**
 * True when any of the banned reference terms appears in the
 * candidate's zh / en / archetype fields (case-insensitive substring).
 *
 * @param {{ zh?: string, en?: string, archetype?: string }} candidate
 * @returns {boolean}
 */
function hasBannedBureaucracyTerm(candidate) {
  const text = `${candidate.zh || ""}\n${candidate.en || ""}\n${candidate.archetype || ""}`;
  return bureaucracyBannedTerms.some((term) =>
    new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)
  );
}

/**
 * @typedef {Object} BureaucracyCaption
 * @property {string} id
 * @property {string} zh
 * @property {string} en
 * @property {string} archetype
 * @property {string} tone
 */

/**
 * Validate, dedupe, and normalize a parsed caption list. Caps at 6.
 *
 * @param {unknown[]} rawCaptions
 * @param {string} requestedTone
 * @returns {BureaucracyCaption[]}
 */
function validateBureaucracyCaptions(rawCaptions, requestedTone) {
  const captions = Array.isArray(rawCaptions) ? rawCaptions : [];
  const seen = new Set();
  /** @type {BureaucracyCaption[]} */
  const output = [];

  for (const item of captions) {
    if (!item || typeof item !== "object") continue;
    const anyItem = /** @type {any} */ (item);
    const zh = typeof anyItem.zh === "string" ? anyItem.zh.trim() : "";
    const en = typeof anyItem.en === "string" ? anyItem.en.trim() : "";
    if (!zh || !en) continue;
    if (/^:?-{2,}:?$/.test(zh) || /^:?-{2,}:?$/.test(en)) continue;
    if (zh.length > 44 || en.length > 130) continue;
    const tone = normalizeBureaucracyTone(anyItem.tone || requestedTone);
    const archetype = bureaucracyArchetypes[anyItem.archetype] || bureaucracyArchetypes[tone] || "senior_civil_servant";
    const candidate = { id: `llm-${output.length + 1}`, zh, en, archetype, tone };
    const key = `${candidate.zh}\n${candidate.en}`.toLowerCase();
    if (seen.has(key) || hasBannedBureaucracyTerm(candidate)) continue;
    seen.add(key);
    output.push(candidate);
    if (output.length >= 6) break;
  }

  return output;
}

/**
 * Strip surrounding quotes and a small set of inline-markdown markers
 * from a single line. Mirrors `stripMarkdownInline`.
 *
 * @param {string} [value]
 * @returns {string}
 */
function stripMarkdownInline(value = "") {
  return String(value || "")
    .trim()
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/**
 * Parse a markdown response from the model into caption candidates.
 * Tries a pipe table first; falls back to a bulleted-list shape.
 * Mirrors `parseBureaucracyMarkdownCaptions`.
 *
 * @param {string} markdown
 * @param {string} requestedTone
 * @returns {Array<{ zh: string, en: string, archetype: string, tone: string }>}
 */
function parseBureaucracyMarkdownCaptions(markdown, requestedTone) {
  const text = String(markdown || "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .trim();
  /** @type {Array<{ zh: string, en: string, archetype: string, tone: string }>} */
  const captions = [];
  /**
   * @param {{ zh?: string, en?: string, archetype?: string, tone?: string }} item
   */
  const pushCaption = (item) => {
    const zh = stripMarkdownInline(item.zh);
    const en = stripMarkdownInline(item.en);
    if (!zh || !en) return;
    captions.push({
      zh,
      en,
      archetype: stripMarkdownInline(item.archetype) || bureaucracyArchetypes[requestedTone] || "senior_civil_servant",
      tone: normalizeBureaucracyTone(stripMarkdownInline(item.tone) || requestedTone),
    });
  };

  text.split(/\n+/).forEach((line) => {
    const raw = line.trim();
    if (!raw || !raw.includes("|")) return;
    if (/^\|?\s*:?-{2,}:?\s*\|/.test(raw)) return;
    if (/zh|中文|english|英文|archetype|tone/i.test(raw) && /(^|\|)\s*(zh|中文)\s*(\||$)/i.test(raw)) return;
    const cells = raw
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 2) return;
    const offset = /^\d+\.?$/.test(cells[0]) ? 1 : 0;
    pushCaption({
      zh: cells[offset],
      en: cells[offset + 1],
      archetype: cells[offset + 2],
      tone: cells[offset + 3],
    });
  });

  if (captions.length) return captions;

  const blocks = text
    .split(/\n(?=\s*(?:[-*]|\d+[.)])\s+)/)
    .map((block) => block.trim())
    .filter(Boolean);
  blocks.forEach((block) => {
    const clean = block.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "");
    const zh = clean.match(/(?:^|\n)\s*(?:zh|中文|中)\s*[:：]\s*([^\n]+)/i)?.[1];
    const en = clean.match(/(?:^|\n)\s*(?:en|英文|英)\s*[:：]\s*([^\n]+)/i)?.[1];
    const archetype = clean.match(/(?:^|\n)\s*archetype\s*[:：]\s*([^\n]+)/i)?.[1];
    const tone = clean.match(/(?:^|\n)\s*tone\s*[:：]\s*([^\n]+)/i)?.[1];
    if (zh || en) {
      pushCaption({ zh, en, archetype, tone });
      return;
    }
    const parts = clean.split(/\s+[—-]\s+|\s+\/\s+|｜/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) pushCaption({ zh: parts[0], en: parts[1], archetype: parts[2], tone: parts[3] });
  });

  return captions;
}

/**
 * Build the messages payload for the caption-generation request. When an
 * `imageDataUrl` (a `data:image/...;base64,...` string) is supplied, the user
 * message becomes a multimodal content array so a vision-capable model can read
 * the meme image and tailor the captions to what is actually shown.
 *
 * @param {{ topic: string, tone: string, template: { mood?: string }, imageDataUrl?: string }} input
 * @returns {Array<{ role: string, content: string | Array<object> }>}
 */
function buildBureaucracyCaptionMessages({ topic, tone, template, imageDataUrl }) {
  const system = [
    "Return Markdown only.",
    humanizerModelInstruction("bureaucracy_meme_caption_markdown"),
    "生成 6 条中英双语的英式官僚冷幽默梗图文案，只输出一个 Markdown 表格，不要解释、标题或段落。",
    "避免真实剧集、演员、角色和台词引用。",
    "Banned words: Yes Minister, Yes Prime Minister, Sir Humphrey, Jim Hacker, Bernard Woolley, Humphrey, Hacker, Bernard, 是，大臣, 是，首相, 汉弗莱, 哈克, 伯纳德.",
    "中文文案 12 到 28 字，像中文互联网梗图文案，不要翻译腔；英文文案短，适合字幕。",
    "Table columns: zh | en | archetype | tone.",
    "Exactly 6 body rows. Each row is one caption; table cells must contain short field values only. No <br>, no nested labels, no multi-paragraph cells.",
    "Do not put bold labels such as 标题、画面描述、文案、Title, Visual Description, or Caption inside cells.",
  ].join(" ");

  const userLines = [
    `Topic: ${topic}`,
    `Tone: ${tone}`,
    `Mood: ${template.mood || "dry bureaucratic comedy"}`,
  ];
  if (imageDataUrl) {
    userLines.push("看一下附带的图片：让文案贴合画面里真实出现的人物、表情、场景和细节，不要凭空编造画面里没有的东西。");
  }
  const user = userLines.join("\n");

  if (imageDataUrl) {
    return [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ];
  }

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Send the caption payload to whichever model route is available:
 * prefer the cloud route when the client has provided / configured a
 * key AND either explicitly chose cloud or did not configure a local
 * model. Otherwise route through the local LM Studio / Ollama autoload.
 * Mirrors `postBureaucracyChatPayload` from root server.js.
 *
 * @param {any} payload
 * @param {any} route
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<{
 *   response: any,
 *   source: string,
 *   autoLoaded?: boolean,
 *   autoLoadedModel?: string,
 *   autoSelectedModel?: string,
 *   reservation?: { inputTokens: number, outputTokens: number, reservedTokens: number, remainingSessionRequests: number, addUsage: (usage: any) => boolean, markUpstreamStarted: () => void, settle: (options?: any) => any } | null,
 * }>}
 */
async function postBureaucracyChatPayload(payload, route, signal, req) {
  const cloudRoute = route?.cloud || {};
  const localRoute = route?.local || {};

  if (isPublicDeployment) {
    const cloud = await preparePublicCloudCall({
      credentialId: cloudRoute.credentialId || cloudRoute.credential_id,
      suppliedApiKey: cloudRoute.apiKey || cloudRoute.api_key,
      requestedBaseUrl: cloudRoute.baseUrl,
      model: String(cloudRoute.model || payload.model || "deepseek-v4-flash"),
      payload,
      req,
    });
    if (/^(?:deepseek-)?v4-(?:pro|flash)$/i.test(cloud.model)) {
      // Same v4 hidden-reasoning fix as the non-public path below.
      cloud.payload.thinking = { type: "disabled" };
      delete cloud.payload.temperature;
      delete cloud.payload.top_p;
      delete cloud.payload.presence_penalty;
      delete cloud.payload.frequency_penalty;
      delete cloud.payload.logprobs;
      delete cloud.payload.top_logprobs;
    }
    const { response } = await postJsonWithFallback(
      `${cloud.baseUrl}/v1/chat/completions`,
      cloud.payload,
      signal,
      cloud.authHeaders,
      {
        pinnedAddress: cloud.pinnedAddress,
        pinnedFamily: cloud.pinnedFamily,
        onRequest: () => cloud.reservation?.markUpstreamStarted(),
      }
    );
    return { response, source: "cloud", reservation: cloud.reservation };
  }

  const cloudTarget = await resolveCloudTarget(cloudRoute.baseUrl || DEEPSEEK_BASE_URL_DEFAULT);
  const cloudApiKey = String(await resolveCloudCredential({
    credentialId: cloudRoute.credentialId || cloudRoute.credential_id,
    provider: "deepseek",
    targetBaseUrl: cloudTarget.baseUrl,
    suppliedApiKey: cloudRoute.apiKey || cloudRoute.api_key || DEEPSEEK_API_KEY_DEFAULT,
    allowSupplied: false,
  })).trim();
  const canUseCloud = !!(cloudApiKey && (cloudRoute.active || (!localRoute.model && !localRoute.provider)));

  if (canUseCloud) {
    const model = String(cloudRoute.model || "deepseek-v4-flash").trim();
    const baseUrl = cloudTarget.baseUrl;
    const cloudPayload = { ...payload, model };
    if (/^(?:deepseek-)?v4-(?:pro|flash)$/i.test(model)) {
      // v4 defaults to hidden reasoning, which consumes the output budget and
      // returns empty content for caption generation. Force it off, matching
      // endfield.js and the cloud-chat route.
      cloudPayload.thinking = { type: "disabled" };
      delete cloudPayload.temperature;
      delete cloudPayload.top_p;
      delete cloudPayload.presence_penalty;
      delete cloudPayload.frequency_penalty;
      delete cloudPayload.logprobs;
      delete cloudPayload.top_logprobs;
    }
    const { response } = await postJsonWithFallback(`${baseUrl}/v1/chat/completions`, cloudPayload, signal, {
      Authorization: `Bearer ${cloudApiKey}`,
    }, {
      pinnedAddress: cloudTarget.address,
      pinnedFamily: cloudTarget.family,
    });
    return { response, source: "cloud" };
  }

  const provider = String(localRoute.provider || "lm-studio").trim();
  const endpoint = String(localRoute.endpoint || "").trim();
  const model = String(localRoute.model || getLoadedLmStudioModelInfo()?.model || "local-model").trim();
  const localPayload = tuneLmStudioChatPayload({ ...payload, model });
  const { chatUrl } = getLocalUrls(provider, endpoint);
  const { response, autoLoaded, autoLoadedModel, autoSelectedModel } = await postLocalChatWithModelAutoload({
    chatUrl,
    payload: localPayload,
    provider,
    model,
    signal,
  });
  return { response, source: provider || "local", autoLoaded, autoLoadedModel, autoSelectedModel };
}

module.exports = {
  bureaucracyTones,
  bureaucracyArchetypes,
  bureaucracyBannedTerms,
  normalizeBureaucracyTone,
  bureaucracyTemplateById,
  normalizeBureaucracyTopic,
  hasBannedBureaucracyTerm,
  validateBureaucracyCaptions,
  stripMarkdownInline,
  parseBureaucracyMarkdownCaptions,
  buildBureaucracyCaptionMessages,
  postBureaucracyChatPayload,
};
