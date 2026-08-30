// Image attachments — one picture object, shared by every surface.
//
// TeachText's Picture Album invented this record first and kept it inside the
// project record. Six surfaces now need the same thing, and base64 on every
// project and scrap would swell the records that must stay quick to load. So
// the picture lives in its own IndexedDB store ("imageAttachments", DB v5),
// keyed by id and indexed by projectId, and each surface refers to it.
//
// The rule that keeps this honest: this module hands a picture to a model and
// returns what came back. It never writes the result anywhere. AI output is
// temporary until the writer saves, clips, or inserts it, so the caller owns
// that decision.

const IMAGE_ATTACHMENT_ACCEPT = "image/*,.bmp,.jpg,.jpeg,.png,.webp,.heic,.heif";
const IMAGE_ATTACHMENT_NAME_PATTERN = /\.(bmp|jpe?g|png|webp|heic|heif)$/i;
const IMAGE_ATTACHMENT_DEFAULT_LIMIT = 48;
const IMAGE_ATTACHMENT_MODEL_LIMIT = 4;
const CLIO_IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp";
const CLIO_IMAGE_MAX_PIXELS = 640000;
const CLIO_IMAGE_LOW_MAX_PIXELS = 512 * 512;
const CLIO_IMAGE_MAX_EDGE = 8192;
const CLIO_IMAGE_LOW_MAX_EDGE = 512;
const CLIO_IMAGE_MAX_INLINE_BYTES = 512 * 1024;
const CLIO_IMAGE_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const CLIO_IMAGE_MAX_REQUEST_BYTES = 200 * 1024 * 1024;
const CLIO_IMAGE_CHAT_CHAR_BUDGET = 12 * 1024 * 1024;
const CLIO_IMAGE_PROJECT_CHAR_BUDGET = 48 * 1024 * 1024;

/**
 * @param {ArrayLike<File> | null | undefined} files
 * @returns {File[]}
 */
function imageFilesFromList(files) {
  return [...(files || [])].filter((file) => /^image\//i.test(file?.type || "")
    || IMAGE_ATTACHMENT_NAME_PATTERN.test(file?.name || ""));
}

/**
 * @param {any[]} [attachments]
 * @param {number} [limit]
 * @returns {any[]}
 */
function normalizeImageAttachments(attachments = [], limit = IMAGE_ATTACHMENT_DEFAULT_LIMIT) {
  return Array.isArray(attachments)
    ? attachments
        .filter((item) => item && item.id)
        .slice(0, limit)
        .map((item) => ({ ...item }))
    : [];
}

function readImageAttachmentFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image."));
    image.src = dataUrl;
  });
}

function clioInlineDataUrlParts(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const encoded = match[2].replace(/\s+/g, "");
  if (!encoded || encoded.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    return null;
  }
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return {
    mimeType: match[1].toLowerCase(),
    encoded,
    decodedBytes: Math.max(0, Math.floor((encoded.length * 3) / 4) - padding),
  };
}

function imageDataUrlDecodedBytes(dataUrl = "") {
  return clioInlineDataUrlParts(dataUrl)?.decodedBytes || 0;
}

function clioInlineDataUrlMimeType(dataUrl = "") {
  const parts = clioInlineDataUrlParts(dataUrl);
  if (!parts) return "";
  let sample;
  try {
    const decoded = atob(parts.encoded.slice(0, 24));
    sample = Uint8Array.from(decoded, character => character.charCodeAt(0));
  } catch {
    return "";
  }
  const jpeg = sample.length >= 3 && sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff;
  const png = sample.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((byte, index) => sample[index] === byte);
  const prefix = new TextDecoder("latin1").decode(sample);
  const gif = prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a");
  const webp = prefix.slice(0, 4) === "RIFF" && prefix.slice(8, 12) === "WEBP";
  const detected = jpeg ? "image/jpeg" : png ? "image/png" : gif ? "image/gif" : webp ? "image/webp" : "";
  return detected === parts.mimeType ? detected : "";
}

function imageDataUrlToBlob(dataUrl = "") {
  const value = String(dataUrl || "");
  const match = value.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) return null;
  const bytes = atob(match[2]);
  const data = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) data[index] = bytes.charCodeAt(index);
  return new Blob([data], { type: match[1] || "image/jpeg" });
}

