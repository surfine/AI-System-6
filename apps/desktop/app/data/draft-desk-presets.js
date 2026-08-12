// Draft Desk presets keep author-specific editorial knowledge outside the
// reusable Draft Desk engine. Scenario selection remains the existing UI.

const DRAFT_DESK_PRESET_SCENARIOS = Object.freeze({
  "first-day-hands-on": "launch-day-tech",
  "hands-on-review": "launch-day-tech-review",
  "bili-dynamic": "generic-bili",
});

const launchDayLenses = Object.freeze({
  mingming: {
    zh: "代入铭铭视角做首发快审：检查当前稿是否能拍、能念、能成立。输出到 ClioTalk：前两句重点、视频感、可拍画面、废话密度、AI 嘴替痕迹，以及最轻量的修改建议。不要直接重写正文，务必保留用户原始判断和已写出的口气。",
    en: "Run a Mingming-perspective launch-day pass. Output ClioTalk notes on whether it is shootable, speakable, and defensible, with only light edits. Do not rewrite the body; preserve the writer's judgment and voice.",
  },
  luoluo: {
    zh: "用“若是落落会怎么接”的接收视角做快稿交付检查：输出到 ClioTalk。先给情绪价值，再守事实底线；指出哪里更容易接、哪里有压力、哪里需要更顺口。不要直接重写正文，不要输出私人关系建议或后台审校术语。",
    en: "Use a 'how Luoluo would receive it' lens. Give emotional value first, then protect factual guardrails. Do not rewrite the body or output private relationship advice.",
  },
  praise: {
    zh: "夸夸 Aaron，也夸落落，而且要真的让 Aaron 开心：落落是男生，只能用“他/他的”。具体看见 Aaron 已经做成的判断、心意、给落落的认真交付，以及稿子里已经成立的地方；也要具体看见落落值得被这样认真对待的表达、审美、频道和观众感。再给 3 个最轻量的下一步。输出到 ClioTalk，不要重写正文，不要泛泛鸡汤，不要说教。",
    en: "Encourage Aaron and Luoluo in a way that genuinely lifts Aaron. Specifically notice Aaron's judgment, care, serious handoff, and what already works; also notice Luoluo's expression, taste, channel, and audience sense. Then give three light next steps without rewriting or lecturing.",
  },
});

const launchDayDetectors = Object.freeze([
  {
    pattern: /(?:iOS|iPadOS|macOS).*(?:一起|三件套|一起讲)|三件套/i,
    editorial: ["- 主线：iOS / iPadOS / macOS 作为三件套一起讲"],
    adoptionRows: [["三系统一起讲", "用“三件套升级”串联结构", "待检查"]],
  },
  {
    pattern: /(?:自己表述|我自己说|自己的语言|别替我|不要替我|Aaron.*语言|落落.*语言)/i,
    editorial: ["- 作者边界：最终用 Aaron/落落自己的语言，ClioTalk 只做编辑建议"],
    adoptionRows: [["作者自己的语言", "只建议改法，不默认替换正文", "待检查"]],
  },
  {
    pattern: /(?:Liquid Glass|液态玻璃|玻璃)/i,
    materialLedger: ["- Liquid Glass：[聊天建议] [待确认] 可拍，适合开头或第一段画面"],
    adoptionRows: [["Liquid Glass", "翻成开头可拍画面", "待检查"]],
  },
  {
    pattern: /(?:iPhone Mirroring|镜像)/i,
    materialLedger: ["- iPhone Mirroring：[聊天建议] [待确认] 能演示时适合中段"],
    adoptionRows: [["iPhone Mirroring", "放在中段演示，不能演示则标边界", "待检查"]],
  },
  {
    pattern: /(?:Apple Music|音乐)/i,
    materialLedger: ["- Apple Music：[聊天建议] [待确认] 一句带过，避免展开太多"],
    adoptionRows: [["Apple Music", "一句带过", "待检查"]],
  },
  {
    pattern: /(?:Apple Pay|支付)/i,
    materialLedger: ["- Apple Pay：[聊天建议] [待确认] 能录就放，不能录就删"],
    adoptionRows: [["Apple Pay", "能录才进稿，否则删除或标边界", "待检查"]],
  },
]);

const launchDayBase = Object.freeze({
  writerName: "Aaron",
  recipientName: "落落",
  recipientPronouns: Object.freeze({ zh: "他/他的", en: "he/him" }),
  lenses: launchDayLenses,
  commandLabels: Object.freeze({
    mingming: Object.freeze({ zh: "铭铭快审", en: "Mingming Pass" }),
    luoluo: Object.freeze({ zh: "落落接收", en: "Luoluo Receive" }),
  }),
  promptConstraints: Object.freeze({
    zh: Object.freeze(["- 落落是男生；涉及落落时只能用“他/他的”，禁止用“她/她的”。"]),
    en: Object.freeze(["- Luoluo uses he/him pronouns."]),
  }),
  strategyDetectors: launchDayDetectors,
});

const presets = Object.freeze({
  "launch-day-tech": Object.freeze({ ...launchDayBase, id: "launch-day-tech" }),
  "launch-day-tech-review": Object.freeze({ ...launchDayBase, id: "launch-day-tech-review" }),
  "generic-bili": Object.freeze({
    id: "generic-bili",
    writerName: "writer",
    recipientName: "recipient",
    recipientPronouns: Object.freeze({ zh: "对方", en: "they/them" }),
    lenses: Object.freeze({}),
    commandLabels: Object.freeze({}),
    promptConstraints: Object.freeze({ zh: Object.freeze([]), en: Object.freeze([]) }),
    strategyDetectors: Object.freeze([]),
  }),
});

function draftDeskPresetForScenario(scenario = "first-day-hands-on") {
  return presets[DRAFT_DESK_PRESET_SCENARIOS[scenario] || "generic-bili"] || presets["generic-bili"];
}

function draftDeskPresetLensNote(preset, kind, language = "en") {
  return String(preset?.lenses?.[kind]?.[language === "zh" ? "zh" : "en"] || "");
}

function draftDeskPresetCommandLabel(preset, kind, language = "en") {
  return String(preset?.commandLabels?.[kind]?.[language === "zh" ? "zh" : "en"] || "");
}

function inferDraftDeskPresetSignals(preset, text = "", excerpt = "") {
  const value = String(text || "");
  const signals = { editorial: [], materialLedger: [], adoptionRows: [] };
  (preset?.strategyDetectors || []).forEach((detector) => {
    if (!detector.pattern.test(value)) return;
    signals.editorial.push(...(detector.editorial || []));
    signals.materialLedger.push(...(detector.materialLedger || []).map((line) => `${line}；原话：${excerpt}`));
    signals.adoptionRows.push(...(detector.adoptionRows || []).map((row) => [...row]));
  });
  return signals;
}

window.AISystem6DraftDeskPresetsLoaded = true;
window.AISystem6DraftDeskPresets = Object.freeze({
  forScenario: draftDeskPresetForScenario,
  inferStrategySignals: inferDraftDeskPresetSignals,
  lensNote: draftDeskPresetLensNote,
  commandLabel: draftDeskPresetCommandLabel,
  presets,
  scenarioMap: DRAFT_DESK_PRESET_SCENARIOS,
});
