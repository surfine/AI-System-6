/* ClioWorks v4.2 workflow contracts. Original candidate code, no document engine,
 * persistence, model invocation or authority. The host supplies snapshots and IDs.
 * UMD keeps the existing classic-script runtime and Node tests equally usable. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClioWorks42 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class ContractError extends Error {
    constructor(code, message) { super(message); this.name = 'ContractError'; this.code = code; }
  }
  const reject = (code, message) => { throw new ContractError(code, message); };
  function text(v, name, max = 4096) {
    if (typeof v !== 'string' || !v.trim() || v.length > max) reject('INVALID_INPUT', name);
    return v;
  }
  function plain(v) {
    return v && typeof v === 'object' && !Array.isArray(v) &&
      [null, Object.prototype].includes(Object.getPrototypeOf(v));
  }
  function clone(v) { return structuredClone(v); }
  function stamp(v) {
    if (!plain(v)) reject('INVALID_STAMP', 'A document snapshot is required.');
    const out = {};
    for (const key of ['documentId', 'sessionId']) out[key] = text(v[key], key, 256);
    for (const key of ['generation', 'editRevision', 'styleRevision']) {
      if (!Number.isSafeInteger(v[key]) || v[key] < 0) reject('INVALID_STAMP', key);
      out[key] = v[key];
    }
    return out;
  }
  function equalStamp(a, b) {
    a = stamp(a); b = stamp(b);
    return Object.keys(a).every(k => a[k] === b[k]);
  }
  function requireCurrent(base, current) {
    if (!equalStamp(base, current)) reject('STALE_PREVIEW', 'The document changed. Prepare a new preview.');
  }
  /** A comparison fingerprint is not a hash, signature or authorization token. */
  function sameValue(a, b) {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
    if (!plain(a) || !plain(b)) return false;
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && sameValue(a[k], b[k]));
  }
  /** Rendering state; never upgrade missing coverage into a pass. */
  function auditStatus(report, currentLayoutId) {
    if (!report || report.error) return {state: 'failed', label: '检查未完成', canRepair: false};
    if (report.snapshot?.layoutResultId !== currentLayoutId) return {state: 'stale', label: '页面已改变，请重新检查', canRepair: false};
    if (!Array.isArray(report.findings)) reject('INVALID_AUDIT', 'findings is required.');
    const c = report.coverage || {};
    const incomplete = report.metrics !== 'measured' ||
      ['bounds', 'text', 'overlap', 'distortion'].some(k => c[k] !== 'checked') || c.reporting !== 'complete';
    return {state: report.findings.length ? 'issues' : incomplete ? 'partial' : 'clear',
      label: report.findings.length ? `发现 ${report.findings.length} 条问题` : incomplete ? '部分内容尚未检查' : '所列检查未发现问题',
      incomplete, visualReview: report.visualReview || 'not_run',
      canRepair: report.metrics === 'measured', count: report.findings.length};
  }
  /** New geometry is a proposal over one native object, never a text rewrite. */
  function geometryProposal(base, objectId, before, after, constraints = {}) {
    for (const g of [before, after]) {
      if (!plain(g)) reject('INVALID_GEOMETRY', 'Geometry is required.');
      const keys = Object.keys(g);
      if (keys.some(k => !['x', 'y', 'w', 'h'].includes(k))) reject('GEOMETRY_ONLY', 'Text/style changes are not geometry repairs.');
      for (const k of ['x', 'y', 'w', 'h']) if (!Number.isFinite(g[k]) || Math.abs(g[k]) > 1e7) reject('INVALID_GEOMETRY', k);
      if (g.w <= 0 || g.h <= 0) reject('INVALID_GEOMETRY', 'Positive dimensions required.');
    }
    if (constraints.minWidth && after.w < constraints.minWidth) reject('DESIGN_FLOOR', 'Width violates the design.');
    return {kind: 'geometry', effect: 'proposal', base: stamp(base), objectId: text(objectId, 'objectId', 256),
      unit: 'pt', before: clone(before), after: clone(after), requiresHostAuthorization: true, requiresReaudit: true};
  }
  function validateGeometryAccept(p, current, actualBefore) {
    if (p?.kind !== 'geometry' || p.unit !== 'pt') reject('INVALID_PROPOSAL', 'Geometry proposal expected.');
    requireCurrent(p.base, current);
    if (!sameValue(p.before, actualBefore)) reject('OBJECT_CHANGED', 'Object geometry changed.');
    return clone(p.after); // Caller still needs the existing native transaction and authorization.
  }
  function overlapNote({pageId, objectIds, geometryRevision, reason}) {
    if (!Array.isArray(objectIds) || new Set(objectIds).size !== 2) reject('INVALID_PAIR', 'Two distinct objects required.');
    if (!Number.isSafeInteger(geometryRevision) || geometryRevision < 0) reject('INVALID_REVISION', 'geometryRevision');
    return {pageId: text(pageId, 'pageId', 256), objectIds: objectIds.map(v => text(v, 'objectId', 256)).sort(),
      geometryRevision, reason: text(reason, 'A reason is required.', 500)};
  }
  function overlapNoteApplies(note, pageId, ids, revision) {
    return note.pageId === pageId && note.geometryRevision === revision &&
      sameValue(note.objectIds, [...ids].sort());
  }
  const FIELD_TYPES = new Set(['text', 'number', 'date']);
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    if (y < 1 || m < 1 || m > 12 || d < 1) return false;
    const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
    return d <= days[m - 1];
  }
  /** Instances are target positions supplied by a native parser, not regex guesses. */
  function planTemplate(base, instances, values) {
    if (!Array.isArray(instances) || instances.length > 2000 || !plain(values)) reject('INVALID_TEMPLATE', 'Invalid template inputs.');
    const seen = new Set(), used = new Set();
    const rows = instances.map(raw => {
      const id = text(raw.id, 'instanceId', 256), key = text(raw.key, 'field key', 256);
      if (seen.has(id)) reject('DUPLICATE_TARGET', id); seen.add(id);
      if (!FIELD_TYPES.has(raw.type)) reject('INVALID_FIELD_TYPE', key);
      if (!['ready', 'split_run', 'unmapped'].includes(raw.mapping)) reject('INVALID_MAPPING', key);
      const own = Object.prototype.hasOwnProperty.call(values, key);
      const v = own ? values[key] : undefined;
      let status = raw.mapping !== 'ready' ? 'unmapped' : !own || v === undefined || v === null || v === '' ? 'missing' : 'filled';
      if (status === 'filled') {
        if (raw.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) status = 'invalid';
        if (raw.type === 'text' && (typeof v !== 'string' || v.length > 8000)) status = 'invalid';
        if (raw.type === 'date' && !validDate(v)) status = 'invalid';
      }
      if (own) used.add(key);
      return {id, key, label: text(raw.label, 'label', 256), location: text(raw.location, 'location', 512),
        type: raw.type, status, mapping: raw.mapping,
        ...(status === 'filled' ? {value: clone(v)} : {})};
    });
    return {kind: 'template', effect: 'proposal', base: stamp(base), rows,
      unresolved: rows.filter(r => r.status !== 'filled').length,
      unusedKeys: Object.keys(values).filter(k => !used.has(k)),
      destination: 'new-copy', requiresHostAuthorization: true};
  }
  function templateAccept(p, current) {
    if (p?.kind !== 'template') reject('INVALID_PROPOSAL', 'Template proposal expected.');
    requireCurrent(p.base, current);
    if (p.rows.some(r => r.status !== 'filled')) reject('UNRESOLVED_FIELDS', 'Resolve the highlighted fields first.');
    return p.rows.map(({id, type, value}) => ({targetId: id, value: clone(value), type, evaluateAsFormula: false}));
  }
  /** A source-page extraction is always a derived proposal. No source file is modified. */
  function planExtraction(base, page, cells, target) {
    if (!page || !Number.isSafeInteger(page.number) || page.number < 1) reject('INVALID_PAGE', 'Page number required.');
    if (!['text-layer', 'ocr-pending', 'ocr-reviewed'].includes(page.method)) reject('INVALID_METHOD', 'Extraction method required.');
    if (!Array.isArray(cells) || cells.length > 10000) reject('INVALID_CELLS', 'Cell list required.');
    if (!['new-workbook', 'current-document', 'scrapbook'].includes(target)) reject('INVALID_TARGET', 'Explicit receiver required.');
    const seen = new Set();
    const rows = cells.map(c => {
      if (seen.has(c.id)) reject('DUPLICATE_TARGET', c.id); seen.add(text(c.id, 'cell id', 256));
      if (!['text','number','empty'].includes(c.type)) reject('INVALID_CELL', 'type');
      if (c.type === 'number' && !Number.isFinite(c.value)) reject('INVALID_CELL', c.id);
      if (c.type === 'empty' && c.value !== null) reject('EMPTY_IS_NOT_ZERO', c.id);
      if (c.type === 'text' && (typeof c.value !== 'string' || c.value.length > 8000)) reject('INVALID_CELL', c.id);
      if (typeof c.reviewed !== 'boolean' || typeof c.uncertain !== 'boolean') reject('INVALID_CELL', 'Review state required.');
      return {id:c.id, type:c.type, value:clone(c.value), uncertain:c.uncertain, reviewed:c.reviewed};
    });
    return {kind:'extraction', effect:'proposal', base:stamp(base), page:{number:page.number, method:page.method}, target,
      cells:rows, unresolved: rows.filter(c => c.uncertain && !c.reviewed).length,
      blocked:page.method==='ocr-pending', requiresHostAuthorization:true};
  }
  function extractionAccept(p, current) {
    if (p?.kind !== 'extraction') reject('INVALID_PROPOSAL', 'Extraction proposal expected.');
    requireCurrent(p.base, current);
    if (p.blocked) reject('OCR_UNAVAILABLE', 'This page has not been recognized.');
    if (p.unresolved) reject('UNREVIEWED_CELLS', 'Review uncertain cells first.');
    return {target:p.target, source:clone(p.base), sourcePage:p.page.number,
      rows:clone(p.cells), kind:'derived-copy', writesSource:false};
  }
  function retryPage(candidate, retryLimit = 2) {
    if (candidate.status !== 'failed') reject('PAGE_NOT_FAILED', 'Only failed candidates can be retried.');
    if (candidate.attempts >= retryLimit) reject('RETRY_LIMIT', 'Use manual editing or adjust the request.');
    return {...clone(candidate), attempts:candidate.attempts+1, status:'generating'};
  }
  function planPages(base, candidates, selectedIds, sourceStamp) {
    if (!Array.isArray(selectedIds) || !selectedIds.length || new Set(selectedIds).size !== selectedIds.length) reject('INVALID_SELECTION', 'Select distinct pages.');
    const picked = selectedIds.map(id => {
      const c = candidates.find(x => x.id === id);
      if (!c || c.status !== 'ready' || c.contentVerified !== true) reject('PAGE_NOT_READY', id);
      if (!c.source) reject('MISSING_SOURCE_SNAPSHOT', id);
      requireCurrent(c.source, sourceStamp);
      return clone(c);
    });
    return {kind:'pages', effect:'proposal', base:stamp(base), source:stamp(sourceStamp), pages:picked, requiresHostAuthorization:true};
  }
  function pagesAccept(p, current, source, allocateId) {
    if (p?.kind !== 'pages') reject('INVALID_PROPOSAL', 'Pages proposal expected.');
    requireCurrent(p.base,current);requireCurrent(p.source,source);
    if (typeof allocateId !== 'function') reject('MISSING_ALLOCATOR','The host allocates native identities.');
    const used=new Set();
    return p.pages.map(c=>{
      const id=text(allocateId(),'new page id',256);
      if(used.has(id)) reject('DUPLICATE_TARGET', id); used.add(id);
      return {id,title:c.title,body:c.body,source:clone(p.source),candidateId:c.id};
    });
  }
  const PROFILES = new Set(['review','public','backup']);
  function deliveryPolicy(profile, evidence) {
    if (!PROFILES.has(profile) || !plain(evidence)) reject('INVALID_PROFILE','Delivery profile required.');
    const required=profile==='public'?['content','native','privacy']:['content','native'];
    const blockers=required.filter(k=>evidence[k]!=='passed');
    const partial=['layout','visual'].filter(k=>evidence[k]!=='passed');
    return {profile,canPrepare:blockers.length===0,blockers,partial,
      includePrivate:profile==='backup', publicManifest:profile==='public',
      projectSaveBlocked:false};
  }
  function readyDelivery(profile, evidence, artifacts, captured, current) {
    const policy=deliveryPolicy(profile,evidence);
    if(!policy.canPrepare) reject('DELIVERY_BLOCKED',policy.blockers.join(', '));
    if(!sameValue(captured,current)) reject('INPUTS_CHANGED','Create a new candidate for these inputs.');
    if(!Array.isArray(artifacts)||!artifacts.length) reject('MISSING_ARTIFACTS','No real output bytes were generated.');
    const seen=new Set();
    const out=artifacts.map(a=>{
      if(typeof a.name!=='string'||!a.name.trim()||a.name.length>255||/[\\/\u0000-\u001f:\u007f]/.test(a.name)||a.name==='.'||a.name==='..'||seen.has(a.name)) reject('INVALID_ARTIFACT','Invalid or duplicate name.');
      seen.add(a.name);
      if(a.state!=='verified'||!Number.isSafeInteger(a.byteLength)||a.byteLength<1||!/^[a-f0-9]{64}$/.test(a.sha256)) reject('UNVERIFIED_ARTIFACT',a.name);
      // Allowlist intentionally omits source text, local paths, internal notes and complete snapshots.
      return {name:a.name,byteLength:a.byteLength,sha256:a.sha256};
    });
    return {state:'ready',profile,artifacts:out,partial:policy.partial};
  }
  /** UI ownership only. This does not replace editor selection or native window services. */
  class WorkContext {
    constructor() {this.panel=null;this.anchor=null;this.disposed=false;}
    open(panel, anchor) {
      if(this.disposed) reject('DISPOSED','Context closed.');
      text(panel,'panel',64); this.panel=panel;this.anchor=clone(anchor);return this.snapshot();
    }
    close(current) {
      const anchor=this.anchor;this.panel=null;this.anchor=null;
      if(!anchor||!equalStamp(anchor.stamp,current)) return null;
      return clone(anchor);
    }
    snapshot(){return {panel:this.panel,anchor:clone(this.anchor)};}
    dispose(){this.panel=null;this.anchor=null;this.disposed=true;}
  }
  return Object.freeze({ContractError,stamp,equalStamp,requireCurrent,sameValue,auditStatus,
    geometryProposal,validateGeometryAccept,overlapNote,overlapNoteApplies,planTemplate,templateAccept,
    planExtraction,extractionAccept,retryPage,planPages,pagesAccept,deliveryPolicy,readyDelivery,WorkContext});
});
