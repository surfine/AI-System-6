// Storyboard shot vocabulary (分镜镜头词表): the three dimensions a shot line
// names — size, angle, movement. Generic film grammar only; no creator's own
// habits live here (STORYBOARD-SPEC H3, H11). The menu labels, the parser and
// the model prompt all read this one table, so a word the table does not hold
// is a word the storyboard refuses.
//
// `markup` holds the words the storyboard Markdown is made of. They are
// format, not interface copy: a Chinese storyboard stays readable after the
// interface switches to English, so the parser accepts both sets at once.
window.AISystem6StoryboardShots = Object.freeze({
  markup: Object.freeze({
    zh: Object.freeze({
      title: "分镜",
      sheet: "分镜图",
      paragraph: "段",
      shot: "镜",
      estimate: "估",
      visual: "画面",
      footage: "素材",
      footageValues: Object.freeze(["已有", "待拍", "待做"]),
      image: "图",
      changed: "原文已改",
      checks: "检查",
      cuttable: "口播可删",
      cutNo: "否",
      cutWhole: "可删",
      cutCompress: "可压成一句",
      hook: "钩子",
      voiceNote: "口播注意",
      trim: "删减建议",
    }),
    en: Object.freeze({
      title: "Storyboard",
      sheet: "Storyboard Sheet",
      paragraph: "Para",
      shot: "Shot",
      estimate: "est.",
      visual: "Visual",
      footage: "Footage",
      footageValues: Object.freeze(["on hand", "to shoot", "to make"]),
      image: "Image",
      changed: "source changed",
      checks: "Checks",
      cuttable: "Cuttable",
      cutNo: "no",
      cutWhole: "cuttable",
      cutCompress: "compress to one line",
      hook: "hook",
      voiceNote: "Voiceover note",
      trim: "Trim Plan",
    }),
  }),
  size: Object.freeze([
    Object.freeze({ id: "extreme-wide", zh: "大远景", en: "extreme wide" }),
    Object.freeze({ id: "wide", zh: "远景", en: "wide" }),
    Object.freeze({ id: "full", zh: "全景", en: "full" }),
    Object.freeze({ id: "medium", zh: "中景", en: "medium" }),
    Object.freeze({ id: "close-up", zh: "近景", en: "close-up" }),
    Object.freeze({ id: "extreme-close-up", zh: "特写", en: "extreme close-up" }),
  ]),
  angle: Object.freeze([
    Object.freeze({ id: "eye-level", zh: "平拍", en: "eye level" }),
    Object.freeze({ id: "high", zh: "俯拍", en: "high" }),
    Object.freeze({ id: "low", zh: "仰拍", en: "low" }),
    Object.freeze({ id: "pov", zh: "主观", en: "POV" }),
  ]),
  move: Object.freeze([
    Object.freeze({ id: "static", zh: "固定", en: "static" }),
    Object.freeze({ id: "push-in", zh: "推", en: "push in" }),
    Object.freeze({ id: "pull-out", zh: "拉", en: "pull out" }),
    Object.freeze({ id: "pan", zh: "摇", en: "pan" }),
    Object.freeze({ id: "truck", zh: "移", en: "truck" }),
    Object.freeze({ id: "follow", zh: "跟", en: "follow" }),
    Object.freeze({ id: "handheld", zh: "手持", en: "handheld" }),
  ]),
});
