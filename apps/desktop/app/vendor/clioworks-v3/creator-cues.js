/* ClioWorks v4 (V4-03): creation-side cue fields — hung beside the narration,
 * never inside it.
 *
 * The creation view and the narration share ONE body: the paragraph list the
 * writing route owns. Making fields (镜头、时长、素材引用、口播提示…) attach to
 * paragraph identities and live in this store; the narration projection is
 * derived from the body on demand and never carries cue text (制作字段不进入
 * 口播). Deleting a paragraph does not delete its cues — they move to the
 * unlocated area (未定位区) and can be reattached or discarded explicitly.
 *
 * Cue edits have their own single-level undo stack (the shared kernel owns the
 * desktop-global undo; this store never rewinds other applications). The
 * snapshot/restore shape rides the working session for backup. No DOM, no
 * translations: the executable contract runs this bare.
 */
(function (root) {
  'use strict';
  if (root.AISystem6CreatorCues) return;

  const MAKING_FIELDS = Object.freeze(['shot', 'duration', 'material', 'note', 'asset', 'voice']);

  function createCueStore({ projectId = null } = {}) {
    /** paragraphId -> [{ field, value, quote?, attachedAt }] */
    let cues = new Map();
    /** cue entries whose paragraph is gone from the body (未定位区). */
    let unlocated = [];
    const undoStack = [];
    const redoStack = [];

    function snapshotState() {
      const out = {};
      for (const [id, list] of cues) out[id] = list.map((entry) => ({ ...entry }));
      return { cues: out, unlocated: unlocated.map((entry) => ({ ...entry })) };
    }

    function pushUndo(label) {
      undoStack.push({ label, state: snapshotState() });
      if (undoStack.length > 100) undoStack.shift();
      redoStack.length = 0;
    }

    function applyState(state) {
      cues = new Map(Object.entries(state.cues).map(([id, list]) => [id, list.map((entry) => ({ ...entry }))]));
      unlocated = state.unlocated.map((entry) => ({ ...entry }));
    }

    function validField(field) {
      if (!MAKING_FIELDS.includes(field)) throw new Error(`creator-cues: unknown making field '${field}' (known: ${MAKING_FIELDS.join(', ')})`);
    }

    /**
     * Attach (or replace) one making field on a paragraph. The optional quote
     * anchors the cue to the sentence it was made about (V4-02 locations).
     */
    function attach(paragraphId, field, value, { quote } = {}) {
      if (typeof paragraphId !== 'string' || !paragraphId) throw new Error('creator-cues: a paragraph identity is required');
      validField(field);
      if (value != null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new Error('creator-cues: a cue value is a scalar');
      }
      pushUndo(`attach:${field}`);
      const list = cues.get(paragraphId) || [];
      const entry = { field, value: value ?? null, quote: quote || null, attachedAt: new Date().toISOString() };
      const at = list.findIndex((e) => e.field === field);
      if (at >= 0) list[at] = entry; else list.push(entry);
      cues.set(paragraphId, list);
      return entry;
    }

    function detach(paragraphId, field) {
      validField(field);
      const list = cues.get(paragraphId);
      if (!list || !list.some((e) => e.field === field)) return false;
      pushUndo(`detach:${field}`);
      const next = list.filter((e) => e.field !== field);
      if (next.length) cues.set(paragraphId, next); else cues.delete(paragraphId);
      return true;
    }

    function cuesFor(paragraphId) {
      return (cues.get(paragraphId) || []).map((entry) => ({ ...entry }));
    }

    function allCues() {
      const out = [];
      for (const [id, list] of cues) for (const entry of list) out.push({ paragraphId: id, ...entry });
      return out;
    }

    /**
     * Sync with the live body: cues of paragraphs that are no longer present
     * move to the unlocated area intact (删段进未定位区); reappearing ids take
     * their cues back. Nothing is ever deleted here.
     */
    function rebase(currentIds) {
      const present = new Set(currentIds);
      const moved = [];
      for (const id of [...cues.keys()]) {
        if (present.has(id)) continue;
        for (const entry of cues.get(id)) {
          moved.push({ paragraphId: id, ...entry });
          unlocated.push({ paragraphId: id, ...entry });
        }
        cues.delete(id);
      }
      // Return from the unlocated area: a paragraph came back with the same id.
      const stillUnlocated = [];
      for (const entry of unlocated) {
        if (present.has(entry.paragraphId)) {
          const list = cues.get(entry.paragraphId) || [];
          list.push({ field: entry.field, value: entry.value, quote: entry.quote, attachedAt: entry.attachedAt });
          cues.set(entry.paragraphId, list);
        } else {
          stillUnlocated.push(entry);
        }
      }
      unlocated = stillUnlocated;
      return { movedToUnlocated: moved.length };
    }

    function unlocatedCues() {
      return unlocated.map((entry) => ({ ...entry }));
    }

    /** Discard one unlocated cue explicitly — the only way a cue is lost. */
    function discardUnlocated(index) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= unlocated.length) throw new Error('creator-cues: no such unlocated cue');
      pushUndo('discard-unlocated');
      return unlocated.splice(index, 1)[0];
    }

    /**
     * The narration: the SAME body paragraphs' text, derived on demand. Cue
     * values never appear here — making fields are not spoken.
     */
    function narrationProjection(paragraphs) {
      if (!Array.isArray(paragraphs)) throw new Error('creator-cues: narration is projected from the live paragraph list');
      return paragraphs.map((p) => {
        if (!p || typeof p.id !== 'string' || typeof p.text !== 'string') throw new Error('creator-cues: paragraphs carry { id, text }');
        return { id: p.id, text: p.text };
      });
    }

    function undo() {
      const step = undoStack.pop();
      if (!step) return null;
      redoStack.push({ label: step.label, state: snapshotState() });
      applyState(step.state);
      return step.label;
    }

    function redo() {
      const step = redoStack.pop();
      if (!step) return null;
      undoStack.push({ label: step.label, state: snapshotState() });
      applyState(step.state);
      return step.label;
    }

    function snapshot() {
      return { schema: 1, projectId, ...snapshotState(), undoDepth: undoStack.length, redoDepth: redoStack.length };
    }

    function restore(state) {
      if (!state || state.schema !== 1) throw new Error('creator-cues: unknown snapshot schema');
      applyState({ cues: state.cues || {}, unlocated: state.unlocated || [] });
      undoStack.length = 0;
      redoStack.length = 0;
    }

    return Object.freeze({
      MAKING_FIELDS,
      attach, detach, cuesFor, allCues,
      rebase, unlocatedCues, discardUnlocated,
      narrationProjection,
      undo, redo,
      snapshot, restore,
    });
  }

  root.AISystem6CreatorCues = Object.freeze({ createCueStore, MAKING_FIELDS });
})(typeof window !== 'undefined' ? window : globalThis);
