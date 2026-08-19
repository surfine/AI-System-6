const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export const HISTORICAL_FIDELITY_THEMES = Object.freeze([
  "platinum",
  "aqua",
  "snow-leopard",
  "yosemite",
]);

// This is a removal ratchet, not a quota. Every specimen that was part of the
// first hard-gated historical contract remains required; new specimens can be
// added without changing this list, but an existing state cannot silently
// disappear from the manifest and leave the release gate green.
export const REQUIRED_FIDELITY_SPECIMENS = Object.freeze({
  platinum: Object.freeze([
    "active-titlebar",
    "inactive-titlebar",
    "selected-tab",
    "popup-normal",
    "checkbox-checked",
    "checkbox-unchecked",
    "default-ok",
    "open-list-scrollbar",
    "apple-menu",
    "about-alert",
    "icon-finder-32",
    "icon-folder-32",
    "icon-hard-disk-32",
    "icon-trash-32",
    "icon-document-32",
    "icon-cd-32",
    "icon-floppy-32",
    "icon-application-16",
    "icon-trash-16",
    "button-disabled",
  ]),
  aqua: Object.freeze([
    "active-titlebar",
    "inactive-titlebar",
    "button-normal",
    "button-default",
    "popup-normal",
    "checkbox-checked",
    "radio-selected",
    "selected-tab",
    "column-browser",
    "vertical-scrollbar",
    "finder-toolbar",
    "finder-status",
    "menu-selected-item",
    "button-disabled",
    "list-row-disabled",
    "titlebar-lamps",
    "titlebar-lamps-minimize",
    "titlebar-lamps-zoom",
    "search-field-focused",
  ]),
  "snow-leopard": Object.freeze([
    "active-titlebar",
    "button-normal",
    "button-default",
    "checkbox-checked",
    "radio-selected",
    "popup-normal",
    "selected-tab",
    "scrollbar-thumb",
    "scrollbar-track",
    "menu-selected",
    "list-selected",
    "search-field",
    "finder-toolbar",
    "source-list-selected",
    "checkbox-disabled",
    "radio-disabled",
    "search-field-focused",
  ]),
  yosemite: Object.freeze([
    "checkbox-checked",
    "checkbox-unchecked",
    "radio-checked",
    "title-close",
    "title-minimize",
    "title-maximize",
    "menu-selected",
    "list-selected",
    "sidebar-active",
    "sidebar-inactive",
    "search-field",
    "segmented-control",
    "textfield",
    "dialog",
    "button-pressed",
    "popup",
    "button-default",
    "inactive-titlebar",
    "search-field-focused",
  ]),
});

// The absolute fidelity floor: what "this is the same control" means.
//
// Read this together with the per-specimen `tolerances`. The two tiers answer
// two different questions and must never be merged:
//
//   tolerances  — the regression tier. Seeded from our own recorded run with a
//                 margin, so it detects "today drifted from yesterday". A board
//                 can pass this tier while looking nothing like the target.
//   FIDELITY_FLOOR — the absolute tier. Derived from the metric definitions,
//                 never from our own output, and identical for every specimen
//                 and every era, so no single specimen can be quietly loosened.
//
// The three numbers restate the metrics in `analyzeGeometryAndMaterial`:
//   geometryMismatch  share of the reference silhouette with no current edge
//                     within 8px  -> at most 5% of the outline may be absent
//   edgeErrorPx       mean distance from a reference edge to the nearest
//                     current edge -> the outline sits within 1.5px at 1x
//                     (scaled by the board's deviceScaleFactor)
//   materialError     mean channel delta on interior pixels, ignoring edges
//                     and text -> within 12 of 255, about 4.7% of the range
//   markMismatch      1 - IoU of the two glyph masks, measured only where a
//                     specimen declares `mark` -> at most 35% of the combined
//                     glyph area may disagree. Scale-free, so a Retina board
//                     keeps the same number.
export const FIDELITY_FLOOR = Object.freeze({
  geometryMismatch: 0.05,
  edgeErrorPx: 1.5,
  materialError: 12,
  markMismatch: 0.35,
});

// The three metrics measured for every specimen. markMismatch is conditional —
// it needs a glyph to compare — so it is not in this list; the harness appends it
// for specimens that declare `mark`.
export const FLOOR_METRICS = Object.freeze(["geometryMismatch", "edgeErrorPx", "materialError"]);

