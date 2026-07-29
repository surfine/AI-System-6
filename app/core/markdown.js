// Core module: shared Markdown parsing for all writing surfaces.

// Loaded before feature modules as a classic script; shares the AI System 6 global scope.



function normalizeMarkdownText(markdown) {
  return String(markdown || "").replace(/\r\n?/g, "\n");
}

function stripMarkdownInlineSyntax(value) {
  return String(value || "")
    .replace(/\s+#+\s*$/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownMarkedApi() {
  return globalThis.marked || (typeof window !== "undefined" ? window.marked : null);
}

function isSafeMarkdownHref(href) {
  const value = String(href || "").trim();
  return /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(value);
}

function isSafeMarkdownImageSrc(src) {
  const value = String(src || "").trim();
  return /^(https?:|\/|\.\/|\.\.\/|data:image\/(?:png|jpe?g|gif|webp|bmp);base64,)/i.test(value);
}

function createSystemMarkdownRenderer() {
  const markedApi = markdownMarkedApi();
  const renderer = new markedApi.Renderer();

  renderer.html = function (input) {
    const text = typeof input === "object" ? input.text : input;
    return escapeHtml(text).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  };
  renderer.link = function (input, legacyTitle, legacyText) {
    const href = typeof input === "object" ? input.href : input;
    const title = typeof input === "object" ? input.title : legacyTitle;
    const text = typeof input === "object" ? this.parser.parseInline(input.tokens) : legacyText;
    if (!isSafeMarkdownHref(href)) return text;

    const escapedHref = escapeHtml(href);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapedHref}"${titleAttribute} target="_blank" rel="noreferrer">${text}</a>`;
  };
  renderer.image = function (input, legacyTitle, legacyText) {
    const href = typeof input === "object" ? input.href : input;
    const title = typeof input === "object" ? input.title : legacyTitle;
    const text = typeof input === "object" ? input.text : legacyText;
    if (!isSafeMarkdownImageSrc(href)) return escapeHtml(text || "");

    const escapedSrc = escapeHtml(href);
    const escapedAlt = escapeHtml(text || "");
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapedSrc}" alt="${escapedAlt}"${titleAttribute} loading="lazy" decoding="async">`;
  };

  return renderer;
}

