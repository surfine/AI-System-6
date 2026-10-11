// ClioWorks unified spec (S03): questions without answers are notes too.
// An open-question scrap carries the original quote it came from, the user's
// own gap ("what I don't get"), and a status only the user's acceptance
// changes — the model may propose, never decide. The scrap record keeps its
// identity; this is one more value of an existing field, not a parallel store.
// Lazy: nothing on the boot path pays for it until an open question exists.
(function (root) {
  'use strict';
  if (root.AISystem6OpenQuestions) return;

  /** The statuses S03 names, in review order. `withdrawn` is a user state:
   * the question no longer stands — it is kept, not deleted, so the gap it
   * recorded is not quietly erased. */
  const STATUSES = ["open", "partly-answered", "resolved", "withdrawn"];

  const LABELS = {
    zh: { open: "待解", "partly-answered": "部分解答", resolved: "已解答", withdrawn: "已撤回" },
    en: { open: "Open", "partly-answered": "Partly answered", resolved: "Resolved", withdrawn: "Withdrawn" },
  };

  function isKnownStatus(status) {
    return STATUSES.includes(String(status || ""));
  }

  /** The open-question fields for a scrap. The quote is the source's own
   * words; the gap is the reader's own question. Neither is model-authored. */
  function buildOpenQuestion({ quote, gap, sourceId, sourceTitle, projectId } = {}) {
    const text = String(quote || "").trim();
    const ask = String(gap || "").trim();
    if (!text || !ask) return null;
    return {
      noteKind: "open-question",
      status: "open",
      quote: text,
      gap: ask,
      sourceId: String(sourceId || ""),
      sourceTitle: String(sourceTitle || ""),
      projectId: String(projectId || ""),
      createdAt: new Date().toISOString(),
      // Candidate answers arrive as proposals; only an explicit user
      // acceptance moves status. History is kept, not overwritten.
      candidates: [],
      statusHistory: [{ status: "open", at: new Date().toISOString(), by: "user" }],
    };
  }

  /** A model (or any tool) may propose; it lands as a candidate and nothing
   * else. `proposedBy` names the surface so a stray generation cannot pose
   * as a decision. */
  function proposeCandidate(question, candidate = {}) {
    if (!question || question.noteKind !== "open-question") return question || null;
    const text = String(candidate.text || "").trim();
    if (!text) return question;
    const next = {
      ...question,
      candidates: [...(question.candidates || []), {
        text,
        proposedBy: String(candidate.proposedBy || ""),
        proposedAt: new Date().toISOString(),
        // The user's acceptance is what moves status; the proposal is inert.
        acceptedAt: null,
      }],
    };
    return next;
  }

  /** Status changes only through user acceptance. A candidate id may ride
   * along (its acceptedAt is stamped); a bare status change is also the
   * user's own act. Withdrawn is kept, never erased. */
  function acceptStatus(question, status, { candidateIndex = null } = {}) {
    if (!question || question.noteKind !== "open-question") return question || null;
    if (!isKnownStatus(status)) return question;
    const now = new Date().toISOString();
    const next = {
      ...question,
      status,
      candidates: (question.candidates || []).map((candidate, index) => (
        index === candidateIndex ? { ...candidate, acceptedAt: now } : candidate
      )),
      statusHistory: [...(question.statusHistory || []), { status, at: now, by: "user" }],
    };
    return next;
  }

  /** The similarity sweep — bounded and opt-in by design: S03 forbids
   * restoring a global suggestion hub, so the caller passes an explicit
   * allowlist of project ids and a bound. Normalized bigram overlap only;
   * a suggestion is a local, dismissible hint. */
  function similarOpenQuestions(question, pool, { limit = 3, minScore = 0.34 } = {}) {
    const text = `${question?.gap || ""} ${question?.quote || ""}`;
    if (!text.trim() || !Array.isArray(pool)) return [];
    const grams = (s) => {
      const flat = String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
      const out = new Set();
      for (let i = 0; i < flat.length - 1; i += 1) out.add(flat.slice(i, i + 2));
      return out;
    };
    const mine = grams(text);
    if (!mine.size) return [];
    // The question's own fingerprint — an id check alone cannot stop a
    // round-tripped copy of the question (same words, new id) from
    // suggesting itself.
    const selfFingerprint = `${String(question?.gap || "")}\u0000${String(question?.quote || "")}`;
    return pool
      .filter((other) => other && other.id !== question?.id && other.noteKind === "open-question"
        && other.status !== "withdrawn"
        && `${String(other.gap || "")}\u0000${String(other.quote || "")}` !== selfFingerprint)
      .map((other) => {
        const theirs = grams(`${other.gap || ""} ${other.quote || ""}`);
        let shared = 0;
        theirs.forEach((gram) => { if (mine.has(gram)) shared += 1; });
        const score = shared / (mine.size + theirs.size - shared || 1);
        return { id: other.id, title: other.title || "", score, status: other.status };
      })
      .filter((hit) => hit.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit));
  }

  /** The one-line status a list or drawer shows — never a fake probability. */
  function statusLabel(status, language = "zh") {
    const table = LABELS[language === "en" ? "en" : "zh"] || LABELS.zh;
    return table[status] || table.open;
  }

  /** The eager side's one call: mark an existing scrap as an open question.
   * The quote is the scrap's own saved words; the gap starts as the writer's
   * prompt. Returns true when the scrap gained the fields. */
  function markScrap(scrap, { gapPrompt = "" } = {}) {
    if (!scrap || typeof scrap !== "object") return false;
    const body = String(scrap.body || "").trim();
    const quote = body.split(/\n+/)[0].slice(0, 400);
    const built = buildOpenQuestion({
      quote,
      gap: String(gapPrompt || ""),
      sourceId: scrap.sourceId || "",
      sourceTitle: scrap.sourceTitle || scrap.title || "",
      projectId: scrap.projectId || "",
    });
    if (!built) return false;
    scrap.noteKind = built.noteKind;
    scrap.status = built.status;
    scrap.question = built;
    return true;
  }

  root.AISystem6OpenQuestions = Object.freeze({
    markScrap,
    STATUSES,
    isKnownStatus,
    buildOpenQuestion,
    proposeCandidate,
    acceptStatus,
    similarOpenQuestions,
    statusLabel,
  });
})(typeof window !== "undefined" ? window : globalThis);