export const MARK_METRIC = "markMismatch";

export const FLOOR_STATUSES = Object.freeze(["met", "gap", "unreliable-reference"]);

export function floorForCapture(capture = {}) {
  const scale = Number(capture.deviceScaleFactor) || 1;
  return Object.freeze({
    geometryMismatch: FIDELITY_FLOOR.geometryMismatch,
    edgeErrorPx: FIDELITY_FLOOR.edgeErrorPx * scale,
    materialError: FIDELITY_FLOOR.materialError,
    markMismatch: FIDELITY_FLOOR.markMismatch,
  });
}

// Retina (deviceScaleFactor 2) acceptance boards are supplementary control
// acceptance surfaces, not the main historical contract: they pin a subset of
// controls at 2x (e.g. yosemite-2x.json) and keep their own removal ratchet.
export const REQUIRED_DPR2_SPECIMENS = Object.freeze({
  yosemite: Object.freeze([
    "checkbox-checked",
    "radio-checked",
    "title-close",
    "title-minimize",
    "title-maximize",
  ]),
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalid(label, message) {
  throw new Error(`${label}: ${message}`);
}

function requireRecord(value, label) {
  if (!isRecord(value)) invalid(label, "must be an object");
  return value;
}

function requireArray(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value)) invalid(label, "must be an array");
  if (nonEmpty && value.length === 0) invalid(label, "must not be empty");
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) invalid(label, "must be a non-empty string");
  return value;
}

function requireFinite(value, label, { minimum = -Infinity, integer = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(label, "must be a finite number");
  if (integer && !Number.isInteger(value)) invalid(label, "must be an integer");
  if (value < minimum) invalid(label, `must be at least ${minimum}`);
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") invalid(label, "must be a Boolean");
}

function requireStringRecord(value, label) {
  const record = requireRecord(value, label);
  for (const [key, entry] of Object.entries(record)) {
    requireString(key, `${label} key`);
    if (typeof entry !== "string") invalid(`${label}.${key}`, "must be a string");
  }
  return record;
}

function validateSize(value, label) {
  const size = requireRecord(value, label);
  requireFinite(size.width, `${label}.width`, { minimum: 1 });
  requireFinite(size.height, `${label}.height`, { minimum: 1 });
}

function validateCrop(value, label, { optional = false } = {}) {
  if (value === undefined && optional) return;
  const crop = requireRecord(value, label);
  for (const axis of ["x", "y"]) {
    if (crop[axis] !== undefined) requireFinite(crop[axis], `${label}.${axis}`);
  }
  for (const dimension of ["width", "height"]) {
    if (crop[dimension] === undefined && optional) continue;
    requireFinite(crop[dimension], `${label}.${dimension}`, { minimum: 1 });
  }
}

function validateUrl(value, label) {
  const raw = requireString(value, label);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    invalid(label, "must be an absolute URL");
  }
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) invalid(label, "must use http or https");
}

function validateFixtureAssertions(assertions, label) {
  requireArray(assertions, label, { nonEmpty: true }).forEach((assertion, index) => {
    const assertionLabel = `${label}[${index}]`;
    requireRecord(assertion, assertionLabel);
    requireString(assertion.selector, `${assertionLabel}.selector`);
    requireFinite(assertion.count, `${assertionLabel}.count`, { minimum: 0, integer: true });
    if (assertion.visible !== undefined) requireBoolean(assertion.visible, `${assertionLabel}.visible`);
    if (assertion.text !== undefined && typeof assertion.text !== "string") {
      invalid(`${assertionLabel}.text`, "must be a string");
    }
    if (assertion.attributes !== undefined) {
      requireStringRecord(assertion.attributes, `${assertionLabel}.attributes`);
    }
  });
}