function throwIfClioImageAborted(signal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function yieldForClioImageWork(signal) {
  throwIfClioImageAborted(signal);
  if (typeof globalThis.scheduler?.yield === "function") {
    await globalThis.scheduler.yield();
  } else if (typeof requestAnimationFrame === "function" && !document.hidden) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throwIfClioImageAborted(signal);
}

async function loadClioImageDrawable(file, signal) {
  throwIfClioImageAborted(signal);
  if (typeof createImageBitmap === "function") {
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file);
      throwIfClioImageAborted(signal);
      return {
        drawable: bitmap,
        width: Math.max(1, bitmap.width || 1),
        height: Math.max(1, bitmap.height || 1),
        release: () => bitmap.close?.(),
      };
    } catch (error) {
      bitmap?.close?.();
      if (error?.name === "AbortError") throw error;
    }
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromDataUrl(sourceUrl);
    throwIfClioImageAborted(signal);
    return {
      drawable: image,
      width: Math.max(1, image.naturalWidth || image.width || 1),
      height: Math.max(1, image.naturalHeight || image.height || 1),
      release() {
        image.src = "";
        URL.revokeObjectURL(sourceUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  }
}

function createClioImageCanvas(width, height) {
  const canvas = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(width, height)
    : document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function encodeClioCanvasJpeg(canvas, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  if (typeof canvas.toBlob === "function") {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("clio_image_encode_failed"));
      }, "image/jpeg", quality);
    });
  }
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const blob = imageDataUrlToBlob(dataUrl);
  if (!blob) throw new Error("clio_image_encode_failed");
  return blob;
}

async function clioImageFileLooksAnimated(file) {
  const type = clioVisionFileType(file);
  if (!/image\/(?:gif|webp)/.test(type)) return false;
  // Preserve every GIF through Files API. Reliably distinguishing a static
  // GIF requires parsing its variable-length sub-block stream; a byte scan can
  // mistake compressed pixels for an image separator and is worse than the
  // small extra upload. WebP declares animation near the container header.
  if (type === "image/gif") return true;
  try {
    const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes);
    return text.includes("ANIM") || text.includes("ANMF");
  } catch {
    return false;
  }
}

function clioVisionFileType(file) {
  const declared = String(file?.type || "").toLowerCase().split(";", 1)[0].trim();
  if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(declared)) return declared;
  const name = String(file?.name || "").toLowerCase();
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  if (/\.png$/.test(name)) return "image/png";
  if (/\.gif$/.test(name)) return "image/gif";
  if (/\.webp$/.test(name)) return "image/webp";
  return "";
}

function clioVisionImageFilesFromList(files) {
  return [...(files || [])]
    .map((file) => ({ file, type: clioVisionFileType(file) }))
    .filter((entry) => entry.type);
}

function currentModelSupportsImageInputs() {
  if (typeof cloudConfig !== "undefined" && cloudConfig?.active) {
    return cloudConfig.provider === "deepseek";
  }
  if (typeof window.AISystem6LocalLMStudio?.models !== "function") return true;
  const modelName = typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : "";
  const current = window.AISystem6LocalLMStudio.models()
    .find((model) => model.id === modelName || model.name === modelName);
  return !current || current.vision !== false;
}

/**
 * Produce the one bounded inline copy ClioTalk is allowed to persist. The
 * source File is decoded from an object URL, never promoted to a full-size
 * base64 string. Animated GIF/WebP inputs deliberately become their first
 * rendered frame here; the Files path keeps the original animation instead.
 */
