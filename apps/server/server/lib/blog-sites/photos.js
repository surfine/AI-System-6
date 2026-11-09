"use strict";
// 影像视图's data half (P4): the photos.json collection.
//
// A frame is one photograph with its own words (alt, caption, city, taken,
// medium); a stack is an ordered set of frames the writer arranged; a roll is
// when a batch went up. The editor changes frames and stack order — it does not
// invent frames, because a frame without its file is a broken image on the site.

const fs = require("node:fs");
const path = require("node:path");

const { imageInfo, takenMonth } = require("./image-info.js");

const EDITABLE_FRAME_FIELDS = new Set(["alt", "cap", "city", "taken", "medium"]);

// The formats a frame can point at. The extension is written from what the
// bytes are, not from what the file was called, so a mislabelled download does
// not become a picture the browser refuses to draw.
const FORMAT_EXTENSION = Object.freeze({ jpeg: ".jpg", png: ".png", gif: ".gif", webp: ".webp" });
const MAX_IMPORT_FILES = 12;
const MAX_IMPORT_BYTES = 12 * 1024 * 1024;

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function photoError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * The collection file for a site: the one content type declared as
 * `json-collection`.
 * @param {Record<string, any>} site
 */
function collectionPath(site) {
  const type = Object.values(site.contentTypes || {}).find((entry) => entry?.storage?.kind === "json-collection");
  if (!type) throw photoError("photos_not_configured", "这个站点没有声明影像集合（storage.kind = json-collection）。", 409);
  const file = path.join(String(type.storage.dir || ""), String(type.storage.file || ""));
  if (!file) throw photoError("photos_not_configured", "影像集合缺少文件路径。", 409);
  return file;
}

/**
 * @param {Record<string, any>} site
 */
function readCollection(site) {
  const file = collectionPath(site);
  if (!fs.existsSync(file)) throw photoError("photos_missing", `影像集合不存在：${file}`, 409);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw photoError("photos_unreadable", `影像集合读不了（JSON 有错）：${String(/** @type {any} */ (error)?.message || error)}`, 409);
  }
  if (!data || typeof data !== "object") throw photoError("photos_unreadable", "影像集合不是一个对象。", 409);
  return { file, data };
}

/**
 * The one place that writes the collection back: two spaces of indent and a
 * trailing newline, so a hand-edited diff stays readable and `git diff` shows
 * only the frames that changed.
 * @param {string} file
 * @param {Record<string, any>} data
 */