function allowSafeMarkdownBreaks(html) {
  return String(html || "").replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

function markdownTokenText(token) {
  if (!token) return "";
  if (typeof token.text === "string") return stripMarkdownInlineSyntax(token.text);
  if (Array.isArray(token.tokens)) {
    return token.tokens.map(markdownTokenText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function collectMarkdownDocumentTokens(tokens, model, depth = 0) {
  (tokens || []).forEach((token) => {
    if (token.type === "heading") {
      const text = markdownTokenText(token);
      if (text) {
        model.headings.push({ level: token.depth, text, raw: token.text, line: token.raw });
        model.plainLines.push(text);
      }
    } else if (token.type === "list") {
      (token.items || []).forEach((item) => {
        const text = markdownTokenText(item);
        if (text) {
          model.listItems.push({ ordered: Boolean(token.ordered), depth, text, line: item.raw });
          model.plainLines.push(text);
        }
        collectMarkdownDocumentTokens(item.tokens, model, depth + 1);
      });
    } else if (token.type === "paragraph" || token.type === "blockquote") {
      const text = markdownTokenText(token);
      if (text) model.plainLines.push(text);
      collectMarkdownDocumentTokens(token.tokens, model, depth);
    } else if (Array.isArray(token.tokens)) {
      collectMarkdownDocumentTokens(token.tokens, model, depth);
    }
  });
}

function parseMarkdownDocument(markdown) {
  const endPerf = window.AISystem6Perf?.start("markdown_render", {
    chars: String(markdown || "").length,
  });
  const source = normalizeMarkdownText(markdown);
  const markedApi = markdownMarkedApi();
  if (!markedApi) {
    const fallback = {
      source,
      html: `<p>${escapeHtml(source)}</p>`,
      headings: [],
      listItems: [],
      outlineItems: [],
      title: "",
      plainText: stripMarkdownInlineSyntax(source),
    };
    endPerf?.({ fallback: true });
    return fallback;
  }

  const renderer = createSystemMarkdownRenderer();
  const tokens = markedApi.lexer(source, { gfm: true, breaks: false });
  const model = { headings: [], listItems: [], plainLines: [] };
  collectMarkdownDocumentTokens(tokens, model);

  const firstH1 = model.headings.find((heading) => heading.level === 1);
  const levelOneHeadings = model.headings.filter((heading) => heading.level === 1);
  const levelTwoHeadings = model.headings.filter((heading) => heading.level === 2);
  const levelThreeHeadings = model.headings.filter((heading) => heading.level === 3);
  const outlineItems = levelTwoHeadings.length
    ? levelTwoHeadings.map((heading) => heading.text)
    : levelOneHeadings.length
      ? levelOneHeadings.map((heading) => heading.text)
      : levelThreeHeadings.map((heading) => heading.text);

  const parsed = {
    source,
    html: allowSafeMarkdownBreaks(markedApi.parse(source, { gfm: true, breaks: false, renderer }).trim()),
    headings: model.headings,
    listItems: model.listItems,
    outlineItems,
    title: firstH1?.text || "",
    plainText: model.plainLines.filter(Boolean).join("\n"),
  };
  endPerf?.({ headings: parsed.headings.length, listItems: parsed.listItems.length });
  return parsed;
}

function markdownToSystemHtml(markdown) {
  return parseMarkdownDocument(markdown).html;
}

function markdownDocumentTitle(markdown) {
  return parseMarkdownDocument(markdown).title;
}

function trimMarkdownBlockLines(lines) {
  const block = Array.isArray(lines) ? lines : [];
  let start = 0;
  let end = block.length;

  while (start < end && !String(block[start] || "").trim()) start += 1;
  while (end > start && !String(block[end - 1] || "").trim()) end -= 1;

  return block.slice(start, end);
}

function markdownDocumentSectionBlocks(markdown, level = 2) {
  const sectionLevel = Math.max(1, Math.min(6, Number(level) || 2));
  const lines = normalizeMarkdownText(markdown).split("\n");
  const blocks = [];
  let inCode = false;
  let current = null;

  function finishCurrentBlock() {
    if (!current) return;
    const bodyLines = trimMarkdownBlockLines(current.bodyLines);
    blocks.push({
      level: sectionLevel,
      title: current.title,
      heading: current.heading,
      body: bodyLines.join("\n"),
      source: [current.heading, ...bodyLines].join("\n").trim(),
      index: blocks.length,
    });
    current = null;
  }

  lines.forEach((line) => {
    const isFence = /^\s{0,3}(?:```|~~~)/.test(line);
    if (isFence) {
      if (current) current.bodyLines.push(line);
      inCode = !inCode;
      return;
    }

    if (!inCode) {
      const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
      if (headingMatch && headingMatch[1].length === sectionLevel) {
        finishCurrentBlock();
        const title = stripMarkdownInlineSyntax(headingMatch[2]);
        current = title
          ? { title, heading: line, bodyLines: [] }
          : null;
        return;
      }
    }

    if (current) current.bodyLines.push(line);
  });

  finishCurrentBlock();
  return blocks;
}

function replaceMarkdownDocumentSectionBody(markdown, level = 2, index = 0, nextBody = "") {
  const sectionLevel = Math.max(1, Math.min(6, Number(level) || 2));
  const targetIndex = Math.max(0, Number(index) || 0);
  const lines = normalizeMarkdownText(markdown).split("\n");
  const bodyLines = trimMarkdownBlockLines(normalizeMarkdownText(nextBody).split("\n"));
  let inCode = false;
  let currentIndex = -1;
  let bodyStart = -1;
  let bodyEnd = lines.length;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const isFence = /^\s{0,3}(?:```|~~~)/.test(line);
    if (isFence) {
      inCode = !inCode;
      continue;
    }

    if (inCode) continue;

    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (!headingMatch) continue;

    if (headingMatch[1].length === sectionLevel) {
      currentIndex += 1;
      if (currentIndex === targetIndex) {
        bodyStart = lineIndex + 1;
        bodyEnd = lines.length;
        continue;
      }
      if (currentIndex > targetIndex && bodyStart >= 0) {
        bodyEnd = lineIndex;
        break;
      }
    }
  }

  if (bodyStart < 0) return normalizeMarkdownText(markdown);

  const nextLines = [
    ...lines.slice(0, bodyStart),
    "",
    ...bodyLines,
    "",
    ...lines.slice(bodyEnd),
  ];
  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
