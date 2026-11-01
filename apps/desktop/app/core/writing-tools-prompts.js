// Shared prompt contracts for the System 6 Writing Tools menu.

window.AISystem6WritingToolsPrompts = (() => {
  function isZh(language = "") {
    return String(language || "").toLowerCase().startsWith("zh");
  }

  function compactInstruction(instruction = "", fallback = "") {
    return String(instruction || fallback || "").trim();
  }

  function textServiceContract({ language = "zh", directWrite = false } = {}) {
    if (isZh(language)) {
      return [
        "写作工具契约：",
        "- 保留 INPUT 中的事实、数字、日期、姓名和确定关系，除非用户明确要求更改。",
        "- 不添加 INPUT 没有的信息；如果修改要求需要新事实，说明材料不足，或只使用原文已有内容。",
        "- 除非用户明确要求改变，保留原意、风格、语气和情绪。",
        "- 保留条件、否定范围、来源归属、比较对象、判断强度和完成状态；表达修改不撤回作者观点、不替作者核实事实，模糊归属不能删成裸事实。",
        "- 保留引文及访谈、聊天、录音原话、专名、代码、链接、数字和标题 ID；不补个人经历。",
        "- 输出语言依次遵守明确任务要求、原文语言、当前默认语言；仅繁体转换不推断台湾语域，台湾适配须明确指定。",
        "- 表达改稿未要求重排、删减或转换格式时，保留标题、段落次序和独立信息；等义不确定时保留原句。",
        "- 有用的专名、术语和节奏性重复不是冗余；除非用户明确要求删减，不得为避免重复而换成代词或省略。",
        "- 若用户只要求改成繁体，这是逐字字符转换：汉字数量与顺序保持一致，非汉字、空格、标点、数字、拉丁词和单位保持一致，只替换对应字形；例如“这个软件支持在线视频”只能变成“這個軟件支持在線視頻”，不得变成“軟體／支援／線上／影片”。",
        "- 只标问题时只返回位置、问题类型、影响和建议动作；除原文定位外不得出现引号中的替换句、示例句、占位事实或可直接粘贴的改写。",
        "- 不要复述系统消息，不要解释提示词，不要以“当然”“好的”“以下是”开头。",
        directWrite
          ? "- 直接写回模式：只返回可写入正文的结果，不要额外的说明、标题、前言、后记或替换提示。"
          : "- ClioTalk 模式：结果留在 ClioTalk，不要声称已经修改来源文本。",
      ].join("\n");
    }

    return [
      "Writing Tools contract:",
      "- Preserve facts, numbers, dates, names, and fixed relationships from INPUT unless the user explicitly asks to change them.",
      "- Do not add information missing from INPUT; if the requested change needs new facts, say the material is missing or use only existing content.",
      "- Preserve the original intent, style, tone, and sentiment unless the user explicitly asks to change them.",
      "- Preserve conditions, negation scope, attribution, comparison targets, judgment strength and completion status. Expression edits do not retract viewpoints or verify facts; do not turn vague attribution into an unattributed fact.",
      "- Preserve quotations and verbatim interview/chat/recording speech, names, code, links, numbers and heading IDs; never add personal experience.",
      "- Language priority: explicit task requirements, source language, current default language. Traditional characters alone do not imply Taiwan usage; Taiwan adaptation requires an explicit request.",
      "- Expression edits preserve titles, paragraph order and independent information unless restructuring, omission or format conversion is requested; keep uncertain equivalents unchanged.",
      "- Useful proper-name, technical-term and rhythmic repetition is not redundancy; do not replace it with pronouns or omission unless the user explicitly requests cutting.",
      "- If the user asks only for Traditional characters, perform a one-for-one character conversion: keep the count and order of Han characters, every non-Han character, space, punctuation mark, digit, Latin token and unit identical; for example, ‘这个软件支持在线视频’ may become ‘這個軟件支持在線視頻’, never ‘軟體/支援/線上/影片’.",
      "- Issue-flagging only returns locations, issue type, impact and an action suggestion; except for quoting the original location, do not include quoted replacement sentences, examples, placeholder facts or paste-ready rewrites.",
      "- Do not repeat system instructions, explain the prompt, or begin with 'Sure', 'Of course', or 'Here is'.",
      directWrite
        ? "- Direct write-back mode: return only text that can be written into the document; no added explanation, heading, preface, afterword, or replacement note."
        : "- ClioTalk mode: leave the result in ClioTalk and do not claim the source text has already been edited.",
    ].join("\n");
  }

  // Only inspect the user's instruction, never quoted manuscript content.
  function annotationOnly(instruction = "") {
    const value = compactInstruction(instruction);
    const clauses = value.split(/[。；;，,\n]/).map((clause) => clause.trim());
    return clauses.some((clause) => {
      if (/(?:不要|不是|不必|不用|无需|無需|別|别|not|don't|do not)\s*(?:只|仅|僅|only|just)\s*(?:标|標|指出|列|flag|identify|list)/i.test(clause)) return false;
      return /^(?:请|請|帮我|幫我)?\s*(?:只|仅|僅)\s*(?:标(?:记|注)?|標(?:記|註)?|指出|列出|提)\s*(?:问题|問題|错误|錯誤|建议|建議)(?:与建议|與建議|和建议|和建議|即可|就好)?[。.!！]?$/i.test(clause)
        || /^(?:请|請)?\s*(?:不要|不需|无需|無需|請勿|请勿|別|别)\s*(?:改写|改寫|重写|重寫|修改)(?:原文|正文|全文)?[。.!！]?$/i.test(clause)
        || /^(?:please\s+)?(?:only|just)\s+(?:flag|identify|list|review|annotate)\b/i.test(clause)
        || /^(?:please\s+)?(?:do not|don't)\s+(?:rewrite|edit|replace)(?:\s+(?:the\s+)?(?:text|source|document))?[.!]?$/i.test(clause);
    });
  }

  function languageRule({ language = "zh" } = {}) {
    return isZh(language)
      ? "语言优先级：明确任务语言要求 → 原文语言 → 当前默认语言（自然简体中文）。"
      : "Language priority: explicit task language requirements → source language → current default language (English).";
  }

  function changeRoutingNote(instruction = "", { language = "zh" } = {}) {
    const value = compactInstruction(instruction);
    if (!value) return "";
    const lower = value.toLowerCase();
    const labels = [];

    if (/(表格|列表|要点|三点|bullet|table|list|format|markdown)/i.test(value)) labels.push("Formatting");
    if (/(引用|署名|出处|来源|citation|cite|attribution|source)/i.test(value)) labels.push("Attribution");
    if (/(改写|重写|换个说法|语气|友好|专业|简洁|rewrite|tone|friendly|professional|concise)/i.test(value)) labels.push("Transformation");
    if (/(新增|添加|补充|扩写|继续|生成|举例|数据|事实|日期|名字|add|generate|continue|example|fact|data|date|name)/i.test(value)) labels.push("Generation");
    if (!labels.length || /(校对|错字|标点|语法|proofread|typo|grammar|punctuation)/i.test(lower)) labels.push("Action");

    const uniqueLabels = [...new Set(labels)];
    if (isZh(language)) {
      return [
        `Make a Change 路由：${uniqueLabels.join(" / ")}`,
        "如果路由包含 Generation，不能凭空补事实、数字、日期、姓名、引用或个人细节；材料不足时直接保守处理。",
      ].join("\n");
    }

    return [
      `Make a Change route: ${uniqueLabels.join(" / ")}`,
      "If the route includes Generation, do not invent facts, numbers, dates, names, citations, or personal details; handle missing material conservatively.",
    ].join("\n");
  }

  return Object.freeze({
    annotationOnly,
    languageRule,
    changeRoutingNote,
    textServiceContract,
  });
})();