function writeCollection(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * The image directory the frames point into: `media.dir`.
 * @param {Record<string, any>} site
 */
function mediaDir(site) {
  const dir = String(site?.media?.dir || "");
  if (!dir) throw photoError("media_not_configured", "这个站点没有登记图片目录（media.dir），照片没有地方放。", 409);
  if (!fs.existsSync(dir)) throw photoError("media_missing", `图片目录不存在：${dir}`, 409);
  return dir;
}

/**
 * The view the desk draws: stacks in their order, each carrying its frames in
 * the order the writer arranged, plus how many frames no stack shows.
 * @param {Record<string, any>} site
 */
function photoView(site) {
  const { file, data } = readCollection(site);
  const frames = data.frames || {};
  const stacks = (Array.isArray(data.stacks) ? data.stacks : []).map((stack) => ({
    slug: String(stack.slug || ""),
    title: String(stack.title || ""),
    meta: String(stack.meta || ""),
    intro: String(stack.intro || ""),
    frames: (Array.isArray(stack.ids) ? stack.ids : [])
      .filter((id) => frames[id])
      .map((id) => ({
        id,
        file: String(frames[id].file || ""),
        alt: String(frames[id].alt || ""),
        cap: String(frames[id].cap || ""),
        city: String(frames[id].city || ""),
        taken: String(frames[id].taken || ""),
        medium: String(frames[id].medium || ""),
        w: Number(frames[id].w) || 0,
        h: Number(frames[id].h) || 0,
        inStack: String(stack.slug || ""),
      })),
  }));
  const stacked = new Set(stacks.flatMap((stack) => stack.frames.map((frame) => frame.id)));
  const loose = Object.entries(frames)
    .filter(([id]) => !stacked.has(id))
    .map(([id, frame]) => ({ id, file: String(frame.file || ""), alt: String(frame.alt || "") }));
  // The collection records `no`; `code` is the zero-padded name the site shows.
  const rolls = (Array.isArray(data.rolls) ? data.rolls : []).map((roll) => ({
    no: Number(roll.no) || 0,
    code: String(Number(roll.no) || 0).padStart(3, "0"),
    date: String(roll.date || ""),
    cap: String(roll.cap || ""),
    ids: (Array.isArray(roll.ids) ? roll.ids : []).map(String),
  }));
  const rollOfId = new Map();
  for (const roll of rolls) for (const id of roll.ids) rollOfId.set(id, roll.code);
  for (const stack of stacks) for (const frame of stack.frames) frame.roll = rollOfId.get(frame.id) || "";
  return {
    ok: true,
    file,
    media: { dir: String(site?.media?.dir || ""), urlPrefix: String(site?.media?.urlPrefix || "") },
    stacks,
    loose,
    rolls,
    summary: { stacks: stacks.length, frames: Object.keys(frames).length, loose: loose.length, rolls: rolls.length },
  };
}

/**
 * Edit one frame's words. Only the five fields a writer types are accepted; the
 * file name and dimensions describe the photograph itself.
 * @param {Record<string, any>} site
 * @param {{ id?: string, patch?: Record<string, unknown> }} options
 */
function updateFrame(site, { id = "", patch = {} } = {}) {
  const frameId = String(id || "");
  if (!frameId) throw photoError("bad_request", "要给出帧的 id。", 400);
  const { file, data } = readCollection(site);
  const frame = data.frames?.[frameId];
  if (!frame) throw photoError("frame_missing", `没有这个帧：${frameId}`, 404);
  const applied = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!EDITABLE_FRAME_FIELDS.has(key)) {
      throw photoError("field_not_editable", `「${key}」不在可改的字段里（alt、cap、city、taken、medium）。`, 400);
    }
    applied[key] = String(value ?? "");
  }
  if (!Object.keys(applied).length) throw photoError("bad_request", "没有要改的字段。", 400);
  data.frames[frameId] = { ...frame, ...applied };
  writeCollection(file, data);
  return { ok: true, id: frameId, applied, note: `已写入「${frame.file}」的 ${Object.keys(applied).join("、")}。` };
}

/**
 * Re-arrange a stack's frames. The new list must be a permutation of the current
 * one — an order edit must not silently drop a photograph or add a stranger.
 * @param {Record<string, any>} site
 * @param {{ slug?: string, ids?: string[] }} options
 */
function reorderStack(site, { slug = "", ids = [] } = {}) {
  const wanted = String(slug || "");
  const { file, data } = readCollection(site);
  const stacks = Array.isArray(data.stacks) ? data.stacks : [];
  const stack = stacks.find((entry) => String(entry.slug || "") === wanted);
  if (!stack) throw photoError("stack_missing", `没有这一叠：${wanted}`, 404);
  const current = (Array.isArray(stack.ids) ? stack.ids : []).map(String);
  const next = (Array.isArray(ids) ? ids : []).map(String);
  const same = current.length === next.length && [...current].sort().join("|") === [...next].sort().join("|");
  if (!same) {
    throw photoError("order_mismatch", "新的顺序必须正好是这一叠原有的帧：不能多、不能少、不能换人。", 400);
  }
  stack.ids = next;
  writeCollection(file, data);
  return { ok: true, slug: wanted, ids: next, note: `「${stack.title || wanted}」的顺序已更新。` };
}

/**
 * A slug the site builder accepts: lowercase letters and digits joined by
 * hyphens. Anything else is refused here, with the rule named, rather than
 * failing later inside `build.mjs`.
 * @param {string} text
 */
