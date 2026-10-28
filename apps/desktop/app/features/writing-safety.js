// Feature module: writing safety — the manuscript's 「自动存档」 revisions and
// link following on the writing surfaces (ClioWorks N15a).
//
// Loaded lazily by config.js's ensureWritingSafetyModule; shares the AI
// System 6 global scope. The eager side of the feature is deliberately thin:
// one wireup.js line that pulls this module in on the manuscript's first
// keystroke, one Format menu row, one availability line, and the ⌘/Ctrl+click
// router in markdown-editor.js. Everything that decides — the archive
// scheduler and the link parser — lives here.
//
// 自动存档 rides the existing revision store (core/document-revisions.js's
// createDocumentRevision): no new storage key, no schema change, the same
// per-document cap and the same content-hash dedup. It only adds one more
// moment at which a revision is recorded — after the manuscript has been
// quiet for a while — so a crash that also takes the Working Session snapshot
// still leaves the middle of the draft recoverable from File ▸ Versions….

// 工单 N15a：空闲约 20–30 秒才写一条。25 秒取中。
const autoArchiveIdleMs = 25_000;
let autoArchiveTimer = 0;
let autoArchiveBusy = false;

function clearManuscriptAutoArchiveTimer() {
  if (autoArchiveTimer) clearTimeout(autoArchiveTimer);
  autoArchiveTimer = 0;
}

// 输入后重置空闲计时。每次输入都推迟，所以连续写作不写中间修订；停下来
// 25 秒（或标签页隐藏时立刻，见 installWritingSafety）才落一条。
function scheduleManuscriptAutoArchive() {
  clearManuscriptAutoArchiveTimer();
  autoArchiveTimer = setTimeout(() => {
    autoArchiveTimer = 0;
    writeManuscriptAutoArchive().catch(() => {});
  }, autoArchiveIdleMs);
}

// 写一条「自动存档」修订。返回写入的修订，跳过时返回 null。
//  - 空正文不写（清空不是需要保护的稿子）。
//  - 内容与上一条修订相同（不论它来自显式存储还是上一次自动存档）就跳过；
//    createDocumentRevision 自己的去重与封顶原样沿用，这里不另设一套。
async function writeManuscriptAutoArchive() {
  const paper = typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput : null;
  if (!paper || autoArchiveBusy) return null;
  const body = String(paper.value || "");
  if (!body.trim()) return null;
  if (typeof activeProjectId !== "undefined" && !activeProjectId) return null;
  if (typeof createDocumentRevision !== "function") return null;
  autoArchiveBusy = true;
  try {
    const revisions = typeof listDocumentRevisions === "function"
      ? await listDocumentRevisions()
      : [];
    const latest = revisions[0];
    const contentHash = typeof revisionContentHash === "function"
      ? revisionContentHash(body)
      : null;
    if (latest && (contentHash ? latest.contentHash === contentHash : latest.body === body)) {
      return null;
    }
    const revision = await createDocumentRevision({
      body,
      origin: "system",
      operation: "auto-archive",
    });
    // createDocumentRevision 的去重（origin+operation+hash 全同）会原样交回
    // 上一条；那也是「不需要新修订」，与这里的跳过同义。
    return revision && (!latest || revision.id !== latest.id) ? revision : null;
  } finally {
    autoArchiveBusy = false;
  }
}

// ---- 跟随链接 ---------------------------------------------------------------
//
// 与插入路径（⌘K / format-link / 裸 URL 粘贴成链）互不影响：这里只读光标
// 处的原始 Markdown，解析出目标后经 isSafeMarkdownHref 白名单打开，与预览
// 里的链接同一道门。

// 光标处的行内 Markdown 链接。光标落在 [label](href) 的任何一段（含两端
// 的标记）都算；跨行的链接在源文里本来就不成立，逐行扫描即足。
function markdownLinkAt(text, caret) {
  const value = String(text || "");
  const pos = Math.max(0, Math.min(Number(caret) || 0, value.length));
  const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
  let lineEnd = value.indexOf("\n", pos);
  if (lineEnd === -1) lineEnd = value.length;
  const pattern = /\[([^\]\n]*)\]\(([^)\n]*)\)/g;
  let match;
  while ((match = pattern.exec(value.slice(lineStart, lineEnd)))) {
    const from = lineStart + match.index;
    const to = from + match[0].length;
    if (pos >= from && pos <= to) return { label: match[1], href: match[2], from, to };
  }
  return null;
}