function validateFontContract(capture, label) {
  const probes = requireArray(capture.fontProbeSelectors, `${label}.fontProbeSelectors`, { nonEmpty: true });
  probes.forEach((selector, index) => requireString(selector, `${label}.fontProbeSelectors[${index}]`));
  requireArray(capture.fontAssertions, `${label}.fontAssertions`, { nonEmpty: true }).forEach((assertion, index) => {
    const assertionLabel = `${label}.fontAssertions[${index}]`;
    requireRecord(assertion, assertionLabel);
    requireString(assertion.selector, `${assertionLabel}.selector`);
    requireString(assertion.requiredFamily, `${assertionLabel}.requiredFamily`);
    requireBoolean(assertion.isCustomFont, `${assertionLabel}.isCustomFont`);
  });
}

function validateCapture(capture) {
  const label = "capture";
  requireRecord(capture, label);
  validateSize(capture.viewport, `${label}.viewport`);
  validateSize(capture.screen, `${label}.screen`);
  validateSize(capture.windowSize, `${label}.windowSize`);
  requireFinite(capture.deviceScaleFactor, `${label}.deviceScaleFactor`, { minimum: 0.01 });
  requireFinite(capture.zoom, `${label}.zoom`, { minimum: 0.01 });
  for (const key of [
    "locale",
    "timezoneId",
    "colorScheme",
    "reducedMotion",
    "forcedColors",
    "colorSpace",
    "playwrightVersion",
    "browserRevision",
    "browserVersion",
    "historicalFontTarget",
  ]) requireString(capture[key], `${label}.${key}`);
  if (!SHA256_PATTERN.test(String(capture.contentSha256 || ""))) {
    invalid(`${label}.contentSha256`, "must be a lowercase SHA-256 digest");
  }
  if (capture.sourceScale !== undefined) {
    requireFinite(capture.sourceScale, `${label}.sourceScale`, { minimum: 0.01 });
  }
  for (const key of ["requiredResources", "requiredResourcePrefixes"]) {
    requireArray(capture[key], `${label}.${key}`).forEach((entry, index) => {
      requireString(entry, `${label}.${key}[${index}]`);
    });
  }
  validateFixtureAssertions(capture.fixtureAssertions, `${label}.fixtureAssertions`);
  validateFontContract(capture, label);
}

function validateSources(sources) {
  const byId = new Map();
  const files = new Set();
  requireArray(sources, "sources", { nonEmpty: true }).forEach((source, index) => {
    const label = `sources[${index}]`;
    requireRecord(source, label);
    const id = requireString(source.id, `${label}.id`);
    if (byId.has(id)) invalid(`${label}.id`, `duplicates ${id}`);
    const file = requireString(source.file, `${label}.file`);
    if (file.includes("/") || file.includes("\\") || file === "." || file === "..") {
      invalid(`${label}.file`, "must be a cache-local file name");
    }
    if (files.has(file)) invalid(`${label}.file`, `duplicates ${file}`);
    validateUrl(source.url, `${label}.url`);
    validateUrl(source.pageUrl, `${label}.pageUrl`);
    if (!SHA256_PATTERN.test(String(source.sha256 || ""))) {
      invalid(`${label}.sha256`, "must be a lowercase SHA-256 digest");
    }
    requireFinite(source.width, `${label}.width`, { minimum: 1, integer: true });
    requireFinite(source.height, `${label}.height`, { minimum: 1, integer: true });
    for (const key of ["systemVersion", "credit", "redistribution"]) {
      requireString(source[key], `${label}.${key}`);
    }
    byId.set(id, source);
    files.add(file);
  });
  return byId;
}

function validateSetup(setup, label) {
  if (setup === undefined) return;
  requireArray(setup, label).forEach((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    requireRecord(entry, entryLabel);
    requireString(entry.selector, `${entryLabel}.selector`);
    const hasMutation = entry.style !== undefined || entry.attributes !== undefined || entry.text !== undefined;
    if (!hasMutation) invalid(entryLabel, "must define style, attributes, or text");
    if (entry.style !== undefined) requireStringRecord(entry.style, `${entryLabel}.style`);
    if (entry.attributes !== undefined) requireStringRecord(entry.attributes, `${entryLabel}.attributes`);
    if (entry.text !== undefined && typeof entry.text !== "string") {
      invalid(`${entryLabel}.text`, "must be a string");
    }
  });
}