function slugify(text) {
  return String(text || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * @param {any[]} stacks
 * @param {string} slug
 */
function requireStack(stacks, slug) {
  const stack = stacks.find((entry) => String(entry.slug || "") === slug);
  if (!stack) throw photoError("stack_missing", `没有这一叠：${slug}`, 404);
  return stack;
}

/**
 * Local calendar date as YYYY-MM-DD — the day the writer is having, not UTC's.
 * @param {Date} [now]
 */
function localDate(now = new Date()) {
  const pad = (/** @type {number} */ value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A file name that survives as a URL: ASCII lower-case letters, digits, dots
 * and hyphens. A name that reduces to nothing gets one made from the month,
 * because the frame still needs a file to point at.
 * @param {string} rawName
 * @param {string} extension
 * @param {string} month
 * @param {number} serial
 */
function photoFileName(rawName, extension, month, serial) {
  const base = path.basename(String(rawName || ""));
  const stemRaw = path.basename(base, path.extname(base));
  let stem = slugify(stemRaw);
  if (!stem) stem = `photo-${month ? month.replace("-", "") : "undated"}-${serial}`;
  return `${stem}${extension}`;
}

/**
 * The file in `dir` whose bytes are exactly these, if any. The same photograph
 * dropped twice is one photograph, not two frames.
 * @param {string} dir
 * @param {Buffer} buffer
 */
function fileWithSameBytes(dir, buffer) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).size !== buffer.length) continue;
      if (fs.readFileSync(full).equals(buffer)) return name;
    } catch {
      continue;
    }
  }
  return "";
}

/**
 * Bring photographs into the collection: write the bytes into `media.dir`, add
 * one frame each with the dimensions (and EXIF month, when the file carries
 * one), and — if the writer dropped them onto a stack — arrange them there.
 *
 * The alt text starts empty on purpose. Writing it is the writer's job, and the
 * media audit names every frame still missing it, so an undescribed photograph
 * stays visible instead of being described by a machine on the writer's behalf.
 *
 * @param {Record<string, any>} site
 * @param {{ files?: Array<{ name?: string, data?: string }>, stack?: string, city?: string, medium?: string, taken?: string }} options
 */
