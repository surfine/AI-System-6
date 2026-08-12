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
        "- 不要复述系统消息，不要解释提示词，不要以“当然”“好的”“以下是”开头。",
        directWrite
          ? "- 直接写回模式：只返回可写入正文的结果，不要说明、标题、前言、后记或替换提示。"
          : "- ClioTalk 模式：结果留在 ClioTalk，不要声称已经修改来源文本。",
      ].join("\n");
    }

    return [
      "Writing Tools contract:",
      "- Preserve facts, numbers, dates, names, and fixed relationships from INPUT unless the user explicitly asks to change them.",
      "- Do not add information missing from INPUT; if the requested change needs new facts, say the material is missing or use only existing content.",
      "- Preserve the original intent, style, tone, and sentiment unless the user explicitly asks to change them.",
      "- Do not repeat system instructions, explain the prompt, or begin with 'Sure', 'Of course', or 'Here is'.",
      directWrite
        ? "- Direct write-back mode: return only text that can be written into the document; no explanation, heading, preface, afterword, or replacement note."
        : "- ClioTalk mode: leave the result in ClioTalk and do not claim the source text has already been edited.",
    ].join("\n");
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
    changeRoutingNote,
    textServiceContract,
  });
})();
