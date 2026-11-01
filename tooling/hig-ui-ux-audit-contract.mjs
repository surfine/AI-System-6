// Internal data contracts for the HIG UI/UX audit.
//
// These artifacts are evidence indexes, not browser runtime APIs. Keep this
// module dependency-free so feature contracts and one-off audit tooling can
// validate receipts without pulling schema machinery into the product bundle.

export const higAuditSchemaVersion = "1.0.0";

export const interactionKinds = Object.freeze([
  "window-entry",
  "window-exit",
  "window-control",
  "dialog",
  "menu-command",
  "runtime-command",
  "finder-action",
  "keyboard-shortcut",
  "pointer-event",
  "drag-drop",
  "direct-listener",
]);

export const auditSeverities = Object.freeze(["P0", "P1", "P2", "P3"]);
export const auditConfidenceLevels = Object.freeze(["High", "Medium", "Low"]);
export const coverageStatuses = Object.freeze(["not-run", "passed", "failed", "blocked", "manual-required"]);

const sourceLocationSchema = Object.freeze({
  type: "object",
  required: ["file", "line", "column"],
  properties: {
    file: { type: "string", minLength: 1 },
    line: { type: "integer", minimum: 1 },
    column: { type: "integer", minimum: 0 },
  },
  additionalProperties: false,
});

export const interactionLedgerSchema = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ai-system-6.local/schemas/hig-interaction-ledger.schema.json",
  title: "AI System 6 HIG interaction ledger",
  type: "object",
  required: ["schemaVersion", "kind", "source", "summary", "windows", "interactions"],
  properties: {
    schemaVersion: { const: higAuditSchemaVersion },
    kind: { const: "interaction-ledger" },
    source: {
      type: "object",
      required: ["commit", "filesScanned", "generatedAt"],
      properties: {
        commit: { type: "string", minLength: 1 },
        filesScanned: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
        generatedAt: { type: "string", format: "date-time" },
      },
      additionalProperties: false,
    },
    summary: {
      type: "object",
      required: ["windowCount", "interactionCount", "sourceFileCount"],
      properties: {
        windowCount: { type: "integer", minimum: 1 },
        interactionCount: { type: "integer", minimum: 1 },
        sourceFileCount: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    windows: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "declaredBy", "contract", "entryActions", "exitActions"],
        properties: {
          id: { type: "string", minLength: 1 },
          declaredBy: { type: "array", minItems: 1, items: sourceLocationSchema },
          contract: { anyOf: [{ type: "null" }, { type: "object" }] },
          entryActions: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
          exitActions: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    },
    interactions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: [
          "id", "kind", "action", "ownerWindow", "handler", "event", "source",
          "stateTransition", "persistenceImpact", "receipt", "alternativeInputs",
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          kind: { enum: interactionKinds },
          action: { type: "string" },
          ownerWindow: { type: "string" },
          handler: { type: "string" },
          event: { type: "string" },
          source: sourceLocationSchema,
          stateTransition: { type: "string", minLength: 1 },
          persistenceImpact: { type: "string", minLength: 1 },
          receipt: { type: "string", minLength: 1 },
          alternativeInputs: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
});

export const findingsSchema = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ai-system-6.local/schemas/hig-findings.schema.json",
  title: "AI System 6 HIG findings",
  type: "object",
  required: ["schemaVersion", "kind", "sourceCommit", "findings"],
  properties: {
    schemaVersion: { const: higAuditSchemaVersion },
    kind: { const: "findings" },
    sourceCommit: { type: "string", minLength: 1 },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id", "ruleId", "title", "severity", "confidence", "expected", "actual",
          "affected", "reproduction", "evidence", "recommendation", "verification",
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          ruleId: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          severity: { enum: auditSeverities },
          confidence: { enum: auditConfidenceLevels },
          expected: { type: "string", minLength: 1 },
          actual: { type: "string", minLength: 1 },
          affected: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, uniqueItems: true },
          reproduction: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          evidence: { type: "array", minItems: 1, items: sourceLocationSchema },
          recommendation: { type: "string", minLength: 1 },
          verification: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
});

