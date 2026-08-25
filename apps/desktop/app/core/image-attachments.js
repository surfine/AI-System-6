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

/**
 * @param {any[]} attachments
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ type: string, image_url: { url: string } }>}
 */
function attachmentsAsImageBlocks(attachments, options = {}) {
  const limit = Number.isFinite(options.limit) ? Number(options.limit) : IMAGE_ATTACHMENT_MODEL_LIMIT;
  return (Array.isArray(attachments) ? attachments : [])
    .slice(0, Math.max(0, limit))
    .map((attachment) => imageAttachmentVisionDataUrl(attachment))
    .filter(Boolean)
    .map((url) => ({ type: "image_url", image_url: { url } }));
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
    model,
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
