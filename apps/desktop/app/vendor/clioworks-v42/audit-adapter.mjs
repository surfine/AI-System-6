/**
 * Proposed ClioWorks adapter for GenOffice's auditSlideFindings output.
 * This is an original, dependency-free integration candidate, NOT GenOffice's
 * layout engine, a file writer, or an authorization layer. The host supplies
 * an identity-checked layout and bindings. No model-supplied approval is read.
 * This module deliberately returns proposals; the existing v4 native adapter
 * must prepare, preview, authorize, commit, and re-audit any accepted change.
 */
const CODES = new Set(['out_of_bounds', 'off_slide', 'text_overflow',
  'text_overflow_width', 'overlap', 'picture_distorted']);
const CHECKS = ['bounds', 'text', 'overlap', 'distortion'];
const CHECK_STATES = new Set(['checked', 'partial', 'not_run']);
const EMU_PER_PT = 12700;

export class AuditAdapterError extends Error {
  constructor(code, message) { super(message); this.name = 'AuditAdapterError'; this.code = code; }
}
function fail(code, message) { throw new AuditAdapterError(code, message); }
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    fail('INVALID_AUDIT', `${label} must be a plain record.`);
  return value;
}
function text(value, label, max = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail('INVALID_AUDIT', `${label} must be non-empty text of at most ${max} characters.`);
  return value;
}
function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_AUDIT', `${label} must be a nonnegative safe integer.`);
  return value;
}
function finite(value, label, limit = 1e9) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit)
    fail('INVALID_AUDIT', `${label} must be a bounded finite number.`);
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function stamp(value) {
  const v = record(value, 'stamp');
  const fontSetHash = text(v.fontSetHash, 'fontSetHash', 64);
  if (!/^[0-9a-f]{64}$/.test(fontSetHash)) fail('INVALID_AUDIT', 'fontSetHash must be a SHA-256 hex digest.');
  return {documentId: text(v.documentId, 'documentId'),
    generation: integer(v.generation, 'generation'), editRevision: integer(v.editRevision, 'editRevision'),
    pageId: text(v.pageId, 'pageId'), layoutResultId: text(v.layoutResultId, 'layoutResultId'), fontSetHash};
}
function sameStamp(a, b) { return Object.keys(a).every(k => a[k] === b[k]); }
function box(value, unit) {
  const v = record(value, 'box');
  if (!['pt', 'emu'].includes(unit)) fail('INVALID_UNIT', 'Only named pt or emu geometry is accepted.');
  const b = {x: finite(v.x, 'x'), y: finite(v.y, 'y'), cx: finite(v.cx, 'cx'), cy: finite(v.cy, 'cy')};
  if (b.cx <= 0 || b.cy <= 0) fail('INVALID_GEOMETRY', 'Box width and height must be positive.');
  if (unit === 'emu') for (const k of Object.keys(b)) b[k] /= EMU_PER_PT;
  return b;
}

/**
 * Input contract is in contracts/audit-adapter.d.ts. Coverage must be assembled
 * by the caller from what the checker ACTUALLY visited. GenOffice currently
 * limits issue output and skips some checks: do not mark complete by default.
 * The returned stamp identifies a layout, not a signed or approved artifact.
 */
