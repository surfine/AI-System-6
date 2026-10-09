// Feature module: Markdown to Marp-style slides export.

// Lazy-loaded by the Print to Slides action; shares the AI System 6 global scope.

window.AISystem6SlidesExportLoaded = true;

// The deck's resources live in app/features/slide-themes.js, which loads with
// this module. Nothing here invents a second source for eras, modes or layouts.
function slideDeckRuntime() {
  return typeof window !== "undefined" ? window.AISystem6SlideThemes || null : null;
}

// What the model must know before it writes a page: how this deck argues, what
// it looks like, how close it is read, and the exact syntax that carries all
// three per page.
function slideDeckPromptBrief(spec) {
  const runtime = slideDeckRuntime();
  if (!runtime || !spec) return "";
  const zh = currentLanguage === "zh";
  const mode = runtime.index().modes.find((entry) => entry.id === spec.mode) || runtime.index().modes[0];
  const era = runtime.byId(spec.era);
  const floor = runtime.fontFloor(spec);
  const layouts = runtime.layoutList();
  const preferred = mode.affinity.slice(0, 6).join(", ");
  return [
    zh ? "## 这份 deck 的骨架" : "## This deck's skeleton",
    zh
      ? `论证方式：${mode.zh}。标题要求：${mode.titleRule}。组织倾向：${mode.tendency}。备注语气：${mode.notes}。`
      : `Argument mode: ${mode.en}. Titles: ${mode.titleRuleEn}. Tendency: ${mode.tendency}. Notes: ${mode.notes}.`,
    zh
      ? `时代主题：${era.label}（${era.year}）。它在 frontmatter 的 style 块里，不要改动其中的颜色与字体。`
      : `Era: ${era.label} (${era.year}). Its rules live in the frontmatter style block; do not restyle them.`,
    zh
      ? `阅读距离：${floor.id}，正文不得小于 ${floor.body}px，注解不得小于 ${floor.meta}px。放不下就拆页，不许缩字。`
      : `Reading distance: ${floor.id}. Body never below ${floor.body}px, annotations never below ${floor.meta}px. Split the page instead of shrinking type.`,
    zh
      ? `每一页第二行必须写版式声明：\`<!-- _class: <版式> [hero|light|dark] -->\`。可用版式：${layouts.map((layout) => layout.id).join(", ")}。这份 deck 优先用：${preferred}。`
      : `Every page declares its layout on its second line: \`<!-- _class: <layout> [hero|light|dark] -->\`. Available: ${layouts.map((layout) => layout.id).join(", ")}. Prefer for this deck: ${preferred}.`,
    zh
      ? "节奏：首页必须是 cover 或 lead；连续两页以上同一种明暗面不允许；每四页至少一页 hero；八页以上至少一页 dark；每页可加 `<!-- job: 这一页对读者做什么 -->`。"
      : "Rhythm: the first page is cover or lead; never three pages on one surface in a row; at least one hero per four pages; at least one dark page once the deck reaches eight; each page may add `<!-- job: what this page does for the reader -->`.",
    zh ? "每种版式要写的 Markdown 形状（照写，不要自创结构）：" : "The markdown shape each layout expects (write exactly this, do not invent structure):",
    ...layouts.map((layout) => {
      const shape = runtime.markdownContract()[layout.id] || "";
      return `- ${layout.id}（${layout.zh}）: ${shape}`;
    }),
  ].join("\n");
}

const marpSlidesFrontmatter = [
  "---",
  "marp: true",
  "theme: default",
  "paginate: true",
  "size: 16:9",
  "style: |",
  "  section {",
  "    justify-content: center;",
  "    background: #f7f6ef;",
  "    color: #111;",
  "    font-family: Athelas, Georgia, 'Songti SC', serif;",
  "    padding: 54px 62px;",
  "  }",
  "  section::after {",
  "    color: #111;",
  "    font-size: 16px;",
  "    right: 34px;",
  "    bottom: 24px;",
  "  }",
  "  h1, h2 {",
  "    color: #111;",
  "    letter-spacing: 0;",
  "    line-height: 1.08;",
  "  }",
  "  h1 {",
  "    font-size: 48px;",
  "  }",
  "  h2 {",
  "    font-size: 36px;",
  "    border-left: 8px solid #111;",
  "    padding-left: 18px;",
  "  }",
  "  p, li {",
  "    font-size: 24px;",
  "    line-height: 1.34;",
  "  }",
  "  strong {",
  "    background: #111;",
  "    color: #f7f6ef;",
  "    padding: 0 .16em;",
  "  }",
  "  blockquote {",
  "    border-left: 8px solid #111;",
  "    margin-left: 0;",
  "    padding-left: 28px;",
  "  }",
  "  header {",
  "    color: #555;",
  "    font-size: 15px;",
  "    letter-spacing: 0;",
  "  }",
  "  section.lead {",
  "    background: #111;",
  "    color: #f7f6ef;",
  "  }",
  "  section.lead h1, section.lead h2 {",
  "    color: #f7f6ef;",
  "    border-color: #f7f6ef;",
  "  }",
  "  section.lead strong {",
  "    background: #f7f6ef;",
  "    color: #111;",
  "  }",
  "  section.divider {",
  "    justify-content: end;",
  "    background: #e9e4d0;",
  "  }",
  "  section.divider h2 {",
  "    max-width: 15ch;",
  "    border-left: 0;",
  "    padding-left: 0;",
  "    font-size: 50px;",
  "  }",
  "  section.quote blockquote {",
  "    max-width: 21ch;",
  "    border-left: 0;",
  "    padding-left: 0;",
  "    font-size: 34px;",
  "    line-height: 1.18;",
  "  }",
  "  section.contrast {",
  "    background: linear-gradient(90deg, #f7f6ef 0 49%, #111 49% 100%);",
  "  }",
  "  section.contrast h2, section.contrast p, section.contrast li {",
  "    max-width: 18ch;",
  "  }",
  "  section.evidence {",
  "    justify-content: start;",
  "  }",
  "  section.evidence h2 {",
  "    font-size: 32px;",
  "  }",
  "  section.evidence p, section.evidence li {",
  "    font-size: 21px;",
  "  }",
  "  section.takeaway {",
  "    background: #f7f6ef;",
  "    border: 18px solid #111;",
  "  }",
  "  section.takeaway h2 {",
  "    border-left: 0;",
  "    padding-left: 0;",
  "    font-size: 44px;",
  "  }",
  "---",
].join("\n");

function stripSlidesSourceFrontmatter(markdown) {
  const lines = normalizeMarkdownText(markdown).split("\n");
  if (lines[0]?.trim() !== "---") return lines;

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      return lines.slice(index + 1);
    }
  }
  return lines;
}