async function prepareClioImageInline(file, options = {}) {
  const maxPixels = options.detail === "low" ? CLIO_IMAGE_LOW_MAX_PIXELS : CLIO_IMAGE_MAX_PIXELS;
  const maxEdge = options.detail === "low" ? CLIO_IMAGE_LOW_MAX_EDGE : CLIO_IMAGE_MAX_EDGE;
  const signal = options.signal || null;
  const animationPromise = clioImageFileLooksAnimated(file);
  const source = await loadClioImageDrawable(file, signal);
  let canvas = null;
  try {
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const sourcePixels = sourceWidth * sourceHeight;
    let scale = Math.min(
      1,
      Math.sqrt(maxPixels / Math.max(1, sourcePixels)),
      maxEdge / Math.max(sourceWidth, sourceHeight)
    );
    let width = Math.max(1, Math.floor(sourceWidth * scale));
    let height = Math.max(1, Math.floor(sourceHeight * scale));
    canvas = createClioImageCanvas(width, height);
    const qualities = [0.82, 0.64, 0.46];
    let inlineBlob = null;

    for (let pass = 0; pass < 6; pass += 1) {
      await yieldForClioImageWork(signal);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("clio_image_canvas_unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(source.drawable, 0, 0, width, height);
      for (const quality of qualities) {
        throwIfClioImageAborted(signal);
        inlineBlob = await encodeClioCanvasJpeg(canvas, quality);
        if (inlineBlob.size <= CLIO_IMAGE_MAX_INLINE_BYTES) break;
      }
      if (inlineBlob?.size <= CLIO_IMAGE_MAX_INLINE_BYTES) break;
      const sizeRatio = Math.sqrt(CLIO_IMAGE_MAX_INLINE_BYTES / Math.max(1, inlineBlob?.size || 1));
      scale *= Math.max(0.5, Math.min(0.82, sizeRatio * 0.94));
      width = Math.max(1, Math.floor(sourceWidth * scale));
      height = Math.max(1, Math.floor(sourceHeight * scale));
    }

    if (!inlineBlob || inlineBlob.size > CLIO_IMAGE_MAX_INLINE_BYTES) {
      throw new Error("clio_image_inline_too_large");
    }
    throwIfClioImageAborted(signal);
    const inlineDataUrl = await readImageAttachmentFile(inlineBlob);
    return {
      inlineDataUrl,
      inlineBlob,
      decodedBytes: inlineBlob.size,
      width,
      height,
      sourceWidth,
      sourceHeight,
      animated: await animationPromise,
    };
  } finally {
    source.release();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

async function compressImageAttachmentDataUrl(dataUrl, maxEdge = 960) {
  const image = await loadImageFromDataUrl(dataUrl);
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const previewWidth = Math.max(1, Math.round(width * scale));
  const previewHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = previewWidth;
  canvas.height = previewHeight;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, previewWidth, previewHeight);
  context.drawImage(image, 0, 0, previewWidth, previewHeight);
  const previewDataUrl = canvas.toDataURL("image/jpeg", 0.72);
  return {
    previewDataUrl,
    width,
    height,
    previewWidth,
    previewHeight,
    previewSize: Math.ceil((previewDataUrl.length * 3) / 4),
  };
}

/**
 * Build attachment records from picked or dropped files. Returns the records;
 * storing them is `saveImageAttachments`, so a caller can preview first.
 *
 * @param {ArrayLike<File>} files
 * @param {{ projectId: string, surface?: string, limit?: number, maxEdge?: number }} options
 * @returns {Promise<any[]>}
 */
async function buildImageAttachments(files, options = {}) {
  const incoming = imageFilesFromList(files);
  const limit = Number.isFinite(options.limit) ? Number(options.limit) : IMAGE_ATTACHMENT_DEFAULT_LIMIT;
  const selected = incoming.slice(0, Math.max(0, limit));
  const now = new Date().toISOString();
  const built = [];

  for (const file of selected) {
    const originalDataUrl = await readImageAttachmentFile(file);
    let compressed;
    try {
      compressed = await compressImageAttachmentDataUrl(originalDataUrl, options.maxEdge || 960);
    } catch {
      compressed = {
        previewDataUrl: originalDataUrl,
        width: 0,
        height: 0,
        previewWidth: 0,
        previewHeight: 0,
        previewSize: Math.ceil((originalDataUrl.length * 3) / 4),
      };
    }
    const label = file.name || (typeof t === "function" ? t("image_attachment") : "Image");
    built.push({
      id: crypto.randomUUID(),
      projectId: String(options.projectId || ""),
      surface: String(options.surface || "teachtext"),
      name: label,
      alt: label.replace(/\.[^.]+$/, ""),
      type: file.type || "image/*",
      size: file.size || 0,
      originalDataUrl,
      previewDataUrl: compressed.previewDataUrl,
      width: compressed.width,
      height: compressed.height,
      previewWidth: compressed.previewWidth,
      previewHeight: compressed.previewHeight,
      previewSize: compressed.previewSize,
      createdAt: now,
    });
  }
  return built;
}

/**
 * Newest first, which is the order every surface displays.
 *
 * @param {string} projectId
 * @param {{ surface?: string, limit?: number }} [options]
 * @returns {any[]}
 */
function imageAttachmentsForProject(projectId, options = {}) {
  const id = String(projectId || "");
  if (!id) return [];
  const surface = options.surface ? String(options.surface) : "";
  return imageAttachments
    .filter((item) => item && item.projectId === id && (!surface || item.surface === surface))
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, Number.isFinite(options.limit) ? Number(options.limit) : IMAGE_ATTACHMENT_DEFAULT_LIMIT);
}

/**
 * @param {string} id
 * @returns {any | null}
 */
function imageAttachmentById(id) {
  const key = String(id || "");
  return key ? imageAttachments.find((item) => item && item.id === key) || null : null;
}

/**
 * @param {any[]} records
 */
function saveImageAttachments(records) {
  (Array.isArray(records) ? records : []).forEach((record) => {
    if (!record || !record.id) return;
    const index = imageAttachments.findIndex((item) => item && item.id === record.id);
    if (index >= 0) imageAttachments.splice(index, 1, record);
    else imageAttachments.unshift(record);
  });
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function removeImageAttachment(id) {
  const index = imageAttachments.findIndex((item) => item && item.id === String(id || ""));
  if (index < 0) return false;
  imageAttachments.splice(index, 1);
  return true;
}

/**
 * Move an older project's inline album into the store. Idempotent: records are
 * matched by id, so replaying a restored backup cannot duplicate a picture.
 *
 * @param {any} project
 * @returns {number} how many records moved
 */
function migrateLegacyProjectImageAttachments(project) {
  if (!project || !Array.isArray(project.imageAttachments) || !project.imageAttachments.length) return 0;
  const moved = normalizeImageAttachments(project.imageAttachments).map((record) => ({
    ...record,
    projectId: record.projectId || project.id,
    surface: record.surface || "teachtext",
  }));
  saveImageAttachments(moved);
  delete project.imageAttachments;
  return moved.length;
}

/**
 * @param {any} attachment
 * @returns {string}
 */
function imageAttachmentVisionDataUrl(attachment) {
  return attachment?.previewDataUrl || attachment?.dataUrl || attachment?.originalDataUrl || "";
}

function normalizeClioImageInput(input = {}, options = {}) {
  const inlineDataUrl = typeof input.inlineDataUrl === "string" ? input.inlineDataUrl : "";
  const decodedBytes = imageDataUrlDecodedBytes(inlineDataUrl);
  if (inlineDataUrl && (!clioInlineDataUrlMimeType(inlineDataUrl) || decodedBytes > CLIO_IMAGE_MAX_INLINE_BYTES)) {
    return null;
  }
  const clientId = String(input.clientId || input.id || "").trim();
  if (!clientId) return null;
  const normalized = {
    clientId,
    kind: "image",
    name: String(input.name || "").slice(0, 512),
    type: String(input.type || "image/jpeg").slice(0, 128),
    size: Math.max(0, Number(input.size || 0) || 0),
    width: Math.max(0, Number(input.width || 0) || 0),
    height: Math.max(0, Number(input.height || 0) || 0),
    inlineDataUrl,
    transport: input.transport === "file" ? "file" : "inline",
    expiresAt: String(input.expiresAt || ""),
    attachedAt: String(input.attachedAt || ""),
    removedAt: String(input.removedAt || ""),
  };
  if (options.includeRuntime === true) {
    // These fields are request-only. No persistence caller is allowed to opt
    // into them; the explicit option exists only for the in-memory registry.
    normalized.file = input.file || null;
    normalized.objectUrl = String(input.objectUrl || "");
    normalized.fileToken = String(input.fileToken || "");
    normalized.fileExpiresAt = Number(input.fileExpiresAt || 0) || 0;
    normalized.fileBytes = Math.max(0, Number(input.fileBytes || 0) || 0);
    normalized.credentialScope = String(input.credentialScope || "");
    normalized.state = String(input.state || "pending");
    normalized.generation = Number(input.generation || 0) || 0;
    normalized.animated = input.animated === true;
    normalized.inlineBlob = input.inlineBlob || null;
  }
  return normalized;
}

function normalizeClioImageInputs(inputs = [], options = {}) {
  const seen = new Set();
  const result = [];
  for (const input of Array.isArray(inputs) ? inputs : []) {
    const normalized = normalizeClioImageInput(input, options);
    if (!normalized || seen.has(normalized.clientId)) continue;
    seen.add(normalized.clientId);
    result.push(normalized);
    if (result.length >= IMAGE_ATTACHMENT_MODEL_LIMIT) break;
  }
  return result;
}

function clioImageInputInlineChars(inputs = []) {
  return normalizeClioImageInputs(inputs)
    .reduce((sum, input) => sum + input.inlineDataUrl.length, 0);
}

function clioImageInputBlocks(inputs = []) {
  return normalizeClioImageInputs(inputs, { includeRuntime: true }).flatMap((input) => {
    if (input.removedAt) return [];
    if (input.fileToken && input.fileExpiresAt > Date.now()) {
      return [{ type: "file", file_id: input.fileToken }];
    }
    return input.inlineDataUrl
      ? [{ type: "image_url", image_url: { url: input.inlineDataUrl, detail: "original" } }]
      : [];
  });
}

/**
 * @param {any[]} attachments
 * @param {{ limit?: number }} [options]
 * @returns {any[]}
 */
function attachmentsAsImageBlocks(attachments, options = {}) {
  const limit = Number.isFinite(options.limit) ? Number(options.limit) : IMAGE_ATTACHMENT_MODEL_LIMIT;
  return (Array.isArray(attachments) ? attachments : [])
    .slice(0, Math.max(0, limit))
    .map((attachment) => {
      if (attachment?.fileToken && Number(attachment.fileExpiresAt || 0) > Date.now()) {
        return { type: "file", file_id: String(attachment.fileToken) };
      }
      const url = attachment?.inlineDataUrl || imageAttachmentVisionDataUrl(attachment);
      return url ? { type: "image_url", image_url: { url, detail: "original" } } : null;
    })
    .filter(Boolean);
}

/**
 * Append image blocks to the last user message. This is the one integration
 * point every surface uses: the payload then carries image content, and
 * fetchModelPayload routes it to the cloud vision model on its own.
 *
 * The provider rejects images in system or assistant messages, so they only
 * ever ride in a user message.
 *
 * @param {any[]} messages
 * @param {any[]} attachments
 * @param {{ limit?: number }} [options]
 * @returns {any[]} the same array, for chaining
 */
function attachImagesToModelMessages(messages, attachments, options = {}) {
  if (!Array.isArray(messages) || !messages.length) return messages;
  const blocks = attachmentsAsImageBlocks(attachments, options);
  if (!blocks.length) return messages;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    const existing = Array.isArray(message.content)
      ? message.content
      : [{ type: "text", text: String(message.content || "") }];
    messages[index] = { ...message, content: [...existing, ...blocks] };
    return messages;
  }
  return messages;
}

/**
 * Read one picture with the current model. Returns the text; stores nothing.
 *
 * @param {any} attachment
 * @param {{ mode?: string, modelName?: string, taskKind?: string, signal?: AbortSignal | null }} [options]
 * @returns {Promise<{ text: string, model: string, mode: string, updatedAt: string }>}
 */
async function analyzeImageAttachment(attachment, options = {}) {
  const dataUrl = imageAttachmentVisionDataUrl(attachment);
  if (!dataUrl) throw new Error("image_vision_no_preview");
  const mode = String(options.mode || "writing-context");
  const taskKind = options.taskKind
    || (mode === "ocr" ? "extract-vision-ocr" : "extract-vision-writing-context");
  const model = String(options.modelName || "");

  const result = await sendLocalModelTask({
    payload: {
      model,
      messages: window.AISystem6ModelTaskRuntime.buildVisionMessages({
        mode,
        name: attachment?.name || "",
        dataUrl,
      }),
      temperature: 0.2,
      max_tokens: mode === "ocr" ? 1400 : 900,
      stream: false,
      ai_system6_task_kind: taskKind,
    },
    signal: options.signal || null,
    taskKind,
    streamPreference: "json",
  });

  return {
    text: String(result?.text || "").trim(),
    model: String(result?.model || model),
    mode,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * One provenance line, so no surface can imply a picture was read when it was
 * not. The model id is stated, because a reader deserves to know which model
 * looked at their image.
 *
 * @param {any} attachment
 * @param {{ mode?: string, model?: string }} [options]
 * @returns {string}
 */
function imageAttachmentEvidenceMarkdown(attachment, options = {}) {
  const name = attachment?.name || (typeof t === "function" ? t("image_attachment") : "Image");
  const model = String(options.model || "").trim();
  const label = options.mode === "ocr"
    ? (typeof t === "function" ? t("image_vision_ocr_title", name) : `Text in ${name}`)
    : (typeof t === "function" ? t("image_vision_notes_title", name) : `Notes on ${name}`);
  return model ? `${label} — ${model}` : label;
}