export function normalizeAudit(input) {
  const v = record(input, 'input');
  const snapshot = stamp(v.snapshot);
  const layout = stamp(v.layout);
  if (!sameStamp(snapshot, layout)) fail('STALE_LAYOUT', 'The layout no longer represents this document snapshot.');
  if (!['measured', 'unavailable'].includes(v.metrics)) fail('INVALID_AUDIT', 'metrics must describe actual layout measurements.');
  const coverage = record(v.coverage, 'coverage');
  for (const k of CHECKS) if (!CHECK_STATES.has(coverage[k])) fail('INVALID_COVERAGE', `Missing or invalid ${k} coverage.`);
  if (!['complete', 'possibly_truncated'].includes(coverage.reporting)) fail('INVALID_COVERAGE', 'Reporting coverage must be explicit.');
  const copiedCoverage = Object.fromEntries([...CHECKS, 'reporting'].map(k => [k, coverage[k]]));
  if (!Array.isArray(v.bindings) || v.bindings.length > 10000) fail('INVALID_AUDIT', 'Invalid binding count.');
  const bindings = new Map();
  const objectIds = new Set();
  for (const raw of v.bindings) {
    const b = record(raw, 'binding');
    const sourceId = text(b.sourceId, 'sourceId'), objectId = text(b.objectId, 'objectId');
    if (bindings.has(sourceId) || objectIds.has(objectId)) fail('DUPLICATE_BINDING', 'Bindings must be one-to-one within a page.');
    if (typeof b.editable !== 'boolean') fail('INVALID_AUDIT', 'editable must be explicit.');
    objectIds.add(objectId);
    bindings.set(sourceId, {sourceId, objectId, editable: b.editable, before: box(b.box, b.unit)});
  }
  if (!Array.isArray(v.findings) || v.findings.length > 256) fail('INVALID_AUDIT', 'Invalid finding count.');
  const findings = v.findings.map((raw, index) => {
    const f = record(raw, 'finding');
    if (!CODES.has(f.code)) fail('UNKNOWN_AUDIT_CODE', 'Unknown findings require a reviewed adapter update.');
    if (!['error', 'warning'].includes(f.level)) fail('INVALID_AUDIT', 'Invalid finding level.');
    const sourceId = text(f.el, 'finding.el');
    const binding = bindings.get(sourceId);
    const related = f.els === undefined ? [sourceId] : f.els;
    if (!Array.isArray(related) || related.length > 16) fail('INVALID_AUDIT', 'Invalid related element list.');
    const relatedIds = related.map(id => text(id, 'related element'));
    if (!relatedIds.includes(sourceId) || (f.code === 'overlap' && new Set(relatedIds).size < 2))
      fail('INVALID_AUDIT', 'Related elements must include the finding target and identify both members of an overlap.');
    const relatedObjectIds = relatedIds.map(id => bindings.get(id)?.objectId ?? null);
    const mapped = Boolean(binding) && relatedObjectIds.every(id => id !== null);
    let repair = null;
    let repairUnavailable = mapped ? 'NO_SUGGESTION' : 'UNMAPPED_TARGET';
    if (f.suggest) {
      const s = record(f.suggest, 'suggest'), t = record(s.target, 'target');
      if (s.op !== 'setTransform') fail('UNSUPPORTED_REPAIR', 'Only geometry proposals are accepted by this adapter.');
      if (t.el !== sourceId) fail('TARGET_MISMATCH', 'A suggestion must target its own finding.');
      if (t.slide !== undefined && t.slide !== v.slideTarget) fail('TARGET_MISMATCH', 'A suggestion targets another slide.');
      // Unit is intentionally not inferred from the numbers. GenOffice's
      // suggestion box is EMU, even though finding.box is in slide pixels.
      if (v.suggestionUnit !== 'emu') fail('INVALID_UNIT', 'GenOffice suggestions must declare EMU.');
      const after = box(s.box, 'emu');
      const rotation = s.rotDeg === undefined ? undefined : finite(s.rotDeg, 'rotDeg', 36000);
      if (mapped && binding.editable && v.metrics === 'measured') {
        repair = {operation: 'setGeometry', objectId: binding.objectId,
          before: {...binding.before}, after, unit: 'pt',
          ...(rotation === undefined ? {} : {rotationDegrees: rotation})};
        repairUnavailable = '';
      } else if (mapped) repairUnavailable = binding.editable ? 'METRICS_UNAVAILABLE' : 'OBJECT_READ_ONLY';
    }
    return {id: `${snapshot.layoutResultId}:${index}`, code: f.code, level: f.level,
      message: text(f.message, 'message', 4096), sourceId, objectId: binding?.objectId ?? null,
      relatedObjectIds, repair, repairUnavailable};
  });
  const complete = v.metrics === 'measured'
    && CHECKS.every(k => copiedCoverage[k] === 'checked')
    && copiedCoverage.reporting === 'complete';
  return freeze({schema: 1, scope: 'declared-layout-checks-only', snapshot,
    coverage: copiedCoverage, metrics: v.metrics, findings,
    status: findings.length ? 'needs_review' : complete ? 'checks_clear' : 'incomplete',
    visualReview: 'not_run'});
}

/** Select one geometry proposal. Does not change a file or authorize a save. */
export function prepareRepair(report, findingId, currentStamp) {
  const current = stamp(currentStamp);
  if (!report || !sameStamp(stamp(report.snapshot), current)) fail('STALE_AUDIT', 'Run the audit again for the current document and layout.');
  const finding = report.findings?.find(f => f.id === findingId);
  if (!finding) fail('UNKNOWN_FINDING', 'The selected finding is not in this report.');
  if (!finding.repair) fail(finding.repairUnavailable || 'NO_SUGGESTION', 'This finding has no applicable geometry proposal.');
  return freeze({effect: 'proposal', scope: 'one-object',
    baseline: {...current}, findingId, change: structuredClone(finding.repair),
    requiresNativePreview: true, requiresHostAuthorization: true, requiresReaudit: true});
}