function markdownFenceMarker(line) {
  const match = String(line || "").match(/^\s*(`{3,}|~{3,})/);
  return match ? match[1] : "";
}

function isMarkdownHeading(line, level) {
  const hashes = "#".repeat(level);
  return new RegExp(`^${hashes}(?!#)\\s+`).test(line);
}

function trimSlideLines(lines) {
  const block = Array.isArray(lines) ? lines : [];
  let start = 0;
  let end = block.length;
  while (start < end && !block[start].trim()) start += 1;
  while (end > start && !block[end - 1].trim()) end -= 1;
  return block.slice(start, end);
}

function markdownToMarpSlides(markdown, spec = null) {
  const runtime = slideDeckRuntime();
  const sourceLines = stripSlidesSourceFrontmatter(markdown);
  const slides = [];
  let current = [];
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;

  function pushSlide() {
    const slide = trimSlideLines(current);
    if (slide.length) slides.push(slide);
    current = [];
  }

  sourceLines.forEach((line) => {
    const fence = markdownFenceMarker(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[0];
        fenceLength = fence.length;
      } else if (fence[0] === fenceChar && fence.length >= fenceLength) {
        inFence = false;
        fenceChar = "";
        fenceLength = 0;
      }
      current.push(line);
      return;
    }

    if (!inFence && isMarkdownHeading(line, 2)) {
      pushSlide();
      current.push(line);
      return;
    }

    current.push(line);
  });

  pushSlide();

  const body = slides
    .map((slide, index) => {
      const text = slide.join("\n").trimEnd();
      if (!text) return "";
      // A converted deck can only declare what the converter honestly knows:
      // its first page is the cover. The rest of the layout is the writer's.
      return runtime && index === 0 ? `<!-- _class: cover -->\n\n${text}` : text;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
  const frontmatter = runtime ? runtime.frontmatter(spec) : marpSlidesFrontmatter;

  return `${frontmatter}\n\n${body}`.trimEnd() + "\n";
}

function splitMarpSlidesForValidation(markdown) {
  const lines = normalizeMarkdownText(markdown).split("\n");
  const slides = [];
  const emptySlides = [];
  let current = [];
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let frontmatterEnd = -1;

  if (lines[0]?.trim() === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === "---") {
        frontmatterEnd = index;
        break;
      }
    }
  }

  const bodyLines = frontmatterEnd >= 0 ? lines.slice(frontmatterEnd + 1) : lines;
  function pushSlide() {
    const text = current.join("\n").trim();
    if (!text) emptySlides.push(slides.length + 1);
    slides.push(text);
    current = [];
  }

  bodyLines.forEach((line) => {
    const fence = markdownFenceMarker(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[0];
        fenceLength = fence.length;
      } else if (fence[0] === fenceChar && fence.length >= fenceLength) {
        inFence = false;
        fenceChar = "";
        fenceLength = 0;
      }
      current.push(line);
      return;
    }
    if (!inFence && line.trim() === "---") {
      pushSlide();
      return;
    }
    current.push(line);
  });
  pushSlide();
  return { slides, emptySlides, unclosedFence: inFence };
}

function validateMarpSlidesMarkdown(markdown, sourceMarkdown = "") {
  const text = normalizeMarkdownText(markdown).trim();
  const errors = [];
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") errors.push("missing_frontmatter");

  let frontmatterEnd = -1;
  if (lines[0]?.trim() === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === "---") {
        frontmatterEnd = index;
        break;
      }
    }
  }
  if (frontmatterEnd < 0) errors.push("missing_frontmatter_close");
  const frontmatter = frontmatterEnd > 0 ? lines.slice(1, frontmatterEnd).join("\n") : "";
  if (!/^marp\s*:\s*true\s*$/im.test(frontmatter)) errors.push("missing_marp_true");

  const split = splitMarpSlidesForValidation(text);
  if (split.emptySlides.length) errors.push(`empty_slide:${split.emptySlides.join(",")}`);
  if (split.unclosedFence) errors.push("unclosed_code_block");
  const slideCount = split.slides.filter(Boolean).length;
  const wordCount = countMarkdownWords(sourceMarkdown || text);
  const headingSections = (normalizeMarkdownText(sourceMarkdown).match(/^##\s+/gm) || []).length;
  const maxReasonable = Math.max(4, Math.min(48, Math.ceil(wordCount / 35) + headingSections + 4));
  const minReasonable = wordCount > 260 ? 2 : 1;
  if (slideCount < minReasonable || slideCount > maxReasonable) {
    errors.push(`unreasonable_slide_count:${slideCount}`);
  }
  return withSlideDeckGate({ ok: errors.length === 0, errors, slideCount }, text, true);
}

// The deck gate rides on the Marp validation both routes already run: the era
// and layout classes must exist, the mode and the pages must agree, and the
// rhythm rules must hold. AI output is held to it strictly; an imported or
// hand-written deck only gets warnings, because the writer's file is theirs.
function withSlideDeckGate(validation, markdown, strict) {
  const runtime = slideDeckRuntime();
  if (!runtime || typeof runtime.validate !== "function") return validation;
  const deck = runtime.validate(markdown, { strict: !!strict });
  const errors = [...(validation?.errors || [])];
  const warnings = [...(validation?.warnings || [])];
  deck.errors.forEach((error) => { if (!errors.includes(error)) errors.push(error); });
  deck.warnings.forEach((warning) => { if (!warnings.includes(warning)) warnings.push(warning); });
  return { ...validation, errors, warnings, ok: errors.length === 0, deck };
}

function slidesValidationErrorLabel(error) {
  const zh = currentLanguage === "zh";
  if (error === "missing_frontmatter") return zh ? "缺少开头 frontmatter（---）" : "Missing opening frontmatter (---)";
  if (error === "missing_frontmatter_close") return zh ? "frontmatter 没有闭合" : "Frontmatter is not closed";
  if (error === "missing_marp_true") return zh ? "frontmatter 中缺少 marp: true" : "Missing marp: true in frontmatter";
  if (error === "unclosed_code_block") return zh ? "代码块没有闭合，可能会误拆分页" : "A code block is not closed, so slide breaks may be wrong";
  if (error.startsWith("empty_slide:")) {
    const pages = error.split(":")[1] || "";
    return zh ? `存在空白 slide：${pages}` : `Empty slide found: ${pages}`;
  }
  if (error.startsWith("unreasonable_slide_count:")) {
    const count = error.split(":")[1] || "0";
    return zh ? `页数看起来不合理：${count} 页` : `Slide count looks unreasonable: ${count}`;
  }
  if (error === "deck_spec_unparsable") return zh ? "clio-deck 规格块不是合法 JSON" : "The clio-deck spec block is not valid JSON";
  if (error === "no_dark_surface") return zh ? "整份 deck 没有一页深色面" : "No dark page anywhere in the deck";
  if (error.startsWith("unknown_era:")) return zh ? `未知的时代主题：${error.split(":")[1]}` : `Unknown era: ${error.split(":")[1]}`;
  if (error.startsWith("unknown_mode:")) return zh ? `未知的论证方式：${error.split(":")[1]}` : `Unknown mode: ${error.split(":")[1]}`;
  if (error.startsWith("unknown_canvas:")) return zh ? `未知画布：${error.split(":")[1]}` : `Unknown canvas: ${error.split(":")[1]}`;
  if (error.startsWith("unknown_reading:")) return zh ? `未知阅读距离：${error.split(":")[1]}` : `Unknown reading distance: ${error.split(":")[1]}`;
  if (error.startsWith("unknown_layout:")) return zh ? `不存在的版式：${error.split(":")[1]}` : `Unknown layout: ${error.split(":")[1]}`;
  if (error.startsWith("missing_layout:")) return zh ? `第 ${error.split(":")[1]} 页没有声明版式` : `Page ${error.split(":")[1]} declares no layout`;
  if (error.startsWith("first_page_not_hero:")) return zh ? "第一页不是封面或开场页" : "The first page is not a cover or hook";
  if (error.startsWith("mode_layout_mismatch:")) {
    const parts = error.split(":");
    return zh ? `第 1 页的版式（${parts[2]}）不属于 ${parts[1]}` : `Page 1's layout (${parts[2]}) does not belong to ${parts[1]}`;
  }
  if (error.startsWith("mode_layout_drift:")) return zh ? `多页版式偏离该论证方式：${error.split(":")[1]}` : `Pages drift from the argument mode: ${error.split(":")[1]}`;
  if (error.startsWith("surface_run:")) {
    const parts = error.split(":");
    return zh ? `第 ${parts[1]} 页起 ${parts[2]} 面连续超过两页` : `Page ${parts[1]} continues the ${parts[2]} surface for a third page`;
  }
  if (error.startsWith("too_few_heroes:")) return zh ? `hero 页太少（${error.split(":")[1]}）` : `Too few hero pages (${error.split(":")[1]})`;
  return error;
}

function formatSlidesValidationError(validation) {
  const zh = currentLanguage === "zh";
  const details = (validation?.errors || []).map(slidesValidationErrorLabel).join(zh ? "；" : "; ");
  return zh
    ? `AI slides 草稿未通过本地校验：${details || "格式不符合要求"}。原稿未被覆盖。`
    : `AI slides draft did not pass local validation: ${details || "invalid format"}. Original document was not changed.`;
}

function slidesSourceFromActiveWindow() {
  const activeWin = document.querySelector(".window.is-active");
  const winName = activeWin?.dataset.window;

  if (winName === "outline") {
    return {
      markdown: outlineContentEl?.value || "",
      name: markdownDocumentTitle(outlineContentEl?.value || "") || t("outline"),
      folder: preferredFolderName(),
    };
  }

  return {
    markdown: teachTextBodyInput?.value || "",
    name: getTeachTextDocumentName({ fallback: t("untitled") }),
    folder: teachTextFolderInput?.value || preferredFolderName(),
  };
}

function slidesFileBaseName(name) {
  const cleaned = sanitizeFilename(String(name || t("untitled")).replace(/\.(?:slides\.)?md$/i, "").trim());
  return cleaned || t("untitled");
}

function createEditableSlidesDocument(source) {
  if (!getActiveProject()) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return null;
  }

  const folder = ensureFolder(source.folder || preferredFolderName());
  const now = new Date().toISOString();
  const name = nextAvailableFileName(`${slidesFileBaseName(source.name)}.slides.md`, folder.id);
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "text",
    name,
    folderId: folder.id,
    body: markdownToMarpSlides(source.markdown, source.deckSpec),
    source: "Slides",
    durable: true,
    label: "draft",
    createdAt: now,
    updatedAt: now,
  };

  chatFiles.unshift(file);
  selectedFolderId = folder.id;
  selectedChatFileId = file.id;
  selectedDocumentFolderId = null;
  selectedProjectRootItemId = null;
  activeTextFileId = file.id;
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  openTextFile(file.id);
  setStatus(t("slides_document_created", file.name));
  return file;
}

