/* ClioWorks v4 (V4-07): the making list — an editable XLSX assembled from the
 * creation cues and data references, written by the REAL Ledger writer.
 *
 * The list is a NEW artifact (制作清单): one row per narration paragraph that
 * carries cues or references, with columns for the paragraph identity, the
 * shot, the recorded/aligned duration, the material reference, and the caption
 * text. Nothing here edits a source workbook; the bytes come out of the same
 * preserving writer V4-01 proved, on a freshly constructed model workbook.
 *
 * Caption timing stays captionSrt's strict contract (recorded/aligned only;
 * estimated timing never becomes formal subtitles). Speaker notes are a
 * separate model surface (the Lectern adapter's notes()) and are never mixed
 * into the audience-visible runs. */
(function (root) {
  'use strict';
  if (root.AISystem6ProductionList) return;

  const COLUMNS = Object.freeze(['段落', '开头文字', '镜头', '时长(秒)', '素材引用', '字幕文本']);

  function requireLedger() {
    const L = root.L;
    if (!L || !L.model || typeof L.model.Workbook !== 'function' || !L.xlsxWrite || typeof L.xlsxWrite.bytes !== 'function') {
      throw new Error('production-list: the vendored Ledger codec is required (load the ledger adapter first)');
    }
    return L;
  }

  function firstWords(text, count) {
    const parts = String(text || '').trim().split(/\s+/);
    return parts.slice(0, count).join(' ');
  }

  /**
   * Assemble the making-list workbook from cues, the narration body and data
   * references. Rows are ordered by the narration; a paragraph with no cues
   * and no references takes one row with empty making columns (blank, not 0).
   * @param {{cues:object, narration:{id:string,text:string}[], references?:object[], captions?:{text:string,startMs:number,endMs:number,timingBasis:string}[]}} spec
   */
  function buildWorkbook({ cues, narration, references = [], captions = [] }) {
    const L = requireLedger();
    if (!cues || typeof cuesFor !== 'function' && typeof cues.cuesFor !== 'function') {
      if (!cues || typeof cues.cuesFor !== 'function') throw new Error('production-list: a cue store (creator-cues) is required');
    }
    if (!Array.isArray(narration) || !narration.length) throw new Error('production-list: the narration body is required');

    const captionByParagraph = new Map();
    for (const caption of captions) {
      if (caption && caption.paragraphId != null) captionByParagraph.set(String(caption.paragraphId), caption);
    }
    const referenceByParagraph = new Map();
    for (const reference of references) {
      if (reference && reference.paragraphId != null) referenceByParagraph.set(String(reference.paragraphId), reference);
    }

    const wb = new L.model.Workbook({ author: 'ClioWorks' });
    const sheet = wb.addSheet('制作清单');
    COLUMNS.forEach((title, column) => {
      sheet.put(0, column, { v: title });
    });
    narration.forEach((paragraph, index) => {
      const row = index + 1;
      const cueList = cues.cuesFor(String(paragraph.id));
      const cue = (field) => { const hit = cueList.find((c) => c.field === field); return hit ? hit.value : null; };
      const shot = cue('shot');
      const duration = cue('duration');
      const material = cue('material');
      const reference = referenceByParagraph.get(String(paragraph.id));
      const materialRef = material != null ? String(material) : (reference ? `${reference.sheetId}!${reference.range}` : null);
      const caption = captionByParagraph.get(String(paragraph.id));
      const values = [
        String(paragraph.id),
        firstWords(paragraph.text, 8),
        shot == null ? null : String(shot),
        duration == null ? null : Number(duration),
        materialRef,
        caption ? String(caption.text) : null,
      ];
      values.forEach((value, column) => {
        if (value == null) return; // blank stays blank, never 0
        sheet.put(row, column, typeof value === 'number' ? { v: value } : { v: value });
      });
    });
    return wb;
  }

  /** Serialize through the real preserving writer; returns Uint8Array. */
  async function serialize(wb) {
    const L = requireLedger();
    const bytes = await L.xlsxWrite.bytes(wb, { type: 'xlsx' });
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(await bytes.arrayBuffer());
  }

  root.AISystem6ProductionList = Object.freeze({ COLUMNS, buildWorkbook, serialize });
})(typeof window !== 'undefined' ? window : globalThis);
