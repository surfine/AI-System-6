// Drives one real Clio run in-process through the server's own run module
// (apps/server/server/agent/runs.js), the same code POST /api/agent/runs calls.
// The HTTP route cannot be used headless: a folder grant comes only from the
// macOS folder dialog, and the route wants the per-boot token. In-process we
// grant the temp folder ourselves, in an agent home of our own, so the
// writer's real grants, shadows and runs are never touched.
//
// Spends money (the engine calls a provider). The CLI gates it.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function createDriver({ agentHome, engine, model, timeoutMs, language }) {
  process.env.AI_SYSTEM6_AGENT_HOME = agentHome;
  fs.mkdirSync(agentHome, { recursive: true });
  const base = "../../../apps/server/server/agent";
  const runs = require(`${base}/runs.js`);
  const folders = require(`${base}/folders.js`);
  const shadowFs = require(`${base}/shadow.js`);
  const engineHost = require(`${base}/engine-host.js`);
  const paths = require(`${base}/paths.js`);

  if (process.platform !== "darwin") throw new Error("Clio's engine host runs on macOS only.");
  if (!engineHost.ENGINES[engine]) throw new Error(`unknown engine ${engine}; known: ${Object.keys(engineHost.ENGINES).join(", ")}`);
  if (!paths.engineStatus().installed) throw new Error("the dsh engine is not installed here (node tooling/build-dsh-slim.mjs)");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runEpoch(task, folder) {
    const started = Date.now();
    const grant = folders.grantFolder(folder, task.level);
    let run;
    try {
      run = await runs.createRun({ folderId: grant.id, level: task.level, prompt: task.prompt, engine, model, language: task.language || language });
    } catch (error) {
      return { status: "infra_error", error: `${error.code || "create_failed"}: ${error.message}`, wallMs: Date.now() - started };
    }
    let timedOut = false;
    while (runs.ACTIVE_STATES.has(runs.getRun(run.runId).state)) {
      if (Date.now() - started > timeoutMs && !timedOut) {
        timedOut = true;
        await runs.stopRun(run.runId).catch(() => {});
      }
      await sleep(500);
    }
    const live = runs.getRun(run.runId);
    const events = live.events.map((e) => ({ seq: e.seq, type: e.type, at: e.at, ...e.data }));
    const answer = events.filter((e) => e.type === "assistant_text").map((e) => e.text).join("\n");
    const result = { runId: run.runId, state: live.state, wallMs: Date.now() - started, events, usage: live.usage || null, answer, changes: [], proposals: [] };
    if (live.state === "error" || timedOut) {
      result.status = "infra_error";
      result.error = timedOut ? `timed out after ${Math.round(timeoutMs / 60000)} min` : String(live.error || "engine error");
    } else {
      result.status = "ok";
      const tree = shadowFs.afterWork(live.shadow);
      for (const c of runs.runChanges(run.runId).changes) {
        let text = null;
        if (c.kind !== "deleted") {
          const bytes = shadowFs.readNoFollow(tree, c.path).bytes;
          text = bytes.includes(0) ? null : bytes.toString("utf8");
        }
        result.changes.push({ path: c.path, kind: c.kind, text, diff: c.diff });
      }
      result.proposals = runs.listProposalsRun(run.runId).proposals.map((p) => ({ kind: p.kind, title: p.title, reason: p.reason, payload: p.payload }));
    }
    await runs.discardRun(run.runId).catch(() => {});
    try { folders.revokeFolder(grant.id); } catch {}
    return result;
  }

  return { runEpoch };
}