function openTemporarySlidesDocument(markdown, name) {
  const title = nextAvailableFileName(`${slidesFileBaseName(name)}.slides.md`, null);
  openTeachTextStateInTab({
    title,
    backing: { type: "slidesDraft", fileName: title },
    state: {
      name: title,
      folder: preferredFolderName(),
      body: markdown,
      label: "draft",
      workflowState: "draft",
      statusKey: "unsaved",
    },
    forceNew: true,
  });
  setStatus(currentLanguage === "zh"
    ? "AI slides 临时草稿已生成。请检查后再保存或导出到 Project CD。"
    : "AI slides draft ready. Review it, then Save or export to Project CD.");
}

function buildAiSlidesPrompt(source) {
  const title = source.name || markdownDocumentTitle(source.markdown) || t("untitled");
  return [
    resolveWritingRoutePrompt("other-apps.marp-convert"),
    "",
    slideDeckPromptBrief(source.deckSpec),
    "",
    `SOURCE TITLE:\n${title}`,
    "",
    `SOURCE MARKDOWN:\n${source.markdown}`,
  ].join("\n");
}

function marpSkillSourceFromTeachText() {
  return {
    markdown: teachTextBodyInput?.value || "",
    name: getTeachTextDocumentName({ fallback: t("untitled") }),
    folder: teachTextFolderInput?.value || preferredFolderName(),
  };
}

