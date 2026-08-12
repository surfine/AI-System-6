// Core module: temporary streaming Markdown preview rendering.

let streamMarkdownLoadPromise = null;
let streamMarkdownInstance = null;
let streamMarkdownLastSourceLength = 0;
let streamMarkdownRenderId = 0;

async function ensureStreamMarkdownParser() {
  if (window.StreamMarkdownParser?.getMarkdown) return window.StreamMarkdownParser;
  streamMarkdownLoadPromise ||= loadClassicScriptOnce("app/vendor/stream-markdown-parser.global.js")
    .then(() => {
      if (!window.StreamMarkdownParser?.getMarkdown) {
        throw new Error("stream-markdown-parser did not expose a browser API.");
      }
      return window.StreamMarkdownParser;
    })
    .catch((error) => {
      streamMarkdownLoadPromise = null;
      throw error;
    });
  return streamMarkdownLoadPromise;
}

function resetStreamingMarkdownRenderer() {
  streamMarkdownInstance = null;
  streamMarkdownLastSourceLength = 0;
  streamMarkdownRenderId += 1;
}

function streamingMarkdownParserInstance(source) {
  const api = window.StreamMarkdownParser;
  if (!api?.getMarkdown) return null;
  if (!streamMarkdownInstance || String(source || "").length < streamMarkdownLastSourceLength) {
    streamMarkdownInstance = api.getMarkdown(`ai-system-6-stream-${Date.now()}`, {
      i18n: { "common.copy": t("copy") || "Copy" },
    });
  }
  streamMarkdownLastSourceLength = String(source || "").length;
  return streamMarkdownInstance;
}

function renderStreamingMarkdownChildren(children) {
  return (children || []).map(renderStreamingMarkdownNode).join("");
}

function renderStreamingMarkdownNode(node) {
  if (!node || typeof node !== "object") return "";
  const type = String(node.type || "");
  if (type === "text") return escapeHtml(node.content ?? node.raw ?? "");
  if (type === "strong") return `<strong>${renderStreamingMarkdownChildren(node.children)}</strong>`;
  if (type === "em") return `<em>${renderStreamingMarkdownChildren(node.children)}</em>`;
  if (type === "s" || type === "del" || type === "strikethrough") return `<del>${renderStreamingMarkdownChildren(node.children)}</del>`;
  if (type === "inline_code") return `<code>${escapeHtml(node.content ?? node.raw ?? "")}</code>`;
  if (type === "hardbreak") return "<br>";
  if (type === "softbreak") return "\n";
  if (type === "checkbox_input") return `<input type="checkbox" disabled${node.checked ? " checked" : ""}>`;
  if (type === "link") {
    const text = renderStreamingMarkdownChildren(node.children) || escapeHtml(node.text || node.raw || node.href || "");
    if (!isSafeMarkdownHref(node.href)) return text;
    const title = node.title ? ` title="${escapeHtml(node.title)}"` : "";
    return `<a href="${escapeHtml(node.href)}"${title} target="_blank" rel="noreferrer">${text}</a>`;
  }
  if (type === "image") {
    const alt = escapeHtml(node.alt || node.raw || "");
    if (!isSafeMarkdownImageSrc(node.src)) return alt;
    const title = node.title ? ` title="${escapeHtml(node.title)}"` : "";
    return `<img src="${escapeHtml(node.src)}" alt="${alt}"${title} loading="lazy" decoding="async">`;
  }
  if (type === "math_inline") return `<code>${escapeHtml(node.content || node.raw || "")}</code>`;
  if (type === "math_block") return `<pre><code>${escapeHtml(node.content || node.raw || "")}</code></pre>`;
  if (type === "paragraph") return `<p>${renderStreamingMarkdownChildren(node.children)}</p>`;
  if (type === "heading") {
    const level = Math.max(1, Math.min(6, Number(node.level) || 2));
    return `<h${level}>${renderStreamingMarkdownChildren(node.children) || escapeHtml(node.text || node.raw || "")}</h${level}>`;
  }
  if (type === "blockquote") return `<blockquote>${renderStreamingMarkdownChildren(node.children)}</blockquote>`;
  if (type === "code_block") {
    const language = String(node.language || "").trim();
    const className = language ? ` class="language-${escapeHtml(language)}"` : "";
    return `<pre><code${className}>${escapeHtml(node.code ?? node.content ?? node.raw ?? "")}</code></pre>`;
  }
  if (type === "list") {
    const tag = node.ordered ? "ol" : "ul";
    const start = node.ordered && Number.isFinite(Number(node.start)) ? ` start="${Number(node.start)}"` : "";
    return `<${tag}${start}>${(node.items || []).map(renderStreamingMarkdownNode).join("")}</${tag}>`;
  }
  if (type === "list_item") return `<li>${renderStreamingMarkdownChildren(node.children)}</li>`;
  if (type === "table") {
    const header = node.header ? `<thead>${renderStreamingMarkdownNode(node.header)}</thead>` : "";
    const body = `<tbody>${(node.rows || []).map(renderStreamingMarkdownNode).join("")}</tbody>`;
    return `<table>${header}${body}</table>`;
  }
  if (type === "table_row") return `<tr>${(node.cells || []).map(renderStreamingMarkdownNode).join("")}</tr>`;
  if (type === "table_cell") {
    const tag = node.header ? "th" : "td";
    return `<${tag}>${renderStreamingMarkdownChildren(node.children) || escapeHtml(node.raw || "")}</${tag}>`;
  }
  if (Array.isArray(node.children)) return renderStreamingMarkdownChildren(node.children);
  return escapeHtml(node.content ?? node.raw ?? "");
}

