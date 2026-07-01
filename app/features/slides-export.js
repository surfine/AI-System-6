// Feature module: Markdown to Marp-style slides export.

// Lazy-loaded by the Print to Slides action; shares the AI System 6 global scope.

window.AISystem6SlidesExportLoaded = true;

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

function markdownToMarpSlides(markdown) {
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
    .map((slide) => slide.join("\n").trimEnd())
    .filter(Boolean)
    .join("\n\n---\n\n");

  return `${marpSlidesFrontmatter}\n\n${body}`.trimEnd() + "\n";
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
  return { ok: errors.length === 0, errors, slideCount };
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
    body: markdownToMarpSlides(source.markdown),
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
    "你是 AI System 6 的中文演示文稿转换器。请把下面的 Markdown 转成 Marp-style slides.md。",
    "Return only Marp-style Markdown. Do not wrap it in a code fence. Do not add explanations.",
    "不要编造来源中没有的事实、观点、数字、名字、例子或结论。",
    "The output must start with frontmatter containing exactly these required keys: marp: true, theme: default, paginate: true, size: 16:9.",
    "Use a line containing only --- to separate slides.",
    "Do not put slide separators inside code blocks.",
    "每页放 1 个主要意思，最多 3 到 5 个短项目符号。中文要短、清楚、有节奏，避免长句堆叠。",
    "只在代码对内容重要时保留代码块。适合时使用来源标题作为封面页。",
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

function clioMarpStyleBlock() {
  return marpSlidesFrontmatter
    .split("\n")
    .slice(5, -1)
    .join("\n");
}

function ensureClioMarpVisualStyle(markdown) {
  const text = normalizeMarkdownText(markdown).trimEnd();
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") {
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

  let frontmatterEnd = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      frontmatterEnd = index;
      break;
    }
  }
  if (frontmatterEnd < 0) return `${text}\n`;

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

  const nextLines = [
    ...lines.slice(0, frontmatterEnd),
    clioMarpStyleBlock(),
    ...lines.slice(frontmatterEnd),
  ];
  return nextLines.join("\n").trimEnd() + "\n";
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
      "你是 AI System 6 的中文演示文稿转换器。请把来源 Markdown 快速改成 3-5 页 Marp-compatible Markdown，用于录屏演示成稿复用。",
      "Return only Markdown. Do not wrap the answer in a code fence. Do not add explanations.",
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
    "你是 AI System 6 的中文演示文稿编辑。请基于来源 Markdown 创建一份专业的 Marp-compatible Markdown 演示文稿。",
    "这不是机械切分 Markdown。请先理解材料叙事，再写成一套有推进感的 deck。",
    "The process must be effortless for the user: do not interview, ask questions, request confirmation, or add a visible planning form.",
    "Follow Marp syntax exactly.",
    "Return only Markdown. Do not wrap the answer in a code fence. Do not add explanations.",
    "",
    "Required frontmatter. Include this exact style block unless you have a strong reason to add only more CSS:",
    "---",
    "marp: true",
    "theme: default",
    "paginate: true",
    "size: 16:9",
    clioMarpStyleBlock(),
    "---",
    "",
    "Deck planning rules:",
    "- 使用下方 deck plan 作为脚手架，但如果来源明显需要更好的叙事结构，可以调整。",
    "- 第一页要是钩子、承诺或问题，不要只是文件名。",
    "- 形成清楚推进：钩子/承诺 -> 张力 -> 解释 -> 证据/例子 -> takeaway/callback。",
    "- 自动安排视觉节奏，不要让每一页都长得一样；根据内容混用 lead, divider, quote, contrast, evidence, takeaway 等 Marp class。",
    "- Use <!-- _class: lead --> for the opening hook, <!-- _class: divider --> for section turns, <!-- _class: quote --> for a memorable line, <!-- _class: evidence --> for proof/detail, and <!-- _class: takeaway --> for the final callback.",
    "- Use <!-- header: Section / Topic --> sparingly to give the deck a breadcrumb when sections change.",
    "- 如果是 B 站或视频脚本材料，前 3 到 4 页要像视频前 20 秒：快速给兴趣点、问题、反差或承诺。",
    "- 优先使用面向观众的问题和具体利害关系，不要用泛泛章节名。",
    "- 细节太密时，把它放进 speaker notes 注释，不要堆在页面上。",
    "- Make a first draft the user can react to immediately; prioritize a coherent story over preserving the source order.",
    "- Include concise speaker notes when useful with <!-- notes: ... -->, especially for evidence, caveats, transitions, and details that would crowd the slide.",
    "",
    "Marp writing rules:",
    "- Use a line containing only --- to separate slides.",
    "- Use # for the title slide and ## for regular slides.",
    "- Use <!-- _paginate: false --> before the title slide and before section divider slides.",
    "- Put one main idea on each slide.",
    "- Keep each slide concise: one strong sentence, or 2 to 4 short bullets.",
    "- Use slide patterns such as hook, question, contrast, sequence, example, quote, recap, and closing callback.",
    "- Use **bold** sparingly to create one visual focal point per slide.",
    "- Avoid long lists; split dense material into several slides.",
    "- Preserve code blocks only when essential, and never put slide separators inside code blocks.",
    "- Do not invent facts, claims, names, numbers, examples, images, sources, or conclusions not present in the source.",
    "- Do not output literal instructions, placeholder labels, or commentary about Marp.",
    "- Do not show deck-planning notes as visible slide text.",
    "- If you add speaker notes, use HTML comments like <!-- notes: ... --> so the slide stays clean.",
    "- Use the same language as the source unless the source clearly asks otherwise.",
    "",
    "DECK PLAN:",
    plan,
    "",
    `SOURCE TITLE:\n${title}`,
    "",
    `SOURCE MARKDOWN:\n${source.markdown}`,
  ].join("\n");
}