function cleanMarpSkillModelOutput(markdown) {
  let text = normalizeMarkdownText(markdown).trim();
  const fenced = text.match(/^```(?:markdown|md|marp)?\s*\n([\s\S]*?)\n```\s*$/i);
  const hadFenceWrapper = !!fenced;
  if (hadFenceWrapper) text = fenced[1].trim();

  const frontmatterStart = text.indexOf("---");
  if (frontmatterStart > 0) {
    const candidate = text.slice(frontmatterStart).trim();
    const maybeFrontmatter = candidate.match(/^---\s*\n([\s\S]*?)\n---(?:\n|$)/);
    if (maybeFrontmatter && /^marp\s*:\s*true\s*$/im.test(maybeFrontmatter[1])) {
      text = candidate;
    }
  }

  if (hadFenceWrapper) {
    text = text
      .replace(/^\s*```(?:markdown|md|marp)?\s*/i, "")
      .replace(/\s*```\s*$/i, "");
  }

  return text.replace(/^\s*<!--\s*```[\s\S]*?-->\s*/g, "").trimEnd() + "\n";
}

// The style block the deck carries: the chosen era's CSS, indented to sit under
// `style: |`. Without the runtime loaded the pre-era block still stands, so an
// old caller cannot produce a deck with no styling at all.
function clioMarpStyleBlock(spec = null) {
  const runtime = slideDeckRuntime();
  if (!runtime) {
    return marpSlidesFrontmatter
      .split("\n")
      .slice(5, -1)
      .join("\n");
  }
  const resolved = { ...runtime.defaultSpec(), ...(spec || {}) };
  return runtime.cssFor(resolved.era)
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
}

// Drops one YAML block (`style: |` and its indented body) from the head lines.
function dropFrontmatterBlock(rows, key) {
  const out = [];
  let dropping = false;
  rows.forEach((line) => {
    if (new RegExp(`^${key}\\s*:`, "i").test(line)) { dropping = true; return; }
    if (dropping) {
      if (/^\S/.test(line)) dropping = false;
      else return;
    }
    out.push(line);
  });
  return out;
}

// A deck always leaves this desk carrying its own identity: the era class, the
// style block that renders it, and the one-line spec the gates read. A model may
// write its own frontmatter; it may not write a deck that renders unstyled or
// that loses the era it was told to use.
function ensureClioMarpVisualStyle(markdown, spec = null) {
  const runtime = slideDeckRuntime();
  const text = normalizeMarkdownText(markdown).trimEnd();
  // One implementation of "give this deck its identity": the restyle route
  // calls the same function from ClioStage.
  if (runtime && spec) return runtime.restyle(text, spec);
  const lines = text.split("\n");
  let frontmatterEnd = -1;
  if (lines[0]?.trim() === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === "---") { frontmatterEnd = index; break; }
    }
  }

  // Without the theme runtime the pre-era behaviour stands: a valid slide body
  // gets the plain Marp frontmatter rather than being refused.
  if (!runtime) {
    if (lines[0]?.trim() !== "---" || frontmatterEnd < 0) {
      return [
        "---",
        "marp: true",
        "theme: default",
        "paginate: true",
        "size: 16:9",
        clioMarpStyleBlock(),
        "---",
        "",
        text,
      ].join("\n").trimEnd() + "\n";
    }
    const frontmatter = lines.slice(1, frontmatterEnd).join("\n");
    if (!/^marp\s*:\s*true\s*$/im.test(frontmatter)) {
      return [
        "---",
        "marp: true",
        "theme: default",
        "paginate: true",
        "size: 16:9",
        clioMarpStyleBlock(),
        "---",
        "",
        text,
      ].join("\n").trimEnd() + "\n";
    }
    if (/^style\s*:\s*\|/im.test(frontmatter)) return `${text}\n`;
    return [...lines.slice(0, frontmatterEnd), clioMarpStyleBlock(), ...lines.slice(frontmatterEnd)].join("\n").trimEnd() + "\n";
  }

  const resolved = { ...runtime.defaultSpec(), ...(spec || {}) };
  const specLine = runtime.specLine(resolved);
  if (frontmatterEnd < 0) {
    return [runtime.frontmatter(resolved), "", specLine, "", text].join("\n").trimEnd() + "\n";
  }

  let head = lines.slice(0, frontmatterEnd + 1);
  const hadMarpTrue = /^marp\s*:\s*true\s*$/im.test(head.join("\n"));
  head = dropFrontmatterBlock(head, "class");
  head = dropFrontmatterBlock(head, "style");
  const identity = [`class: era-${resolved.era}`, "style: |", ...clioMarpStyleBlock(resolved).split("\n")];
  const sizeIndex = head.findIndex((line) => /^size\s*:/i.test(line));
  const anchor = sizeIndex >= 0 ? sizeIndex : head.findIndex((line) => /^paginate\s*:/i.test(line));
  if (anchor >= 0) head.splice(anchor + 1, 0, ...identity);
  else head.splice(head.length - 1, 0, ...identity);
  if (!hadMarpTrue) head.splice(1, 0, "marp: true");
  const body = lines.slice(frontmatterEnd + 1).join("\n");
  const bodyWithSpec = /<!--\s*clio-deck\s*:/i.test(body) ? body : `\n${specLine}\n${body}`;
  return `${head.join("\n")}\n${bodyWithSpec}`.trimEnd() + "\n";
}

function compactMarpPlanningLine(value, maxLength = 180) {
  const text = stripMarkdownInlineSyntax(String(value || ""))
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function extractMarpSourceSections(markdown, limit = 8) {
  const lines = stripSlidesSourceFrontmatter(markdown);
  const sections = [];
  let current = null;

  lines.forEach((line) => {
    const heading = String(line || "").match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      current = { title: compactMarpPlanningLine(heading[2], 80), lines: [] };
      sections.push(current);
      return;
    }
    if (!current) current = { title: "", lines: [] };
    if (!sections.includes(current)) sections.push(current);
    if (current.lines.length < 3) {
      const compact = compactMarpPlanningLine(line, 160);
      if (compact) current.lines.push(compact);
    }
  });

  return sections
    .filter((section) => section.title || section.lines.length)
    .slice(0, limit)
    .map((section, index) => {
      const title = section.title || `Opening material ${index + 1}`;
      const evidence = section.lines.slice(0, 2).join(" / ");
      return `- ${title}${evidence ? `: ${evidence}` : ""}`;
    })
    .join("\n");
}

function extractMarpStorySignals(markdown, pattern, limit = 5) {
  return normalizeMarkdownText(markdown)
    .split("\n")
    .map((line) => compactMarpPlanningLine(line, 150))
    .filter((line) => line && pattern.test(line))
    .slice(0, limit);
}

function inferMarpMaterialType(title, sourceText) {
  const text = `${title}\n${sourceText}`;
  if (/B\s*站|bilibili|视频|口播|提词|镜头|UP\s*主|up\s*主|观众/i.test(text)) return "video script";
  if (/API|SDK|架构|接口|部署|代码|algorithm|database|server|client/i.test(text)) return "technical explanation";
  if (/复盘|进展|里程碑|风险|roadmap|status|OKR|KPI/i.test(text)) return "project report";
  if (/课程|教学|练习|workshop|training|lecture/i.test(text)) return "teaching material";
  return "essay or briefing";
}

function inferMarpPurpose(materialType, sourceText) {
  if (materialType === "video script") return "earn attention quickly, then deliver a memorable explanation";
  if (/为什么|why|选择|建议|应该|must|need|problem|痛点/i.test(sourceText)) return "persuade the audience around a clear problem and answer";
  if (/步骤|如何|how to|指南|教程|流程/i.test(sourceText)) return "teach a process that the audience can repeat";
  if (/数据|结果|发现|evidence|case|example|study/i.test(sourceText)) return "explain findings and their implication";
  return "turn the source into a concise, coherent argument";
}

function inferMarpAudience(title, sourceText, materialType) {
  const text = `${title}\n${sourceText}`;
  if (/平台|工程|开发|API|SDK|代码|架构|engineering|developer/i.test(text)) return "technical readers who know the domain but need the story";
  if (/用户|客户|市场|增长|产品|business|sales|customer/i.test(text)) return "product or business readers who need stakes and decisions";
  if (/学生|初学|课程|workshop|training|lecture/i.test(text)) return "learners who need plain steps and examples";
  if (materialType === "video script") return "online viewers with limited patience for slow setup";
  return "general informed readers";
}

function buildMarpStoryPassSummary(source) {
  const title = source.name || markdownDocumentTitle(source.markdown) || t("untitled");
  const sourceText = normalizeMarkdownText(source.markdown);
  const words = countMarkdownWords(sourceText);
  const materialType = inferMarpMaterialType(title, sourceText);
  const isVideo = materialType === "video script";
  const targetSlides = Math.max(5, Math.min(14, Math.ceil(words / (isVideo ? 90 : 120)) + 3));
  const sections = extractMarpSourceSections(sourceText);
  const evidence = extractMarpStorySignals(sourceText, /\d|%|数据|证据|案例|引用|表格|图|code|```|example|case/i, 5);
  const keyPoints = extractMarpStorySignals(sourceText, /^#{1,3}\s|^[-*+]\s|^\d+[.)]\s/, 5);
  return [
    "Story Pass (automatic; do not interview the user or ask for confirmation):",
    `Working title: ${compactMarpPlanningLine(title, 120)}`,
    `Material type: ${materialType}`,
    `Inferred audience: ${inferMarpAudience(title, sourceText, materialType)}`,
    `Inferred purpose: ${inferMarpPurpose(materialType, sourceText)}`,
    `Suggested length: about ${targetSlides} slides; use fewer if the source is thin.`,
    "Recommended arc:",
    isVideo
      ? "1. hook in the first 20 seconds, 2. viewer problem, 3. compact explanation, 4. example/proof, 5. callback ending"
      : "1. title/promise, 2. problem, 3. core idea, 4. evidence or example, 5. implication, 6. closing callback",
    "Likely key points:",
    keyPoints.length ? keyPoints.map((point) => `- ${point}`).join("\n") : "- Infer 3 to 5 key points from the strongest headings and paragraphs.",
    "Available evidence or assets:",
    evidence.length ? evidence.map((item) => `- ${item}`).join("\n") : "- No obvious numeric, quoted, visual, or code evidence found; stay close to the source text.",
    "Source sections to preserve:",
    sections || "- No clear sections found; infer a concise deck from the strongest paragraphs.",
  ].join("\n");
}

function buildMarpDeckPlanSummary(source) {
  return buildMarpStoryPassSummary(source);
}

function buildMarpSkillPrompt(source) {
  const title = source.name || markdownDocumentTitle(source.markdown) || t("untitled");
  if (source.demoBrief) {
    return [
      resolveWritingRoutePrompt("other-apps.marp-demo-deck"),
      "",
      slideDeckPromptBrief(source.deckSpec),
      "",
      "---",
      "marp: true",
      "theme: default",
      "paginate: true",
      "size: 16:9",
      clioMarpStyleBlock(),
      "---",
      "",
      "Rules:",
      "- 只做 3-5 页。",
      "- 第一页给开场反差或核心判断。",
      "- 中间 2-3 页讲痛点、使用体验、购买建议。",
      "- 每页只放 1 个主句或 2-3 个短 bullet。",
      "- 不编造来源之外的信息。",
      "",
      `SOURCE TITLE:\n${title}`,
      "",
      `SOURCE MARKDOWN:\n${clipContextContent(source.markdown, 2600)}`,
    ].join("\n");
  }
  const plan = buildMarpDeckPlanSummary(source);
  return [
    resolveWritingRoutePrompt("other-apps.marp-deck"),
    "",
    slideDeckPromptBrief(source.deckSpec),
    "",
    // With a deck spec the era's stylesheet is applied after generation
    // (ensureClioMarpVisualStyle -> restyle), so sending ten kilobytes of CSS
    // for the model to copy only crowded the source out of a small context.
    ...(source.deckSpec
      ? ["Required frontmatter (the app adds the visual style itself; write no CSS):", "---", "marp: true", "theme: default", "paginate: true", "size: 16:9", "---"]
      : ["Required frontmatter. Include this exact style block unless you have a strong reason to add only more CSS:", "---", "marp: true", "theme: default", "paginate: true", "size: 16:9", clioMarpStyleBlock(), "---"]),
    "",
    "DECK PLAN:",
    plan,
    "",
    "Grounding:",
    "- Every number on a slide must be a number the source writes. Do not compute differences, ratios or totals.",
    "- When a page compares numbers, use the evidence, metric or table layout and put the source's numbers in a GFM table; the app draws the chart from it.",
    "- About a third of the pages should be drawn: a sequence in time as a timeline page (a list of `**when** what`), two sides as a columns page (two `###` headings, each with a short list), numbers as a table. The app turns these into drawings.",
    "- A quote page quotes the source word for word, with who said it.",
    "- Give every content slide a speaker note naming the source passage it rests on: `<!-- notes: 来源：「…」 -->`.",
    "",
    `SOURCE TITLE:\n${title}`,
    "",
    `SOURCE MARKDOWN:\n${marpSourceForPrompt(source.markdown)}`,
  ].join("\n");
}

function buildMarpRepairPrompt(source, draft, validation, { aiSlides = false } = {}) {
  const details = (validation?.errors || []).join(", ") || "invalid_marp";
  return [
    resolveWritingRoutePrompt("other-apps.marp-repair"),
    aiSlides
      ? "如果某一页为空，请根据来源材料补成有内容的一页，或合并到相邻页；不要只删除到少于合理页数。"
      : "如果某一页为空，请根据来源材料补成有内容的一页，或合并到相邻页；演示简版保持 3-5 页。",
    "不要编造来源之外的信息。",
    "invented_number：把该页里原文没有的数字改回原文数字或删掉，不要自己计算差值、比例或合计。quote_not_verbatim：引文改成原文原话，或改用别的版式。",
    "",
    `VALIDATION ERRORS:\n${details}`,
    "",
    `SOURCE TITLE:\n${source.name || t("untitled")}`,
    "",
    `SOURCE MARKDOWN:\n${marpSourceForPrompt(source.markdown || "")}`,
    "",
    "DRAFT TO REPAIR:",
    normalizeMarkdownText(draft || "").trim(),
  ].join("\n");
}

function validateMarpSkillMarkdown(markdown, sourceMarkdown = "") {
  const text = normalizeMarkdownText(markdown).trim();
  const errors = [];
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") errors.push("missing_frontmatter");

  let frontmatterEnd = -1;
  if (lines[0]?.trim() === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === "---") {
        frontmatterEnd = index;
        break;
      }
    }
  }
  if (frontmatterEnd < 0) errors.push("missing_frontmatter_close");
  const frontmatter = frontmatterEnd > 0 ? lines.slice(1, frontmatterEnd).join("\n") : "";
  if (!/^marp\s*:\s*true\s*$/im.test(frontmatter)) errors.push("missing_marp_true");
  if (!/^theme\s*:\s*(default|gaia|uncover)\s*$/im.test(frontmatter)) errors.push("missing_theme");
  if (!/^paginate\s*:\s*true\s*$/im.test(frontmatter)) errors.push("missing_paginate");
  if (!/^size\s*:\s*(16:9|4:3)\s*$/im.test(frontmatter)) errors.push("missing_size");

  const body = frontmatterEnd >= 0 ? lines.slice(frontmatterEnd + 1).join("\n").trim() : "";
  if (!body) errors.push("empty_deck");
  if (!/(^|\n)---(\n|$)/.test(body)) errors.push("missing_slide_separator");
  if (/```[\s\S]*$/.test(body.replace(/```[\s\S]*?```/g, ""))) errors.push("unclosed_code_block");
  const split = splitMarpSlidesForValidation(text);
  if (split.emptySlides.length) errors.push(`empty_slide:${split.emptySlides.join(",")}`);
  if (split.unclosedFence && !errors.includes("unclosed_code_block")) errors.push("unclosed_code_block");

  const sourceWords = countMarkdownWords(sourceMarkdown || text);
  const slideCount = body
    ? body.split(/\n---\n/g).map((slide) => slide.trim()).filter(Boolean).length
    : 0;
  const minSlides = sourceWords > 260 ? 2 : 1;
  const maxSlides = Math.max(4, Math.min(48, Math.ceil(sourceWords / 35) + 4));
  if (slideCount < minSlides || slideCount > maxSlides) errors.push(`unreasonable_slide_count:${slideCount}`);
  return withSlideDeckGate({ ok: errors.length === 0, errors, slideCount }, text, true);
}

function marpSkillValidationErrorLabel(error) {
  const zh = currentLanguage === "zh";
  if (error === "missing_frontmatter") return zh ? "缺少 Marp frontmatter 开头" : "Missing Marp frontmatter";
  if (error === "missing_frontmatter_close") return zh ? "frontmatter 没有闭合" : "Frontmatter is not closed";
  if (error === "missing_marp_true") return zh ? "缺少 marp: true" : "Missing marp: true";
  if (error === "missing_theme") return zh ? "缺少有效 theme" : "Missing valid theme";
  if (error === "missing_paginate") return zh ? "缺少 paginate: true" : "Missing paginate: true";
  if (error === "missing_size") return zh ? "缺少有效 size" : "Missing valid size";
  if (error === "empty_deck") return zh ? "没有 slide 内容" : "No slide content";
  if (error === "missing_slide_separator") return zh ? "缺少 slide 分隔线 ---" : "Missing slide separators";
  if (error === "unclosed_code_block") return zh ? "代码块没有闭合" : "Code block is not closed";
  if (error.startsWith("invented_number:")) {
    const pages = error.split(":")[1] || "";
    return zh ? `第 ${pages} 页有原文里没有的数字` : `Slide ${pages} states numbers the source does not`;
  }
  if (error.startsWith("quote_not_verbatim:")) {
    const pages = error.split(":")[1] || "";
    return zh ? `第 ${pages} 页的引文不是原话` : `The quote on slide ${pages} is not the source's own words`;
  }
  if (error.startsWith("empty_slide:")) {
    const pages = error.split(":")[1] || "";
    return zh ? `存在空白 slide：${pages}` : `Empty slide found: ${pages}`;
  }
  if (error.startsWith("unreasonable_slide_count:")) {
    const count = error.split(":")[1] || "0";
    return zh ? `页数看起来不合理：${count} 页` : `Slide count looks unreasonable: ${count}`;
  }
  // The deck gate's codes are shared with the slides validator, so their label
  // lives in one place rather than being written twice.
  return slidesValidationErrorLabel(error);
}

