// D3 (2026-10-16): budget and contract numbers in prose are written by
// tooling/sync-doc-facts.mjs from the checks that own them; a stale marked
// value fails here instead of misleading the next reader.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { staleDocFacts } from "../../tooling/sync-doc-facts.mjs";

const test = createFeatureTest("doc-facts");
const stale = staleDocFacts();
test.assert(stale.length === 0, `marked doc facts are current${stale.length ? ` (stale: ${stale.join("; ")}; run node tooling/sync-doc-facts.mjs)` : ""}`);
test.finish();
