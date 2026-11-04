/**
 * Which notarization failures are worth another attempt.
 *
 * A notarization upload carries a few hundred megabytes over whatever network
 * the machine has. Measured 2026-11-04: an upload aborted on part 22 of 285 MB
 * with `Network.NWError error 60`, and one blip discarded a 40-minute Mac
 * chain. Only TRANSIENT failures may be retried — an upload that never
 * finished, a dropped connection, notarytool's own timeout — because
 * resubmitting unchanged bytes is harmless.
 *
 * Anything Apple actually judged (Invalid, Rejected, unsigned, bad
 * signature) is final on the first answer. Retrying a verdict turns a refusal
 * into a slower refusal and, worse, teaches the pipeline to keep asking a
 * question that has been answered.
 */

const TRANSIENT = [
  /Network\.NWError/i,
  /Operation timed out/i,
  /abortedUpload/i,
  /Could not connect/i,
  /connection (?:was )?(?:reset|closed|refused)/i,
  /request timed out/i,
  /timed out after/i,
  /stream error/i,
  /\bNSURLErrorDomain\b/i,
];

const VERDICT = [
  /status:\s*Invalid\b/i,
  /status:\s*Rejected\b/i,
  /The software is not signed/i,
  /not signed with a valid Developer ID/i,
  /Invalid signature/i,
  /The signature of the binary is invalid/i,
  /bundle format (?:is )?invalid/i,
];

/**
 * @returns {"verdict"|"transient"|"other"}
 */
export function classifyNotaryFailure(output) {
  const text = String(output || "");
  // A verdict always wins: a log that carries both "Invalid" and a network
  // line is a judgement, and retrying it would be asking again.
  if (VERDICT.some((pattern) => pattern.test(text))) return "verdict";
  if (TRANSIENT.some((pattern) => pattern.test(text))) return "transient";
  return "other";
}