function validateComputedStyleAssertions(assertions, label) {
  if (assertions === undefined) return;
  requireArray(assertions, label, { nonEmpty: true }).forEach((assertion, index) => {
    const assertionLabel = `${label}[${index}]`;
    requireRecord(assertion, assertionLabel);
    requireString(assertion.selector, `${assertionLabel}.selector`);
    requireString(assertion.property, `${assertionLabel}.property`);
    const hasExpected = Object.hasOwn(assertion, "expected");
    const hasContains = Object.hasOwn(assertion, "expectedContains");
    if (hasExpected === hasContains) {
      invalid(assertionLabel, "must define exactly one of expected or expectedContains");
    }
    if (hasContains) requireString(assertion.expectedContains, `${assertionLabel}.expectedContains`);
  });
}

function validateTolerances(tolerances, label, { required, hasMark = false }) {
  if (tolerances === null) {
    if (required) invalid(label, "cannot be diagnostic-only for a required specimen");
    return;
  }
  requireRecord(tolerances, label);
  const keys = hasMark ? [...FLOOR_METRICS, MARK_METRIC] : FLOOR_METRICS;
  for (const key of keys) {
    requireFinite(tolerances[key], `${label}.${key}`, { minimum: 0 });
  }
}

// A gated specimen must declare where it stands against FIDELITY_FLOOR. The
// declaration is a ledger, not a tuning knob: `failing` and `exempt` name the
// metrics that are not floor-asserted, and every other metric is. The harness
// also fails when a `failing` metric starts to meet the floor, so an
// improvement cannot hide behind a stale entry.
// A specimen that carries a glyph inside the control declares it, which turns on
// the mark metric. `inset` drops the control frame before the glyph is isolated;
// `threshold` is the luminance distance from the control's own interior median
// that counts as glyph.
function validateMark(mark, label) {
  if (mark === undefined) return false;
  requireRecord(mark, label);
  if (mark.inset !== undefined) requireFinite(mark.inset, `${label}.inset`, { minimum: 0, integer: true });
  if (mark.threshold !== undefined) requireFinite(mark.threshold, `${label}.threshold`, { minimum: 1 });
  requireString(mark.note, `${label}.note`);
  return true;
}

function validateFloor(floor, label, { required, hasMark }) {
  if (floor === undefined || floor === null) {
    if (required) invalid(label, "is required for a gated specimen");
    return;
  }
  requireRecord(floor, label);
  const status = requireString(floor.status, `${label}.status`);
  if (!FLOOR_STATUSES.includes(status)) {
    invalid(`${label}.status`, `must be one of ${FLOOR_STATUSES.join(", ")}`);
  }
  const allowed = hasMark ? [...FLOOR_METRICS, MARK_METRIC] : FLOOR_METRICS;
  const metricList = (value, key) => {
    if (value === undefined) return [];
    const list = requireArray(value, `${label}.${key}`);
    list.forEach((metric, index) => {
      const name = requireString(metric, `${label}.${key}[${index}]`);
      if (!allowed.includes(name)) {
        invalid(
          `${label}.${key}[${index}]`,
          name === MARK_METRIC
            ? "cannot be listed unless the specimen declares a mark"
            : `must be one of ${allowed.join(", ")}`,
        );
      }
    });
    if (new Set(list).size !== list.length) invalid(`${label}.${key}`, "repeats a metric");
    return list;
  };
  const failing = metricList(floor.failing, "failing");
  const exempt = metricList(floor.exempt, "exempt");
  for (const metric of failing) {
    if (exempt.includes(metric)) invalid(`${label}.failing`, `${metric} is also listed as exempt`);
  }
  if (exempt.length && status !== "unreliable-reference") {
    invalid(`${label}.status`, "must be unreliable-reference when a metric is exempt");
  }
  if (status === "unreliable-reference" && !exempt.length) {
    invalid(`${label}.exempt`, "must name the metric the reference cannot support");
  }
  if (status === "gap" && !failing.length) {
    invalid(`${label}.failing`, "must name the metric that exceeds the floor");
  }
  if (status === "met" && (failing.length || exempt.length)) {
    invalid(`${label}.status`, "cannot be met while a metric is listed as failing or exempt");
  }
  if (status !== "met") requireString(floor.note, `${label}.note`);
}