function renderStreamingMarkdownHtml(markdown, options = {}) {
  const source = normalizeMarkdownText(markdown);
  try {
    const api = window.StreamMarkdownParser;
    const md = streamingMarkdownParserInstance(source);
    if (!api?.parseMarkdownToStructure || !md) return markdownToSystemHtml(source);
    const nodes = api.parseMarkdownToStructure(source, md, {
      final: options.final === true,
      validateLink: isSafeMarkdownHref,
      customHtmlTags: [],
    });
    return nodes.map(renderStreamingMarkdownNode).join("").trim() || markdownToSystemHtml(source || "...");
  } catch {
    return markdownToSystemHtml(source || "...");
  }
}

async function prepareStreamingMarkdownPreview() {
  try {
    await ensureStreamMarkdownParser();
  } catch {
    // Fallback to marked-backed previews when the optional parser cannot load.
  }
  resetStreamingMarkdownRenderer();
}

function renderStreamingMarkdownPreview(element, markdown, options = {}) {
  if (!element) return;
  const renderId = ++streamMarkdownRenderId;
  const html = renderStreamingMarkdownHtml(markdown || "...", options);
  if (renderId === streamMarkdownRenderId) element.innerHTML = html;
}

function showStreamingSurfacePreview(surface, markdown, options = {}) {
  const config = typeof getTeachTextSurface === "function" ? getTeachTextSurface(surface) : null;
  if (!config?.preview) return;
  const container = config.preview.closest(".teachtext-editor-container");
  renderStreamingMarkdownPreview(config.preview, markdown, options);
  config.input?.classList.add("is-hidden");
  config.preview.classList.remove("is-hidden");
  container?.classList.add("is-previewing");
  if (typeof syncTeachTextSurfacePreviewToggle === "function") syncTeachTextSurfacePreviewToggle(surface);
}

function showStreamingTeachTextPreview(markdown, options = {}) {
  if (!teachTextPreviewEl || !teachTextBodyInput) return;
  renderStreamingMarkdownPreview(teachTextPreviewEl, markdown, options);
  teachTextBodyInput.classList.add("is-hidden");
  teachTextPreviewEl.classList.remove("is-hidden");
  teachTextTogglePreviewButton.textContent = t("edit");
}