// 写作面当前的光标位置。CodeMirror 接管页面时读它的 selection；回到
// textarea（覆盖层）模式时 selectionStart 就是答案。
function writingSafetyCaret(target) {
  const editor = window.AISystem6WritingEditor;
  if (editor?.isMounted?.(target)) {
    const view = editor.viewFor?.(target);
    const head = view ? view.state?.selection?.main?.head : undefined;
    return typeof head === "number" ? head : target.selectionStart ?? 0;
  }
  return target.selectionStart ?? 0;
}

// "opened" / "unsafe" / "none"。不安全的 href 给一行提示，不开。白名单本身
// 不在时同样不开（fail closed）：预览与编辑面过的是同一道门，门没了不开门。
function openMarkdownLink(href) {
  const url = String(href || "").trim();
  if (!url) return "none";
  if (typeof isSafeMarkdownHref !== "function" || !isSafeMarkdownHref(url)) {
    if (typeof setStatus === "function" && typeof t === "function") setStatus(t("link_not_opened_unsafe"));
    return "unsafe";
  }
  window.open(url, "_blank", "noopener");
  return "opened";
}

// Format ▸ 打开链接：光标处的链接解析后打开。没有链接时说明，不沉默。
function openLinkAtCursor() {
  const target = typeof mdeFormatTarget === "function" ? mdeFormatTarget(false) : null;
  if (!target) return false;
  const link = markdownLinkAt(target.value, writingSafetyCaret(target));
  if (!link) {
    if (typeof setStatus === "function" && typeof t === "function") setStatus(t("link_follow_none"));
    return false;
  }
  return openMarkdownLink(link.href) === "opened";
}

// 菜单行的可用性：光标真的落在链接里。解析在本模块，急载侧的可用性行
// 只在模块就位后转问到这里；未就位时按「写作面在前」作答，命令自己再解释。
function canFollowLink() {
  const target = typeof mdeFormatTarget === "function" ? mdeFormatTarget(false) : null;
  if (!target) return false;
  return Boolean(markdownLinkAt(target.value, writingSafetyCaret(target)));
}

// ⌘/Ctrl+点击：点击处即光标处。CodeMirror 模式问它的 posAtCoords；textarea
// 模式下浏览器在 mousedown 已把光标放到点击位置，selectionStart 就是它。
// 点击处没有链接时保持原生行为（选一个光标），不给提示——点击不是命令。
function followLinkAtPoint(event, textarea) {
  const target = textarea || (typeof mdeFormatTarget === "function" ? mdeFormatTarget(false) : null);
  if (!target) return false;
  let offset = null;
  const editor = window.AISystem6WritingEditor;
  if (editor?.isMounted?.(target)) {
    const view = editor.viewFor?.(target);
    const pos = view?.posAtCoords?.({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    offset = typeof pos === "number" ? pos : pos.pos;
  } else {
    offset = target.selectionStart ?? 0;
  }
  const link = markdownLinkAt(target.value, offset);
  if (!link) return false;
  openMarkdownLink(link.href);
  return true;
}

// ---- 恢复到修订 -------------------------------------------------------------
//
// Versions… 的恢复（自动存档修订走的就是这条路）把整篇正文换掉，必须落成
// 一个可撤销的编辑步：mdeApply 是编辑器自己的全量替换路径
// （execCommand("insertText")），原生撤销一步就把恢复前的正文放回来。
// 这里只包一层，不另造历史；编辑器帮手不在（无头环境）就交还给调用方直写。

function applyRestoredBody(paper, body) {
  if (!paper || typeof mdeApply !== "function") return false;
  const text = String(body ?? "");
  mdeApply(paper, { from: 0, to: String(paper.value || "").length, insert: text, selStart: 0, selEnd: 0 });
  return true;
}

// ---- 就位 -------------------------------------------------------------------

let writingSafetyInstalled = false;

function installWritingSafety() {
  if (writingSafetyInstalled) return;
  writingSafetyInstalled = true;

  const paper = typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput : null;
  paper?.addEventListener?.("input", scheduleManuscriptAutoArchive);
  // 挂着的自动存档在标签页隐藏时立刻尽力落盘（Working Session 的
  // visibilitychange 同款边界：浏览器不保证 unload 里的 IndexedDB 完成）。
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "hidden" && autoArchiveTimer) {
      clearManuscriptAutoArchiveTimer();
      writeManuscriptAutoArchive().catch(() => {});
    }
  });

  // 菜单动词的真身：actions.js 先登记了一个 lazy 命令（ensure 指向本模块的
  // loader），第一次点击把模块带进来后由这里接管。
  window.AISystem6Runtime?.registerCommand?.("format-open-link", {
    handler: () => openLinkAtCursor(),
    isAvailable: () => canFollowLink(),
  });
}

window.AISystem6WritingSafety = Object.freeze({
  canFollowLink,
  openLinkAtCursor,
  followLinkAtPoint,
  applyRestoredBody,
});

installWritingSafety();