function validateSpecimens(specimens, sourcesById, theme, requiredList) {
  const requiredIds = new Set(requiredList);
  const seen = new Set();
  requireArray(specimens, "specimens", { nonEmpty: true }).forEach((specimen, index) => {
    const label = `specimens[${index}]`;
    requireRecord(specimen, label);
    const id = requireString(specimen.id, `${label}.id`);
    if (seen.has(id)) invalid(`${label}.id`, `duplicates ${id}`);
    seen.add(id);
    requireString(specimen.label, `${label}.label`);

    const reference = requireRecord(specimen.reference, `${label}.reference`);
    const sourceId = requireString(reference.source, `${label}.reference.source`);
    const source = sourcesById.get(sourceId);
    if (!source) invalid(`${label}.reference.source`, `unknown source ${sourceId}`);
    validateCrop(reference.crop, `${label}.reference.crop`);
    const crop = reference.crop;
    const x = Number(crop.x || 0);
    const y = Number(crop.y || 0);
    if (x < 0 || y < 0 || x + crop.width > source.width || y + crop.height > source.height) {
      invalid(`${label}.reference.crop`, `is outside source ${sourceId} (${source.width}x${source.height})`);
    }

    const current = requireRecord(specimen.current, `${label}.current`);
    requireString(current.selector, `${label}.current.selector`);
    validateCrop(current.crop, `${label}.current.crop`, { optional: true });
    validateSetup(current.setup, `${label}.current.setup`);

    if (!Object.hasOwn(specimen, "tolerances")) invalid(`${label}.tolerances`, "is required");
    const hasMark = validateMark(specimen.mark, `${label}.mark`);
    validateTolerances(specimen.tolerances, `${label}.tolerances`, { required: requiredIds.has(id), hasMark });
    validateFloor(specimen.floor, `${label}.floor`, { required: specimen.tolerances !== null, hasMark });
    if (specimen.repeat !== undefined) {
      const repeat = requireRecord(specimen.repeat, `${label}.repeat`);
      requireFinite(repeat.maxChangedPixels, `${label}.repeat.maxChangedPixels`, { minimum: 0, integer: true });
      requireFinite(repeat.maxChannelDelta, `${label}.repeat.maxChannelDelta`, { minimum: 0 });
    }
    if (specimen.geometryMask !== undefined && specimen.geometryMask !== "text") {
      invalid(`${label}.geometryMask`, "must be text when present");
    }
    validateComputedStyleAssertions(specimen.computedStyleAssertions, `${label}.computedStyleAssertions`);
  });

  const missing = [...requiredIds].filter((id) => !seen.has(id));
  if (missing.length) invalid("specimens", `missing required ${theme} specimen(s): ${missing.join(", ")}`);
}

export function validateFidelityManifest(manifest, { expectedTheme, label = "fidelity manifest" } = {}) {
  requireRecord(manifest, label);
  if (manifest.schemaVersion !== 1) invalid(`${label}.schemaVersion`, `unsupported value ${JSON.stringify(manifest.schemaVersion)}`);
  requireString(manifest.id, `${label}.id`);
  const theme = requireString(manifest.theme, `${label}.theme`);
  if (!HISTORICAL_FIDELITY_THEMES.includes(theme)) {
    invalid(`${label}.theme`, `${theme} has no historical fidelity target`);
  }
  if (expectedTheme !== undefined && theme !== expectedTheme) {
    invalid(`${label}.theme`, `${theme} does not match requested ${expectedTheme}`);
  }
  requireString(manifest.target, `${label}.target`);
  requireString(manifest.fixtureRevision, `${label}.fixtureRevision`);
  requireString(manifest.tolerancePolicy, `${label}.tolerancePolicy`);
  validateCapture(manifest.capture);
  const sourcesById = validateSources(manifest.sources);
  const dpr2 = manifest.capture?.deviceScaleFactor === 2;
  const requiredList = dpr2
    ? REQUIRED_DPR2_SPECIMENS[theme] || []
    : REQUIRED_FIDELITY_SPECIMENS[theme];
  validateSpecimens(manifest.specimens, sourcesById, theme, requiredList);
  if (manifest.output !== undefined) {
    const output = requireRecord(manifest.output, "output");
    requireFinite(output.atlasWidth, "output.atlasWidth", { minimum: 1, integer: true });
    requireFinite(output.columns, "output.columns", { minimum: 1, integer: true });
  }
  return manifest;
}