function buildMarpRepairPrompt(source, draft, validation, { aiSlides = false } = {}) {
  const details = (validation?.errors || []).join(", ") || "invalid_marp";
  return [
    "你是 AI System 6 的 Marp Markdown 修复器。请只修复下面这份 slides.md 的格式和分页错误。",
    "Return only corrected Marp Markdown. Do not wrap it in a code fence. Do not explain.",
    "必须保留 frontmatter，并保留 marp: true, theme, paginate, size。",
    "每一页必须有真实可见内容；不要输出空白 slide；不要连续输出 ---；不要在末尾多放一个 ---。",
    aiSlides
      ? "如果某一页为空，请根据来源材料补成有内容的一页，或合并到相邻页；不要只删除到少于合理页数。"
      : "如果某一页为空，请根据来源材料补成有内容的一页，或合并到相邻页；演示简版保持 3-5 页。",
    "不要编造来源之外的信息。",
    "",
    `VALIDATION ERRORS:\n${details}`,
    "",
    `SOURCE TITLE:\n${source.name || t("untitled")}`,
    "",
    `SOURCE MARKDOWN:\n${clipContextContent(source.markdown || "", 3200)}`,
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
  return { ok: errors.length === 0, errors, slideCount };
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
  if (error.startsWith("empty_slide:")) {
    const pages = error.split(":")[1] || "";
    return zh ? `存在空白 slide：${pages}` : `Empty slide found: ${pages}`;
  }
  if (error.startsWith("unreasonable_slide_count:")) {
    const count = error.split(":")[1] || "0";
    return zh ? `页数看起来不合理：${count} 页` : `Slide count looks unreasonable: ${count}`;
  }
  return error;
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
  if (!beginLongTask("marp-slides", currentLanguage === "zh" ? "正在生成 Marp Markdown..." : "Generating Marp Markdown...")) return null;
  try {
    let markdown = "";
    let validation = null;
    let prompt = buildMarpSkillPrompt(source);
    const maxAttempts = source.demoBrief ? 3 : 2;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const result = await sendToLmStudio(prompt, getLongTaskSignal(), {
        maxTokens: Number.isFinite(source.maxTokens) ? source.maxTokens : 3200,
        temperature: attempt === 0 ? 0.18 : 0.08,
        skipContext: true,
        taskKind: "marp",
        streamPreference: "none",
      });
      markdown = ensureClioMarpVisualStyle(cleanMarpSkillModelOutput(result));
      validation = validateMarpSkillMarkdown(markdown, source.markdown);
      if (validation.ok) break;
      prompt = buildMarpRepairPrompt(source, markdown, validation);
    }
    if (!validation.ok) {
      const message = formatMarpSkillValidationError(validation);
      markActiveLongTaskFailed(message);
      setStatus(message);
      await showSystemModal(message, "alert");
      return null;
    }

    const file = createMarpSkillTeachTextDocument(markdown, source);
    if (!file) return null;
    await ensureClioStageModule();
    await window.AISystem6ClioStage?.open({
      title: file.name,
      markdown: file.body,
      sourceKind: "teachText",
      sourceItemId: file.id,
    });
    setStatus(currentLanguage === "zh"
      ? `已生成 Marp Markdown 并在 ClioStage 打开：${file.name}`
      : `Marp Markdown generated and opened in ClioStage: ${file.name}`);
    return file;
  } catch (error) {
    if (!isAbortError(error)) {
      const message = currentLanguage === "zh"
        ? `Marp Markdown 生成失败：${error.message}。原稿未被覆盖。`
        : `Marp Markdown generation failed: ${error.message}. Original document was not changed.`;
      markActiveLongTaskFailed(message);
      setStatus(message);
      await showSystemModal(message, "alert");
    }
    return null;
  } finally {
    endLongTask("marp-slides");
  }
}

async function printActiveMarkdownToSlidesAi() {
  const source = slidesSourceFromActiveWindow();
  if (!source.markdown.trim()) {
    setStatus(t("teachtext_empty"));
    return null;
  }
  if (!beginLongTask("ai-slides", "AI is drafting slides...")) return null;
  try {
    let markdown = "";
    let validation = null;
    let prompt = buildAiSlidesPrompt(source);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await sendToLmStudio(prompt, getLongTaskSignal(), {
        maxTokens: 2600,
        temperature: attempt === 0 ? 0.18 : 0.08,
        skipContext: true,
        taskKind: "slides",
        streamPreference: "none",
      });
      markdown = normalizeMarkdownText(result).trim() + "\n";
      validation = validateMarpSlidesMarkdown(markdown, source.markdown);
      if (validation.ok) break;
      prompt = buildMarpRepairPrompt(source, markdown, validation, { aiSlides: true });
    }
    if (!validation.ok) {
      const message = formatSlidesValidationError(validation);
      markActiveLongTaskFailed(message);
      setStatus(message);
      await showSystemModal(message, "alert");
      return null;
    }
    openTemporarySlidesDocument(markdown, source.name);
    return markdown;
  } catch (error) {
    if (!isAbortError(error)) {
      const message = currentLanguage === "zh"
        ? `AI slides 草稿生成失败：${error.message}。原稿未被覆盖。`
        : `AI slides draft failed: ${error.message}. Original document was not changed.`;
      markActiveLongTaskFailed(message);
      setStatus(message);
      await showSystemModal(message, "alert");
    }
    return null;
  } finally {
    endLongTask("ai-slides");
  }
}

function printActiveMarkdownToSlides() {
  const source = slidesSourceFromActiveWindow();
  if (!source.markdown.trim()) {
    setStatus(t("teachtext_empty"));
    return null;
  }
  return createEditableSlidesDocument(source);
}
