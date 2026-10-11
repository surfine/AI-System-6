// ClioWorks unified spec (M01–M04): media anchors and explorable
// explanations — the four contracts in one lazy module, each pure policy:
//
// M01 图片与图表区域: a region anchor carries the box, the page, and the
// legend/axis/footnote context it was drawn with; the record says whether the
// model saw the whole image or the region; OCR uncertainty keeps candidates
// instead of silent guesses; and the original image is never generatively
// modified.
//
// M02 视频与字幕: questions freeze the time range at submit; subtitle
// answers, visual answers and audio-track facts are different evidence
// kinds; subtitles alone never claim the picture was seen.
//
// M03 朗读中的追问: reading starts at a user-named paragraph and follows
// sentence boundaries; a question pauses and holds the position; only the
// user resumes.
//
// M04 可调的解释实例: four finite templates; original values are read-only;
// the model returns structure, and the arithmetic is computed by this code —
// never by the model's own arithmetic. A template that does not fit falls
// back to prose.
(function (root) {
  'use strict';
  if (root.AISystem6MediaReading) return;

  // --- M01: image regions.

  /** A region anchor. `sawWholeImage` is what the model actually received —
   * declared, never inferred from the box. `context` names the surrounding
   * evidence (legend, axis, footnote) the request carried; a box without any
   * of it is honest about reading a naked rectangle. */
  function buildRegionAnchor({ pageIndex = 0, box, originalWidth, originalHeight, rotation = 0, sawWholeImage, context = [] } = {}) {
    const rect = Array.isArray(box) && box.length === 4 && box.every((value) => Number.isFinite(Number(value)))
      ? box.map(Number)
      : null;
    const width = Number(originalWidth);
    const height = Number(originalHeight);
    if (!rect || !(width > 0) || !(height > 0)) return null;
    const inside = rect[0] >= 0 && rect[1] >= 0
      && rect[0] + rect[2] <= width && rect[1] + rect[3] <= height;
    if (!inside) return null;
    const named = (Array.isArray(context) ? context : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return {
      kind: "region",
      pageIndex: Number(pageIndex) || 0,
      box: rect,
      originalWidth: width,
      originalHeight: height,
      rotation: [0, 90, 180, 270].includes(Number(rotation)) ? Number(rotation) : 0,
      // What the model actually saw — a fact the request declares.
      sawWholeImage: sawWholeImage === true,
      contextKinds: named,
      // A rectangle with no legend/axis/footnote context says so.
      contextSufficient: named.length > 0,
    };
  }

  /** OCR keeps candidates: an uncertain character is a list, not a guess.
   * The joined text marks each candidate inline. */
  function ocrCandidates(baseText, uncertain = []) {
    let text = String(baseText || "");
    (Array.isArray(uncertain) ? uncertain : []).forEach((candidate) => {
      const at = Number(candidate?.at);
      const options = (Array.isArray(candidate?.options) ? candidate.options : [])
        .map((option) => String(option || "").trim())
        .filter(Boolean);
      if (!Number.isInteger(at) || at < 0 || at >= text.length || !options.length) return;
      text = `${text.slice(0, at)}[${options.join("|")}]${text.slice(at + 1)}`;
    });
    return text;
  }

  // --- M02: video and subtitles.

  /** A frozen question window: the range is captured at submit and never
   * drifts with the play head. */
  function freezeQuestionRange({ startMs, endMs, askedAt } = {}) {
    const start = Number(startMs);
    const end = Number(endMs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || start < 0) return null;
    return { startMs: start, endMs: end, askedAt: String(askedAt || new Date().toISOString()), frozen: true };
  }

  /** Evidence kinds are different facts. `subtitles-only` answers carry a
   * scope note that never claims the picture was seen; `visual` claims are
   * anchored to frames; `audio-track` names the track. */
  function evidenceScope(kind) {
    const key = String(kind || "");
    if (key === "subtitles-only") {
      return {
        kind,
        claim: "答案只依据字幕文本。",
        sawPicture: false,
        heardAudio: false,
      };
    }
    if (key === "visual") {
      return {
        kind,
        claim: "答案依据抽帧画面。",
        sawPicture: true,
        // Frames are samples: motion and audio stay out of the claim.
        sawFullMotion: false,
        heardAudio: false,
      };
    }
    if (key === "audio-track") {
      return {
        kind,
        claim: "答案依据声轨内容。",
        sawPicture: false,
        heardAudio: true,
      };
    }
    return null;
  }

  // --- M03: reading aloud.

  /** A read-aloud session: starts where the reader pointed, follows sentence
   * boundaries, and pauses — holding the position — when a question comes.
   * Only the reader's own resume moves it again. */
  function createReadAloudSession({ paragraphId, sentenceIndex = 0 } = {}) {
    if (!String(paragraphId || "").trim()) return null;
    return {
      paragraphId: String(paragraphId),
      sentenceIndex: Number.isInteger(Number(sentenceIndex)) && Number(sentenceIndex) >= 0
        ? Number(sentenceIndex)
        : 0,
      state: "reading",
      // Set when a question pauses the session; only resume() clears it.
      pausedForQuestion: null,
    };
  }

  function pauseForQuestion(session, questionId) {
    if (!session || session.state !== "reading") return session || null;
    const id = String(questionId || "").trim();
    if (!id) return session;
    return {
      ...session,
      state: "paused",
      pausedForQuestion: id,
      // The position is held exactly where it was — not rewound, not advanced.
      heldAt: { paragraphId: session.paragraphId, sentenceIndex: session.sentenceIndex },
    };
  }

  function resumeReading(session) {
    // Resuming something that never paused is a mistake, not a no-op —
    // the caller gets null and can say so.
    if (!session || session.state !== "paused") return null;
    return {
      ...session,
      state: "reading",
      pausedForQuestion: null,
      // Reading continues from the held position — the reader's own act.
      paragraphId: session.heldAt?.paragraphId || session.paragraphId,
      sentenceIndex: session.heldAt?.sentenceIndex ?? session.sentenceIndex,
    };
  }

  // --- M04: adjustable explanations.

  /** Tabulated rates the desk itself vetted — arithmetic never invents a
   * rate. A pair missing here is refused; the answer is prose instead. */
  const CONVERSION_RATES = Object.freeze({
    "小时->分钟": 60,
    "分钟->秒": 60,
    "天->小时": 24,
    "万元->元": 10000,
    "亿->万": 10000,
  });

  /** The four finite templates. `requiredFields` names the structure the
   * model may fill; anything else it returns is ignored. */
  const TEMPLATES = Object.freeze({
    "ratio-compare": { label: "比例比较", requiredFields: ["leftValue", "rightValue", "leftLabel", "rightLabel"] },
    "unit-convert": { label: "单位换算", requiredFields: ["value", "fromUnit", "toUnit"] },
    "timeline": { label: "时间线", requiredFields: ["events"] },
    "causal-chain": { label: "因果前提", requiredFields: ["premises", "conclusion"] },
  });

  /** The arithmetic is this code's job. Each computation is deterministic and
   * names its formula — a reader can check it. `values` are the reader's
   * hypotheses; `originals` stay read-only in the explanation. */
  function compute(template, data = {}) {
    const spec = TEMPLATES[String(template || "")];
    if (!spec) return { ok: false, reason: "unknown-template" };
    const missing = spec.requiredFields.filter((field) => {
      const value = data[field];
      if (field === "events" || field === "premises") return !Array.isArray(value) || !value.length;
      if (field === "conclusion") return !String(value || "").trim();
      return value === undefined || value === null || String(value) === "";
    });
    if (missing.length) return { ok: false, reason: `missing:${missing.join(",")}` };

    if (template === "ratio-compare") {
      const left = Number(data.leftValue);
      const right = Number(data.rightValue);
      if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) {
        return { ok: false, reason: "non-numeric" };
      }
      const ratio = left / right;
      return {
        ok: true,
        template,
        formula: `${left} ÷ ${right} = ${Number(ratio.toFixed(6))}`,
        result: ratio,
        statement: `${data.leftLabel} 是 ${data.rightLabel} 的 ${Number(ratio.toFixed(4))} 倍`,
      };
    }
    if (template === "unit-convert") {
      const value = Number(data.value);
      if (!Number.isFinite(value)) return { ok: false, reason: "non-numeric" };
      const rate = CONVERSION_RATES[`${data.fromUnit}->${data.toUnit}`];
      if (!Number.isFinite(Number(rate))) return { ok: false, reason: "no-rate" };
      const converted = value * Number(rate);
      return {
        ok: true,
        template,
        formula: `${value} × ${rate} = ${Number(converted.toFixed(6))}`,
        result: converted,
        statement: `${value} ${data.fromUnit} = ${Number(converted.toFixed(4))} ${data.toUnit}`,
      };
    }
    // timeline / causal-chain: structure only — the model's events and
    // premises pass through as data; nothing here invents arithmetic.
    return {
      ok: true,
      template,
      structure: template === "timeline"
        ? data.events.map((event) => ({ when: String(event?.when || ""), what: String(event?.what || "") }))
        : { premises: data.premises.map((premise) => String(premise || "")), conclusion: String(data.conclusion) },
    };
  }

  /** The fallback: a template that does not fit returns prose — never a
   * forced visualization. */
  function proseFallback(reason) {
    return {
      ok: false,
      fallbackToProse: true,
      reason: String(reason || "template-not-applicable"),
    };
  }

  root.AISystem6MediaReading = Object.freeze({
    buildRegionAnchor,
    ocrCandidates,
    freezeQuestionRange,
    evidenceScope,
    createReadAloudSession,
    pauseForQuestion,
    resumeReading,
    TEMPLATES,
    compute,
    proseFallback,
  });
})(typeof window !== "undefined" ? window : globalThis);
