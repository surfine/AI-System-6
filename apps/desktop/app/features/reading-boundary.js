// ClioWorks unified spec (R08): spoiler-free reading and rereading. The
// reader sets a read boundary (block order or media time); it filters BEFORE
// retrieval and again at citation validation — nothing past it is ever an
// allowed passage. If the allowed range is insufficient the desk says so;
// it never answers from loaded-but-unauthorized later text. The module makes
// no claim about model pretraining: that limit is stated, not promised.
// Rereading shows the reader's own earlier questions and how their
// understanding changed — no quizzes, no scores. Lazy.
(function (root) {
  'use strict';
  if (root.AISystem6ReadingBoundary) return;

  const contracts = () => root.ClioWorksUnifiedContracts;

  /** The reader's boundary. One kind at a time (block order or media time);
   * `unlimited` is a deliberate explicit choice, not the default. */
  function buildBoundary({ kind, blockOrder = null, timeMs = null } = {}) {
    if (kind === "block") {
      const order = Number(blockOrder);
      if (!Number.isInteger(order) || order < 0) return null;
      return { kind, blockOrder: order, timeMs: null };
    }
    if (kind === "time") {
      const ms = Number(timeMs);
      if (!Number.isFinite(ms) || ms < 0) return null;
      return { kind, blockOrder: null, timeMs: ms };
    }
    if (kind === "unlimited") return { kind, blockOrder: null, timeMs: null };
    return null;
  }

  /** Filter BEFORE retrieval: the vendored selectReadableBlocks is the single
   * authority for block boundaries. A boundary ref user's — Infinity is never
   * assumed. */
  function readableBlocks(blocks, boundary) {
    if (!boundary || boundary.kind === "unlimited") {
      return contracts()?.selectReadableBlocks ? contracts().selectReadableBlocks(blocks, Infinity) : (blocks || []).slice();
    }
    if (boundary.kind === "block") {
      return contracts()?.selectReadableBlocks
        ? contracts().selectReadableBlocks(blocks, boundary.blockOrder)
        : [];
    }
    // Time boundary: a block is readable when it STARTS before the reader's
    // position (its startMs is known from the block's own timing).
    return (blocks || [])
      .filter((block) => Number.isFinite(Number(block?.startMs)) && Number(block.startMs) <= boundary.timeMs)
      .map((block) => ({ ...block }));
  }

  /** Is this passage inside the allowed range? Block refs compare by their
   * anchored offset's block order; time refs by their own startMs. */
  function passageAllowed(ref, boundary, { blockOrderOf = null } = {}) {
    if (!boundary || boundary.kind === "unlimited") return true;
    if (boundary.kind === "block") {
      const order = typeof blockOrderOf === "function" ? blockOrderOf(ref) : Number(ref?.blockOrder);
      return Number.isInteger(order) && order <= boundary.blockOrder;
    }
    const start = Number(ref?.startMs);
    return Number.isFinite(start) && start <= boundary.timeMs;
  }

  /** The sufficiency check — 规格原话：允许范围不足就说明。A request whose
   * anchored passages fall outside the boundary is refused with the reason,
   * never answered from the unauthorized tail. */
  function requestWithinBoundary(anchorRefs, boundary, { blockOrderOf = null } = {}) {
    const refs = Array.isArray(anchorRefs) ? anchorRefs : [];
    const outside = refs.filter((ref) => !passageAllowed(ref, boundary, { blockOrderOf }));
    if (!refs.length) return { ok: false, reason: "no-anchors" };
    if (outside.length) {
      return {
        ok: false,
        reason: "beyond-read-boundary",
        outsideCount: outside.length,
        message: boundary.kind === "block"
          ? `你已读上限为第 ${boundary.blockOrder} 段，有 ${outside.length} 条锚点在其之后——我不会从你未授权的后文找答案。可以调整已读上限后重试。`
          : `你已读到 ${Math.round(boundary.timeMs / 1000)} 秒，有 ${outside.length} 条锚点在其之后——我不会从你未授权的后文找答案。`,
      };
    }
    return { ok: true, allowedRefs: refs };
  }

  /** The honest scope statement. The desk controls what IT sends; it cannot
   * promise what a model memorized in training, and it says so. */
  function scopeStatement(boundary) {
    if (!boundary) return "";
    const shape = boundary.kind === "block"
      ? `已读上限：第 ${boundary.blockOrder} 段`
      : boundary.kind === "time"
        ? `已读上限：${Math.round(boundary.timeMs / 1000)} 秒`
        : "已读上限：无（你选择不限）";
    return `${shape}。回答只用这个范围里的内容；这约束我发出的材料，不约束模型预训练里可能记得的剧情。`;
  }

  /** Rereading — the reader's own trail: earlier open questions and how the
   * recorded understanding changed. No quiz, no score, no grade. */
  function rereadingTrail({ openQuestions = [], understandingLog = [] } = {}) {
    return {
      questions: (Array.isArray(openQuestions) ? openQuestions : [])
        .filter((question) => question && question.status !== "withdrawn")
        .map((question) => ({
          id: String(question.id || ""),
          gap: String(question.gap || ""),
          quote: String(question.quote || ""),
          status: String(question.status || "open"),
          // A question that later got answered shows what answered it.
          resolvedBy: question.status === "resolved" ? String(question.resolvedBy || "") : null,
        })),
      changes: (Array.isArray(understandingLog) ? understandingLog : [])
        .map((entry) => ({
          at: String(entry.at || ""),
          note: String(entry.note || ""),
          // The reader's own words only — the desk never converts these
          // into AI text (规格：不得自动把它改成 AI 文字).
          authoredBy: "reader",
        })),
      quiz: null,
      score: null,
    };
  }

  root.AISystem6ReadingBoundary = Object.freeze({
    buildBoundary,
    readableBlocks,
    passageAllowed,
    requestWithinBoundary,
    scopeStatement,
    rereadingTrail,
  });
})(typeof window !== "undefined" ? window : globalThis);