function formatMarpSkillValidationError(validation) {
  const zh = currentLanguage === "zh";
  const details = (validation?.errors || []).map(marpSkillValidationErrorLabel).join(zh ? "；" : "; ");
  return zh
    ? `Marp Markdown 未通过本地校验：${details || "格式不符合要求"}。原稿未被覆盖。`
    : `Marp Markdown did not pass local validation: ${details || "invalid format"}. Original document was not changed.`;
}

function createMarpSkillTeachTextDocument(markdown, source) {
  if (!getActiveProject()) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return null;
  }

  const folder = ensureFolder(source.folder || preferredFolderName());
  const now = new Date().toISOString();
  const name = nextAvailableFileName(`${slidesFileBaseName(source.name)}.slides.md`, folder.id);
  const file = {
    id: crypto.randomUUID(),
    projectId: activeProjectId,
    type: "text",
    name,
    folderId: folder.id,
    body: normalizeMarkdownText(markdown).trimEnd() + "\n",
    source: "Marp",
    // A deck is its own kind of object: it opens in ClioStage, not TeachText.
    artifactKind: "slides",
    durable: true,
    label: "ai",
    createdAt: now,
    updatedAt: now,
  };

  chatFiles.unshift(file);
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
  return file;
}

// --- grounding the deck ----------------------------------------------------
// A deck is the writer's material rearranged, so it may not say more than the
// material did. Two gates join the structural ones and feed the same repair
// loop: every number on a page must be a number the source wrote, and a quote
// page must quote the source word for word. Numbers that only count or order
// things (a "3" in "three reasons", a divider's "02") are left alone.