function importFrames(site, { files = [], stack = "", city = "", medium = "", taken = "" } = {}) {
  const incoming = Array.isArray(files) ? files : [];
  if (!incoming.length) throw photoError("bad_request", "没有收到照片。", 400);
  if (incoming.length > MAX_IMPORT_FILES) {
    throw photoError("too_many_files", `一次最多 ${MAX_IMPORT_FILES} 张，分几趟放进来。`, 400);
  }
  const dir = mediaDir(site);
  const { file, data } = readCollection(site);
  if (!data.frames || typeof data.frames !== "object") data.frames = {};
  if (!Array.isArray(data.stacks)) data.stacks = [];
  const targetStack = stack ? requireStack(data.stacks, String(stack)) : null;
  const explicitTaken = String(taken || "").trim();

  const imported = [];
  const skipped = [];
  const usedIds = new Set(Object.keys(data.frames));
  const reservedNames = new Set();
  let serial = 0;

  incoming.forEach((entry, position) => {
    const name = String(entry?.name || `photo-${position + 1}`);
    const encoded = String(entry?.data || "");
    const buffer = encoded ? Buffer.from(encoded, "base64") : Buffer.alloc(0);
    if (!buffer.length) {
      skipped.push({ name, reason: "empty_file" });
      return;
    }
    if (buffer.length > MAX_IMPORT_BYTES) {
      skipped.push({ name, reason: "file_too_large", limitBytes: MAX_IMPORT_BYTES });
      return;
    }
    const info = imageInfo(buffer);
    if (!info.ok) {
      const refusal = /** @type {{ reason?: string, format?: string }} */ (info);
      skipped.push({ name, reason: String(refusal.reason || "unreadable"), format: String(refusal.format || "") });
      return;
    }
    const extension = FORMAT_EXTENSION[/** @type {keyof typeof FORMAT_EXTENSION} */ (info.format)];
    if (!extension) {
      skipped.push({ name, reason: "unsupported_format", format: info.format });
      return;
    }
    const month = explicitTaken || takenMonth(buffer);

    const same = fileWithSameBytes(dir, buffer);
    if (same) {
      const described = Object.entries(data.frames).find(([, frame]) => String(frame?.file || "") === same)?.[0];
      if (described) {
        skipped.push({ name, reason: "already_in_collection", id: described, file: same });
        return;
      }
    }

    serial += 1;
    let fileName = same || photoFileName(name, extension, month, serial);
    if (!same) {
      const stem = path.basename(fileName, path.extname(fileName));
      let attempt = 1;
      while (fs.existsSync(path.join(dir, fileName)) || reservedNames.has(fileName)) {
        attempt += 1;
        fileName = `${stem}-${attempt}${extension}`;
      }
    }

    let id = slugify(path.basename(fileName, path.extname(fileName))) || `photo-${serial}`;
    const baseId = id;
    let suffix = 1;
    while (usedIds.has(id)) {
      suffix += 1;
      id = `${baseId}-${suffix}`;
    }

    if (!same) {
      try {
        fs.writeFileSync(path.join(dir, fileName), buffer);
      } catch (error) {
        skipped.push({ name, reason: "write_failed", detail: String(/** @type {any} */ (error)?.message || error) });
        return;
      }
      reservedNames.add(fileName);
    }
    usedIds.add(id);

    data.frames[id] = {
      file: fileName,
      w: info.w,
      h: info.h,
      cap: "",
      alt: "",
      city: String(city || ""),
      taken: month,
      medium: String(medium || ""),
    };
    if (targetStack) {
      if (!Array.isArray(targetStack.ids)) targetStack.ids = [];
      targetStack.ids.push(id);
    }
    imported.push({ id, file: fileName, w: info.w, h: info.h, taken: month, stack: targetStack ? String(targetStack.slug) : "" });
  });

  if (imported.length) writeCollection(file, data);
  return {
    ok: imported.length > 0,
    dir,
    imported,
    skipped,
    counts: { imported: imported.length, skipped: skipped.length, missingAlt: imported.length },
    note: imported.length
      ? `放进来 ${imported.length} 帧${targetStack ? `，编进「${targetStack.title || targetStack.slug}」` : "（还没归叠，在影像里归到某一叠）"}。`
        + `这 ${imported.length} 帧还没有替代文字——发布前要补上，媒体审计会把它们列出来。`
      : "没有可导入的照片，看看被略过的原因。",
  };
}

/**
 * Arrange one frame into another stack (or out of every stack, for "loose").
 * A frame appears in at most one stack — that is what the builder's stack pages
 * assume — so moving removes it from wherever it was.
 * @param {Record<string, any>} site
 * @param {{ id?: string, to?: string, index?: number | null }} options
 */
function moveFrame(site, { id = "", to = "", index = null } = {}) {
  const frameId = String(id || "");
  if (!frameId) throw photoError("bad_request", "要给出帧的 id。", 400);
  const { file, data } = readCollection(site);
  if (!data.frames?.[frameId]) throw photoError("frame_missing", `没有这个帧：${frameId}`, 404);
  const stacks = Array.isArray(data.stacks) ? data.stacks : [];
  for (const stack of stacks) {
    if (Array.isArray(stack.ids)) stack.ids = stack.ids.filter((entry) => String(entry) !== frameId);
  }
  const target = String(to || "");
  let landed = "";
  if (target) {
    const stack = requireStack(stacks, target);
    if (!Array.isArray(stack.ids)) stack.ids = [];
    const at = Number.isInteger(index) ? Math.min(Math.max(Number(index), 0), stack.ids.length) : stack.ids.length;
    stack.ids.splice(at, 0, frameId);
    landed = String(stack.slug);
  }
  writeCollection(file, data);
  return { ok: true, id: frameId, stack: landed, note: landed ? `这一帧归到「${landed}」。` : "这一帧撤出了所有叠（散页）。" };
}

/**
 * A new stack, empty. The slug is derived from the title unless one is given,
 * and it must be one the site builder accepts.
 * @param {Record<string, any>} site
 * @param {{ title?: string, slug?: string, meta?: string, intro?: string }} options
 */
