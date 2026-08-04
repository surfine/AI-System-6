import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("shared-cloud-budget");
const budget = require("../../src/server/shared-cloud-budget.js");
const stateDirectory = mkdtempSync(join(tmpdir(), "ai-system6-shared-cloud-"));

const envNames = [
  "AI_SYSTEM6_STATE_DIR",
  "AI_SYSTEM6_SHARED_CLOUD_DAILY_TOKEN_BUDGET",
  "AI_SYSTEM6_SHARED_CLOUD_DAILY_REQUEST_LIMIT",
  "AI_SYSTEM6_SHARED_CLOUD_SESSION_REQUEST_LIMIT",
  "AI_SYSTEM6_SHARED_CLOUD_MAX_INPUT_TOKENS",
  "AI_SYSTEM6_SHARED_CLOUD_MAX_OUTPUT_TOKENS",
];
const previousEnvironment = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

try {
  process.env.AI_SYSTEM6_STATE_DIR = stateDirectory;
  process.env.AI_SYSTEM6_SHARED_CLOUD_DAILY_TOKEN_BUDGET = "10000";
  process.env.AI_SYSTEM6_SHARED_CLOUD_DAILY_REQUEST_LIMIT = "3";
  process.env.AI_SYSTEM6_SHARED_CLOUD_SESSION_REQUEST_LIMIT = "2";
  process.env.AI_SYSTEM6_SHARED_CLOUD_MAX_INPUT_TOKENS = "1000";
  process.env.AI_SYSTEM6_SHARED_CLOUD_MAX_OUTPUT_TOKENS = "200";
  budget.resetSharedCloudBudgetCacheForTests();

  const payload = {
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "A bounded shared request" }],
    max_tokens: 200,
  };
  const first = budget.reserveSharedCloudRequest({ sessionNonce: "session-a", payload });
  const second = budget.reserveSharedCloudRequest({ sessionNonce: "session-a", payload });
  const blockedSession = budget.reserveSharedCloudRequest({ sessionNonce: "session-a", payload });
  test.assert(first.ok && second.ok, "a verified session can use its bounded shared allowance");
  test.assert(
    !blockedSession.ok && blockedSession.code === "shared_cloud_session_limit",
    "a session cannot mint unlimited shared requests"
  );

  const third = budget.reserveSharedCloudRequest({ sessionNonce: "session-b", payload });
  const blockedDaily = budget.reserveSharedCloudRequest({ sessionNonce: "session-c", payload });
  test.assert(third.ok, "another verified session can use remaining site allowance");
  test.assert(
    !blockedDaily.ok && blockedDaily.code === "shared_cloud_daily_request_limit",
    "the site-wide daily request ceiling fails closed"
  );

  const stateFile = join(stateDirectory, "shared-cloud-budget.json");
  const persisted = JSON.parse(readFileSync(stateFile, "utf8"));
  test.assert(persisted.requests === 3, "the shared allowance survives process restarts on disk");
  test.assert(
    (statSync(stateFile).mode & 0o777) === 0o600,
    "the allowance ledger is readable only by its service account"
  );
  test.assert(
    !readFileSync(stateFile, "utf8").includes("session-a"),
    "the allowance ledger stores no raw session identifier"
  );

  budget.resetSharedCloudBudgetCacheForTests();
  process.env.AI_SYSTEM6_SHARED_CLOUD_DAILY_REQUEST_LIMIT = "20";
  const oversized = budget.reserveSharedCloudRequest({
    sessionNonce: "session-large",
    payload: {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "x".repeat(6000) }],
      max_tokens: 200,
    },
  });
  test.assert(
    !oversized.ok && oversized.code === "shared_cloud_input_too_large",
    "shared access rejects an oversized input before contacting DeepSeek"
  );

  const anonymousId = budget.pseudonymousCloudUserId("session-a");
  test.assert(
    /^s6-[a-f0-9]{32}$/.test(anonymousId) && !anonymousId.includes("session-a"),
    "DeepSeek receives a pseudonymous isolation id without personal data"
  );
} finally {
  for (const name of envNames) {
    if (previousEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = previousEnvironment[name];
  }
  budget.resetSharedCloudBudgetCacheForTests();
  rmSync(stateDirectory, { recursive: true, force: true });
}

test.finish();