const MARP_SMALL_ORDINAL_MAX = 12;

function marpDeckVisibleText(page) {
  return String(page || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^\s*(?:\d+[.)]|[-*+])\s+/gm, "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function marpDeckGroundingErrors(markdown, sourceMarkdown) {
  const runtime = slideDeckRuntime();
  const chart = window.AISystem6ClioChart;
  if (!runtime || !chart?.numbersIn || !String(sourceMarkdown || "").trim()) return [];
  const sourceValues = new Set(chart.numbersIn(sourceMarkdown));
  const foldedSource = chart.fold(sourceMarkdown).replace(/[「」“”"『』]/g, "");
  const invented = [];
  const misquoted = [];
  runtime.pages(markdown).forEach((page) => {
    if (page.empty) return;
    const visible = marpDeckVisibleText(page.page);
    const stray = chart.numbersIn(visible).filter((value) => (
      !sourceValues.has(value) && !(Number.isInteger(value) && value <= MARP_SMALL_ORDINAL_MAX)
    ));
    if (stray.length) invented.push(page.index);
    if (page.layout === "quote") {
      const quoted = page.page.split(/\r?\n/)
        .filter((line) => /^\s*>/.test(line))
        .map((line) => line.replace(/^\s*>\s?/, "").replace(/[*_`]/g, ""))
        .join(" ");
      const folded = chart.fold(quoted).replace(/[「」“”"『』]/g, "");
      if (folded && !foldedSource.includes(folded)) misquoted.push(page.index);
    }
  });
  return [
    invented.length ? `invented_number:${invented.join(",")}` : "",
    misquoted.length ? `quote_not_verbatim:${misquoted.join(",")}` : "",
  ].filter(Boolean);
}

// An evidence, metric or table page that carries a Markdown table gets the
// drawing ClioChart would make of it, in the deck's own ink, and becomes an
// evidence page — the layout built for a picture and its one-line reading, and
// the only one that sizes a picture to the page. The table stays in the page
// as a provenance comment, the same shape "Send to ClioStage" writes.
function marpDeckChartPages(markdown, spec, sourceText = "") {
  const runtime = slideDeckRuntime();
  const chart = window.AISystem6ClioChart;
  if (!runtime || !chart?.findTables || !chart?.projectionSvg) return markdown;
  const era = runtime.byId(spec?.era || runtime.defaultSpec().era);
  const tokens = era?.tokens || {};
  const palette = {
    ink: tokens.ink || "#111111",
    tint: tokens.tint || "#e8e8e8",
    muted: tokens.muted || tokens.ink || "#333333",
    paper: "transparent",
    body: tokens.body || "",
  };
  let next = String(markdown || "");
  const diagramApi = window.AISystem6ClioDiagram;
  runtime.pages(markdown).forEach((page) => {
    // A timeline page and a two-sided page are drawn as concept drawings: the
    // page's own items become boxes, and the drawing rides along as data so a
    // double-click opens it on the canvas.
    if (diagramApi && ["timeline", "columns", "duo-compare", "contrast"].includes(page.layout) && !/!\[[^\]]*\]\(/.test(page.page)) {
      const diagram = diagramApi.fromSlidePage(page.page, page.layout, sourceText);
      if (!diagram) return;
      const lines = page.page.split("\n");
      const keep = lines.filter((line) => /^\s*<!--/.test(line) || /^#{1,2}\s/.test(line));
      const heading = (lines.find((line) => /^#{1,2}\s/.test(line)) || "").replace(/^#{1,2}\s+/, "").replace(/[*_`[\]]/g, "");
      const svg = diagramApi.svg(diagram, palette, { fit: true });
      const redrawn = [
        ...keep.map((line) => line.replace(/(<!--\s*_class:\s*)(?:timeline|columns|duo-compare|contrast)\b/, "$1evidence")),
        "",
        window.AISystem6EditEmbeds.embedMarkdown({ kind: "diagram", alt: heading || t("clio_chart_label"), svg, data: diagram }),
      ].join("\n");
      const at = next.indexOf(page.page);
      if (at >= 0) next = `${next.slice(0, at)}${redrawn}${next.slice(at + page.page.length)}`;
      return;
    }
    if (!["evidence", "metric", "table"].includes(page.layout)) return;
    const found = chart.findTables(page.page)[0];
    if (!found) return;
    const heading = (page.page.match(/^#{1,3}\s+(.+)$/m) || [])[1] || "";
    const table = chart.orientForChart(found.table);
    const svg = chart.projectionSvg(table, chart.deckProjection(table), palette, { omitHeading: !!heading, fit: true });
    // The page's table becomes an editable copy beside its picture.
    const drawing = window.AISystem6EditEmbeds.embedMarkdown({ kind: "chart", alt: heading.replace(/[*_`[\]]/g, "") || t("clio_chart_label"), svg, data: { markdown: found.text } });
    const redrawn = page.page
      .replace(found.text, () => drawing)
      .replace(/(<!--\s*_class:\s*)(?:metric|table)\b/, "$1evidence");
    const at = next.indexOf(page.page);
    if (at >= 0) next = `${next.slice(0, at)}${redrawn}${next.slice(at + page.page.length)}`;
  });
  return next;
}

// The model reads at most this much source. A long text is cut at a paragraph
// boundary and says so, rather than being flattened into one excerpt line.
const MARP_SOURCE_BUDGET = 16000;

function marpSourceForPrompt(markdown) {
  const text = String(markdown || "");
  if (text.length <= MARP_SOURCE_BUDGET) return text;
  const cut = text.lastIndexOf("\n\n", MARP_SOURCE_BUDGET);
  return `${text.slice(0, cut > MARP_SOURCE_BUDGET / 2 ? cut : MARP_SOURCE_BUDGET).trimEnd()}\n\n[…]`;
}

// Any text to a deck, in one step. The deck opens in ClioStage as a temporary
// draft — nothing is written to the project until the writer saves it — and a
// failed run leaves a Retry in the window instead of a dead end.
async function generateMarpMarkdownAndOpenClioStage(sourceOverride = null) {
  const source = sourceOverride?.markdown
    ? {
      markdown: sourceOverride.markdown,
      name: sourceOverride.title || sourceOverride.name || t("untitled"),
      folder: sourceOverride.folder || preferredFolderName(),
      demoBrief: !!sourceOverride.demoBrief,
      maxTokens: sourceOverride.maxTokens,
    }
    : marpSkillSourceFromTeachText();
  if (!source.markdown.trim()) {
    setStatus(t("teachtext_empty"));
    return null;
  }
  const runtime = slideDeckRuntime();
  // One click means no setup sheet: the remembered deck (or the default).
  // The era can be changed afterwards from ClioStage's Restyle menu.
  const spec = runtime ? runtime.storedSetup() : null;
  const planned = { ...source, deckSpec: spec };
  const retrySource = { markdown: source.markdown, title: source.name, folder: source.folder, demoBrief: source.demoBrief, maxTokens: source.maxTokens };
  await ensureClioStageModule();
  await ensureClioChartModule();
  const stage = window.AISystem6ClioStage;
  if (stage?.confirmDiscard && !(await stage.confirmDiscard())) return null;
  if (!beginLongTask("marp-slides", t("clio_stage_generating", source.name))) return null;
  stage?.showPending?.({ label: source.name, retry: () => generateMarpMarkdownAndOpenClioStage(retrySource) });
  const fail = (message) => {
    markActiveLongTaskFailed(message);
    setStatus(message);
    pushSystemNotification(message, { state: "failed", windowName: "clioStage" });
    stage?.showFailed?.(message);
    return null;
  };
  try {
    let markdown = "";
    let validation = null;
    let prompt = buildMarpSkillPrompt(planned);
    let streamShownAt = 0;
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const result = await sendToLmStudio(prompt, getLongTaskSignal(), {
        maxTokens: Number.isFinite(planned.maxTokens) ? planned.maxTokens : 3600,
        temperature: attempt === 0 ? 0.18 : 0.08,
        skipContext: true,
        taskKind: "marp",
        // Streamed: a long deck from a slow local model would otherwise be cut
        // off by the first-response deadline before its first token arrived.
        streamPreference: "stream",
        // Pages appear in ClioStage as the model closes them.
        onToken: (partial) => {
          const now = Date.now();
          if (now - streamShownAt < 400) return;
          streamShownAt = now;
          stage?.showStreaming?.(String(partial || "").replace(/^\s*```(?:markdown|md|marp)?\s*\n/i, ""), { label: source.name });
        },
      });
      markdown = ensureClioMarpVisualStyle(cleanMarpSkillModelOutput(result), spec);
      validation = validateMarpSkillMarkdown(markdown, planned.markdown);
      const grounding = marpDeckGroundingErrors(markdown, planned.markdown);
      if (grounding.length) validation = { ...validation, ok: false, errors: [...(validation.errors || []), ...grounding] };
      if (validation.ok || attempt === maxAttempts - 1) break;
      prompt = buildMarpRepairPrompt(planned, markdown, validation, { aiSlides: !planned.demoBrief });
    }
    if (!validation.ok) return fail(formatMarpSkillValidationError(validation));

    markdown = marpDeckChartPages(markdown, spec, planned.markdown);
    const opened = await stage?.open({
      title: `${slidesFileBaseName(source.name)}.slides.md`,
      markdown,
      sourceKind: "generated",
      temporary: true,
      sourceLabel: source.name,
      // Kept for the gates a later one-line edit runs.
      sourceText: planned.markdown,
      saveTarget: { name: source.name, folder: source.folder },
    });
    if (opened === false) return fail(t("clio_stage_open_failed"));
    setStatus(t("clio_stage_generated_temporary", source.name));
    return { temporary: true, name: source.name, markdown };
  } catch (error) {
    if (isAbortError(error)) {
      stage?.showFailed?.(t("stopped"));
      return null;
    }
    return fail(currentLanguage === "zh"
      ? `幻灯片生成失败：${error.message}。原稿未被改动。`
      : `Slide generation failed: ${error.message}. The source was not changed.`);
  } finally {
    endLongTask("marp-slides");
  }
}

// The one-click entry every source shares: DocMap's readiness rules pick the
// selection or the whole text, then the deck is drafted from it.
function makeClioStageDeckFromSource(preferredContext = null, options = {}) {
  const readiness = options.readiness || resolveDocMapReadiness(preferredContext, {
    rangeMode: options.rangeMode || "auto",
    minSelectionChars: clioStageMinSourceChars,
    minDocumentChars: clioStageMinSourceChars,
  });
  const source = readiness?.source;
  if (!source?.text) {
    openWindow("clioStage");
    setStatus(t("clio_stage_no_text"));
    return null;
  }
  if (!readiness.ready) {
    setStatus(t("clio_stage_too_short"));
    return null;
  }
  return generateMarpMarkdownAndOpenClioStage({
    markdown: source.text,
    title: source.label || t("untitled"),
    folder: preferredFolderName(),
  });
}

// Saving a temporary deck is the writer's step: the same *.slides.md document
// the old path wrote at once, written now only when asked for.
function saveTemporaryClioStageDeck(markdown, target = {}) {
  return createMarpSkillTeachTextDocument(markdown, {
    name: target.name || t("untitled"),
    folder: target.folder || preferredFolderName(),
  });
}

async function printActiveMarkdownToSlidesAi() {
  const source = slidesSourceFromActiveWindow();
  if (!source.markdown.trim()) {
    setStatus(t("teachtext_empty"));
    return null;
  }
  const runtime = slideDeckRuntime();
  const spec = runtime ? await runtime.chooseSetup() : null;
  if (!spec) return null;
  const planned = { ...source, deckSpec: spec };
  if (!beginLongTask("ai-slides", "AI is drafting slides...")) return null;
  try {
    let markdown = "";
    let validation = null;
    let prompt = buildAiSlidesPrompt(planned);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await sendToLmStudio(prompt, getLongTaskSignal(), {
        maxTokens: 2600,
        temperature: attempt === 0 ? 0.18 : 0.08,
        skipContext: true,
        taskKind: "slides",
        streamPreference: "none",
      });
      markdown = ensureClioMarpVisualStyle(normalizeMarkdownText(result).trim(), spec);
      validation = validateMarpSlidesMarkdown(markdown, planned.markdown);
      if (validation.ok) break;
      prompt = buildMarpRepairPrompt(planned, markdown, validation, { aiSlides: true });
    }
    if (!validation.ok) {
      const message = formatSlidesValidationError(validation);
      markActiveLongTaskFailed(message);
      setStatus(message);
      pushSystemNotification(message, { state: "failed" });
      return null;
    }
    openTemporarySlidesDocument(markdown, planned.name);
    return markdown;
  } catch (error) {
    if (!isAbortError(error)) {
      const message = currentLanguage === "zh"
        ? `AI slides 草稿生成失败：${error.message}。原稿未被覆盖。`
        : `AI slides draft failed: ${error.message}. Original document was not changed.`;
      markActiveLongTaskFailed(message);
      setStatus(message);
      pushSystemNotification(message, { state: "failed" });
    }
    return null;
  } finally {
    endLongTask("ai-slides");
  }
}

function printActiveMarkdownToSlides() {
  // Kept as the synchronous converter; the gate lives in the menu wrapper so
  // every caller still reaches the same one implementation.
  const source = slidesSourceFromActiveWindow();
  if (!source.markdown.trim()) {
    setStatus(t("teachtext_empty"));
    return null;
  }
  return createEditableSlidesDocument(source);
}

// The three generation entry points share one gate: two questions the desk
// cannot invent. Cancelling leaves the desk exactly as it was.
async function printSlidesWithSetup() {
  const runtime = slideDeckRuntime();
  const spec = runtime ? await runtime.chooseSetup() : null;
  if (!spec) return null;
  const source = slidesSourceFromActiveWindow();
  if (!source.markdown.trim()) {
    setStatus(t("teachtext_empty"));
    return null;
  }
  return createEditableSlidesDocument({ ...source, deckSpec: spec });
}