export const coverageMatrixSchema = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ai-system-6.local/schemas/hig-coverage-matrix.schema.json",
  title: "AI System 6 HIG coverage matrix",
  type: "object",
  required: ["schemaVersion", "kind", "sourceCommit", "dimensions", "entries"],
  properties: {
    schemaVersion: { const: higAuditSchemaVersion },
    kind: { const: "coverage-matrix" },
    sourceCommit: { type: "string", minLength: 1 },
    dimensions: {
      type: "object",
      required: ["devices", "orientations", "inputs", "languages", "themes", "states"],
      properties: {
        devices: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, uniqueItems: true },
        orientations: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, uniqueItems: true },
        inputs: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, uniqueItems: true },
        languages: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, uniqueItems: true },
        themes: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, uniqueItems: true },
        states: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, uniqueItems: true },
      },
      additionalProperties: false,
    },
    entries: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["interactionId", "device", "orientation", "input", "language", "theme", "state", "status", "evidence"],
        properties: {
          interactionId: { type: "string", minLength: 1 },
          device: { type: "string", minLength: 1 },
          orientation: { type: "string", minLength: 1 },
          input: { type: "string", minLength: 1 },
          language: { type: "string", minLength: 1 },
          theme: { type: "string", minLength: 1 },
          state: { type: "string", minLength: 1 },
          status: { enum: coverageStatuses },
          evidence: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pushError(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function requireString(value, path, errors, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && !value.length)) pushError(errors, path, "expected a non-empty string");
}

function requireArray(value, path, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    pushError(errors, path, "expected an array");
    return false;
  }
  if (!allowEmpty && value.length === 0) pushError(errors, path, "expected at least one item");
  return true;
}

function validateLocation(value, path, errors) {
  if (!isObject(value)) return pushError(errors, path, "expected a source location object");
  requireString(value.file, `${path}.file`, errors);
  if (!Number.isInteger(value.line) || value.line < 1) pushError(errors, `${path}.line`, "expected an integer >= 1");
  if (!Number.isInteger(value.column) || value.column < 0) pushError(errors, `${path}.column`, "expected an integer >= 0");
}

