import { readFileSync } from "node:fs";
import { Script } from "node:vm";

/**
 * Parse a classic-script source without executing it.
 *
 * Returning the SyntaxError keeps the release verifier's existing
 * collect-all-failures behavior while avoiding one Node process per file.
 */
export function classicScriptSyntaxError(source, filename = "<classic-script>") {
  try {
    new Script(String(source), { filename, displayErrors: true });
    return null;
  } catch (error) {
    return error;
  }
}

export function classicScriptFileSyntaxError(filePath) {
  return classicScriptSyntaxError(readFileSync(filePath, "utf8"), filePath);
}