function createStack(site, { title = "", slug = "", meta = "", intro = "" } = {}) {
  const wanted = slugify(slug || title);
  if (!wanted) throw photoError("bad_slug", "叠要有个名字，或者给出小写英文 slug。", 400);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(wanted)) {
    throw photoError("bad_slug", `「${wanted}」不能当 slug：只能用小写英文、数字和连字符。`, 400);
  }
  const { file, data } = readCollection(site);
  if (!Array.isArray(data.stacks)) data.stacks = [];
  if (data.stacks.some((stack) => String(stack.slug || "") === wanted)) {
    throw photoError("stack_exists", `已经有一叠叫「${wanted}」。`, 409);
  }
  data.stacks.push({ slug: wanted, title: String(title || wanted), meta: String(meta || ""), intro: String(intro || ""), ids: [] });
  writeCollection(file, data);
  return { ok: true, stack: { slug: wanted, title: String(title || wanted) }, note: `新建了叠「${title || wanted}」，空着等你归帧。` };
}

/**
 * A batch goes up as one roll. The builder refuses a roll frame that belongs to
 * no stack, so this refuses it too — with the option to name the stack the
 * batch is being arranged into, which makes that the same decision, once.
 * @param {Record<string, any>} site
 * @param {{ ids?: string[], date?: string, cap?: string, stack?: string }} options
 */
function createRoll(site, { ids = [], date = "", cap = "", stack = "" } = {}) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map((entry) => String(entry)).filter(Boolean))];
  if (!wanted.length) throw photoError("bad_request", "一卷至少要有一帧。", 400);
  const day = String(date || "").trim() || localDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw photoError("bad_date", "日期要写成 YYYY-MM-DD。", 400);
  const { file, data } = readCollection(site);
  const frames = data.frames || {};
  const stacks = Array.isArray(data.stacks) ? data.stacks : [];

  const missing = wanted.filter((id) => !frames[id]);
  if (missing.length) throw photoError("frame_missing", `这些帧不在集合里：${missing.join("、")}`, 404);

  if (stack) {
    const target = requireStack(stacks, String(stack));
    if (!Array.isArray(target.ids)) target.ids = [];
    for (const id of wanted) if (!target.ids.includes(id)) target.ids.push(id);
  }

  const outside = wanted.filter((id) => !stacks.some((entry) => Array.isArray(entry.ids) && entry.ids.includes(id)));
  if (outside.length) {
    throw photoError(
      "frame_not_in_stack",
      `这些帧还没归进任何叠：${outside.join("、")}。站点的卷只收拾已经归叠的帧——先放进某一叠（或「散页」），再编卷。`,
      409,
    );
  }

  const rolls = Array.isArray(data.rolls) ? data.rolls : [];
  const rollOfId = new Map();
  for (const roll of rolls) for (const id of Array.isArray(roll.ids) ? roll.ids : []) rollOfId.set(String(id), roll);
  const movedFrom = wanted
    .filter((id) => rollOfId.has(id))
    .map((id) => ({ id, from: String(rollOfId.get(id).no || "").padStart(3, "0") }));

  const no = rolls.reduce((max, roll) => Math.max(max, Number(roll?.no) || 0), 0) + 1;
  const roll = { no, date: day, cap: String(cap || ""), ids: wanted };
  rolls.push(roll);
  data.rolls = rolls;
  writeCollection(file, data);

  return {
    ok: true,
    roll: { ...roll, code: String(no).padStart(3, "0"), count: wanted.length },
    movedFrom,
    note: `编成第 ${String(no).padStart(3, "0")} 卷：${wanted.length} 帧，${day}。`
      + (movedFrom.length ? `其中 ${movedFrom.length} 帧原来在更早的卷里，现在记到这一卷。` : "")
      + "发布时构建会把它放到影像页和 RSS。",
  };
}

module.exports = Object.freeze({
  photoView,
  updateFrame,
  reorderStack,
  importFrames,
  moveFrame,
  createStack,
  createRoll,
  readCollection,
  collectionPath,
  mediaDir,
  EDITABLE_FRAME_FIELDS,
  MAX_IMPORT_FILES,
});