function finishValidation(errors) {
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateInteractionLedger(value) {
  const errors = [];
  if (!isObject(value)) return finishValidation(["$: expected an object"]);
  if (value.schemaVersion !== higAuditSchemaVersion) pushError(errors, "$.schemaVersion", `expected ${higAuditSchemaVersion}`);
  if (value.kind !== "interaction-ledger") pushError(errors, "$.kind", "expected interaction-ledger");
  if (!isObject(value.source)) pushError(errors, "$.source", "expected an object");
  else {
    requireString(value.source.commit, "$.source.commit", errors);
    requireString(value.source.generatedAt, "$.source.generatedAt", errors);
    if (requireArray(value.source.filesScanned, "$.source.filesScanned", errors)) {
      value.source.filesScanned.forEach((file, index) => requireString(file, `$.source.filesScanned[${index}]`, errors));
    }
  }
  if (!isObject(value.summary)) pushError(errors, "$.summary", "expected an object");
  else for (const key of ["windowCount", "interactionCount", "sourceFileCount"]) {
    if (!Number.isInteger(value.summary[key]) || value.summary[key] < 1) pushError(errors, `$.summary.${key}`, "expected an integer >= 1");
  }
  if (requireArray(value.windows, "$.windows", errors)) value.windows.forEach((windowRecord, index) => {
    const path = `$.windows[${index}]`;
    if (!isObject(windowRecord)) return pushError(errors, path, "expected an object");
    requireString(windowRecord.id, `${path}.id`, errors);
    if (requireArray(windowRecord.declaredBy, `${path}.declaredBy`, errors)) {
      windowRecord.declaredBy.forEach((location, locationIndex) => validateLocation(location, `${path}.declaredBy[${locationIndex}]`, errors));
    }
    if (windowRecord.contract !== null && !isObject(windowRecord.contract)) pushError(errors, `${path}.contract`, "expected an object or null");
    for (const key of ["entryActions", "exitActions"]) {
      if (requireArray(windowRecord[key], `${path}.${key}`, errors, { allowEmpty: true })) {
        windowRecord[key].forEach((item, itemIndex) => requireString(item, `${path}.${key}[${itemIndex}]`, errors));
      }
    }
  });
  if (requireArray(value.interactions, "$.interactions", errors)) value.interactions.forEach((interaction, index) => {
    const path = `$.interactions[${index}]`;
    if (!isObject(interaction)) return pushError(errors, path, "expected an object");
    requireString(interaction.id, `${path}.id`, errors);
    if (!interactionKinds.includes(interaction.kind)) pushError(errors, `${path}.kind`, "unknown interaction kind");
    for (const key of ["action", "ownerWindow", "handler", "event"]) requireString(interaction[key], `${path}.${key}`, errors, { allowEmpty: true });
    for (const key of ["stateTransition", "persistenceImpact", "receipt"]) requireString(interaction[key], `${path}.${key}`, errors);
    validateLocation(interaction.source, `${path}.source`, errors);
    if (requireArray(interaction.alternativeInputs, `${path}.alternativeInputs`, errors, { allowEmpty: true })) {
      interaction.alternativeInputs.forEach((item, itemIndex) => requireString(item, `${path}.alternativeInputs[${itemIndex}]`, errors));
    }
  });
  return finishValidation(errors);
}

export function validateFindings(value) {
  const errors = [];
  if (!isObject(value)) return finishValidation(["$: expected an object"]);
  if (value.schemaVersion !== higAuditSchemaVersion) pushError(errors, "$.schemaVersion", `expected ${higAuditSchemaVersion}`);
  if (value.kind !== "findings") pushError(errors, "$.kind", "expected findings");
  requireString(value.sourceCommit, "$.sourceCommit", errors);
  if (requireArray(value.findings, "$.findings", errors, { allowEmpty: true })) value.findings.forEach((finding, index) => {
    const path = `$.findings[${index}]`;
    if (!isObject(finding)) return pushError(errors, path, "expected an object");
    for (const key of ["id", "ruleId", "title", "expected", "actual", "recommendation", "verification"]) {
      requireString(finding[key], `${path}.${key}`, errors);
    }
    if (!auditSeverities.includes(finding.severity)) pushError(errors, `${path}.severity`, "unknown severity");
    if (!auditConfidenceLevels.includes(finding.confidence)) pushError(errors, `${path}.confidence`, "unknown confidence");
    for (const key of ["affected", "reproduction"]) {
      if (requireArray(finding[key], `${path}.${key}`, errors)) finding[key].forEach((item, itemIndex) => requireString(item, `${path}.${key}[${itemIndex}]`, errors));
    }
    if (requireArray(finding.evidence, `${path}.evidence`, errors)) {
      finding.evidence.forEach((location, locationIndex) => validateLocation(location, `${path}.evidence[${locationIndex}]`, errors));
    }
  });
  return finishValidation(errors);
}

export function validateCoverageMatrix(value) {
  const errors = [];
  if (!isObject(value)) return finishValidation(["$: expected an object"]);
  if (value.schemaVersion !== higAuditSchemaVersion) pushError(errors, "$.schemaVersion", `expected ${higAuditSchemaVersion}`);
  if (value.kind !== "coverage-matrix") pushError(errors, "$.kind", "expected coverage-matrix");
  requireString(value.sourceCommit, "$.sourceCommit", errors);
  const dimensionKeys = ["devices", "orientations", "inputs", "languages", "themes", "states"];
  if (!isObject(value.dimensions)) pushError(errors, "$.dimensions", "expected an object");
  else for (const key of dimensionKeys) {
    if (requireArray(value.dimensions[key], `$.dimensions.${key}`, errors)) {
      value.dimensions[key].forEach((item, index) => requireString(item, `$.dimensions.${key}[${index}]`, errors));
    }
  }
  if (requireArray(value.entries, "$.entries", errors)) value.entries.forEach((entry, index) => {
    const path = `$.entries[${index}]`;
    if (!isObject(entry)) return pushError(errors, path, "expected an object");
    for (const key of ["interactionId", "device", "orientation", "input", "language", "theme", "state"]) {
      requireString(entry[key], `${path}.${key}`, errors);
    }
    if (!coverageStatuses.includes(entry.status)) pushError(errors, `${path}.status`, "unknown coverage status");
    if (requireArray(entry.evidence, `${path}.evidence`, errors, { allowEmpty: true })) {
      entry.evidence.forEach((item, itemIndex) => requireString(item, `${path}.evidence[${itemIndex}]`, errors));
    }
  });
  return finishValidation(errors);
}

export function assertValidAuditArtifacts({ interactionLedger, findings, coverageMatrix }) {
  const reports = Object.freeze({
    interactionLedger: validateInteractionLedger(interactionLedger),
    findings: validateFindings(findings),
    coverageMatrix: validateCoverageMatrix(coverageMatrix),
  });
  const errors = Object.entries(reports).flatMap(([name, report]) => report.errors.map((error) => `${name}${error}`));
  if (errors.length) throw new TypeError(`Invalid HIG audit artifacts:\n${errors.join("\n")}`);
  return reports;
}
