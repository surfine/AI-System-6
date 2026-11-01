// ClioTalk agent mode on the public web: switches, caps and locations.
//
// One place for every number the cloud sandbox enforces, so the routes, the
// proxy and the container runner read the same values and the docs table can
// be checked against them. Each cap has an env override; the defaults are
// sized for the live VPS (1 vCPU, 961 MB RAM, ~1.6 GB free disk on
// 2026-10-24), which can hold one engine container at a time.

"use strict";

const path = require("node:path");
const { isPublicDeployment, publicAgentCloudEnabled } = require("../runtime-profile.js");
const { DSH_VERSION } = require("../agent/paths.js");

/** The sandbox image carries the same pinned dsh as the Mac engine. */
const SANDBOX_DSH_VERSION = DSH_VERSION;
const DEFAULT_IMAGE = `ais6-agent-sandbox:${SANDBOX_DSH_VERSION}`;

/** @param {string} name @param {number} fallback */
function positive(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * The routes exist on a public deployment only with AI_SYSTEM6_PUBLIC_AGENT=1
 * (router.js reads the same flag). On the local profile they answer only with
 * AI_SYSTEM6_AGENT_CLOUD=1, for an end-to-end check with Docker on a Mac.
 */
function agentCloudEnabled() {
  if (isPublicDeployment) return publicAgentCloudEnabled;
  return String(process.env.AI_SYSTEM6_AGENT_CLOUD || "").trim() === "1";
}

/**
 * Caps per allowance. `shared` spends the site's DeepSeek key through
 * its own agent allowance (allowance.js, not the chat budget); `byok` spends the visitor's own key, so it has no
 * token cap but keeps the time, size and call caps that protect this host.
 */
function agentCloudCaps() {
  return {
    shared: {
      runsPerSessionPerDay: positive("AI_SYSTEM6_AGENT_CLOUD_SHARED_RUNS_PER_DAY", 2),
      maxModelCalls: positive("AI_SYSTEM6_AGENT_CLOUD_SHARED_MAX_MODEL_CALLS", 24),
      maxWebCalls: positive("AI_SYSTEM6_AGENT_CLOUD_SHARED_MAX_WEB_CALLS", 6),
      maxRunTokens: positive("AI_SYSTEM6_AGENT_CLOUD_SHARED_MAX_RUN_TOKENS", 120000),
      maxCallOutputTokens: positive("AI_SYSTEM6_AGENT_CLOUD_SHARED_MAX_CALL_OUTPUT", 8192),
      wallMs: positive("AI_SYSTEM6_AGENT_CLOUD_SHARED_WALL_MS", 8 * 60_000),
      maxUploadBytes: positive("AI_SYSTEM6_AGENT_CLOUD_SHARED_MAX_UPLOAD_BYTES", 4 * 1024 * 1024),
      maxUploadFiles: positive("AI_SYSTEM6_AGENT_CLOUD_SHARED_MAX_UPLOAD_FILES", 40),
    },
    byok: {
      // One BYOK visitor must not hold the host's one container all day.
      runsPerSessionPerDay: positive("AI_SYSTEM6_AGENT_CLOUD_BYOK_RUNS_PER_DAY", 6),
      maxModelCalls: positive("AI_SYSTEM6_AGENT_CLOUD_BYOK_MAX_MODEL_CALLS", 80),
      maxWebCalls: positive("AI_SYSTEM6_AGENT_CLOUD_BYOK_MAX_WEB_CALLS", 20),
      maxRunTokens: 0,
      maxCallOutputTokens: positive("AI_SYSTEM6_AGENT_CLOUD_BYOK_MAX_CALL_OUTPUT", 32768),
      wallMs: positive("AI_SYSTEM6_AGENT_CLOUD_BYOK_WALL_MS", 10 * 60_000),
      maxUploadBytes: positive("AI_SYSTEM6_AGENT_CLOUD_BYOK_MAX_UPLOAD_BYTES", 8 * 1024 * 1024),
      maxUploadFiles: positive("AI_SYSTEM6_AGENT_CLOUD_BYOK_MAX_UPLOAD_FILES", 200),
    },
    // Site-wide: what the operator's DeepSeek key may spend on agent runs per
    // UTC day, apart from the chat allowance (agent-cloud/allowance.js).
    // Tokens are weighted like chat (v4-pro counts 4.5). `maxInputTokens` is
    // the estimated-input ceiling of one agent call (chat's is 32k).
    site: {
      dailyRuns: positive("AI_SYSTEM6_AGENT_CLOUD_DAILY_RUNS", 60),
      dailyTokens: positive("AI_SYSTEM6_AGENT_CLOUD_DAILY_TOKENS", 3_000_000),
      maxInputTokens: positive("AI_SYSTEM6_AGENT_CLOUD_MAX_INPUT_TOKENS", 64_000),
      // One address may start this many shared runs a UTC day, however many
      // verified sessions it mints (allowance.js keeps a hashed key per day).
      addressRunsPerDay: positive("AI_SYSTEM6_AGENT_CLOUD_ADDRESS_RUNS", 4),
    },
    // One address holds at most this many working runs, shared and own-key.
    activeRunsPerAddress: positive("AI_SYSTEM6_AGENT_CLOUD_ADDRESS_ACTIVE", 1),
    // Host-wide: the VPS holds one engine container at a time.
    maxConcurrentRuns: positive("AI_SYSTEM6_AGENT_CLOUD_MAX_CONCURRENT", 1),
    maxPromptChars: 20_000,
    // The engine may grow the workspace by this much over the upload before
    // the watchdog stops the run.
    maxWorkspaceGrowthBytes: positive("AI_SYSTEM6_AGENT_CLOUD_MAX_GROWTH_BYTES", 8 * 1024 * 1024),
    // …or holds more files than this (the watchdog counts them; changes are
    // read, diffed and returned per file, so the count bounds that work).
    maxWorkspaceFiles: positive("AI_SYSTEM6_AGENT_CLOUD_MAX_FILES", 500),
    // A Messages call may ask web_search for at most this many searches.
    webSearchMaxUses: 3,
    // A finished run's workspace waits this long for the page to fetch its
    // changes and discard; then the janitor removes it.
    resultTtlMs: positive("AI_SYSTEM6_AGENT_CLOUD_RESULT_TTL_MS", 20 * 60_000),
    janitorIntervalMs: positive("AI_SYSTEM6_AGENT_CLOUD_JANITOR_MS", 60_000),
    // How often the watchdog measures a working run's workspace.
    watchdogMs: positive("AI_SYSTEM6_AGENT_CLOUD_WATCHDOG_MS", 3000),
  };
}

/** Container limits; every one becomes an explicit `docker run` flag. */
function containerLimits() {
  return {
    memory: String(process.env.AI_SYSTEM6_AGENT_CLOUD_MEMORY || "448m"),
    cpus: String(process.env.AI_SYSTEM6_AGENT_CLOUD_CPUS || "0.9"),
    pids: positive("AI_SYSTEM6_AGENT_CLOUD_PIDS", 128),
    tmpSize: "64m",
    homeSize: "64m",
    nofile: 1024,
  };
}

function sandboxSettings() {
  return {
    // docker or podman: the argv is the same apart from the binary.
    cli: String(process.env.AI_SYSTEM6_AGENT_CLOUD_CLI || "docker"),
    image: String(process.env.AI_SYSTEM6_AGENT_CLOUD_IMAGE || DEFAULT_IMAGE),
    // Optional --userns value (podman: "auto"). Rootless Docker, or a daemon
    // with userns-remap, already maps the container's users away from host
    // root, and plain `docker run` cannot ask for a namespace per container.
    userns: String(process.env.AI_SYSTEM6_AGENT_CLOUD_USERNS || ""),
    // A rootless daemon's socket, e.g. unix:///run/ais6-sandbox/docker.sock.
    dockerHost: String(process.env.AI_SYSTEM6_AGENT_CLOUD_DOCKER_HOST || process.env.DOCKER_HOST || ""),
  };
}

/** Where run workspaces live: a capped tmpfs on the VPS (docs: Cloud sandbox). */
function agentCloudRoot() {
  const explicit = String(process.env.AI_SYSTEM6_AGENT_CLOUD_ROOT || "").trim();
  if (explicit) return path.resolve(explicit);
  const state = String(process.env.AI_SYSTEM6_STATE_DIR || "/var/lib/ai-system6").trim();
  return path.join(state, "agent-cloud");
}

module.exports = {
  DEFAULT_IMAGE,
  SANDBOX_DSH_VERSION,
  agentCloudCaps,
  agentCloudEnabled,
  agentCloudRoot,
  containerLimits,
  sandboxSettings,
};
