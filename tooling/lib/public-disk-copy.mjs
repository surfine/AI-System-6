// Public disks are copies: private source text and record identities stay put.
// Match the private policy literally, then let the caller reseal the backup.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const policyPath = fileURLToPath(new URL("../../internal/agents/pii-patterns.json", import.meta.url));
export function loadIdentityReplacements(path = policyPath) {
  const policy = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(policy?.patterns) || !policy.patterns.length
    || policy.patterns.some((entry) => typeof entry?.value !== "string" || !entry.value.trim())) {
    throw new Error("Public disk identity policy is invalid; refusing to generate output.");
  }
  return policy.patterns.map(({ value }) => ({ value, replacement: "某位重要的人" }));
}

export function copyWithIdentityReplacements(value, replacements) {
  if (typeof value === "string") {
    return replacements.reduce((text, { value: name, replacement }) => text.split(name).join(replacement), value);
  }
  if (Array.isArray(value)) return value.map((item) => copyWithIdentityReplacements(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      // Never rewrite identifiers or references: a collision would corrupt
      // the imported graph. The separate leak gate still checks those fields.
      (key === "id" || key.endsWith("Id")) && typeof child === "string"
        ? child : copyWithIdentityReplacements(child, replacements),
    ]));
  }
  return value;
}
