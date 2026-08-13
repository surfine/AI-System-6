#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  themeLabPackagedAssetReport,
  themeStandalonePackagedAssets,
} from "./lib/generated-era-runtime-assets.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagedServer = join(repositoryRoot, "dist", "mac-server-payload", "ai-system-6-server");

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!port) throw new Error("Could not reserve a loopback port for the package probe");
  return port;
}

function getPackagedFile(port, relativePath, timeoutMs = 5000) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.get({
      hostname: "127.0.0.1",
      port,
      path: `/${relativePath.split("/").map(encodeURIComponent).join("/")}`,
      headers: { Connection: "close" },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveRequest({
        statusCode: response.statusCode || 0,
        contentType: String(response.headers["content-type"] || ""),
        contentLength: Number(response.headers["content-length"] || 0),
        body: Buffer.concat(chunks),
      }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Timed out reading ${relativePath}`)));
    request.once("error", rejectRequest);
  });
}

async function waitForPackagedServer(port, child, output) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged server exited before it became ready.\n${output()}`);
    }
    try {
      const response = await getPackagedFile(port, "index.html", 500);
      if (response.statusCode === 200) return;
    } catch {
      // The payload server may still be loading its native dependencies.
    }
    await delay(100);
  }
  throw new Error(`Packaged server did not become ready.\n${output()}`);
}

async function runWithConcurrency(items, concurrency, task) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 20 && child.exitCode === null; attempt += 1) await delay(100);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  if (!existsSync(packagedServer)) throw new Error(`Missing packaged server: ${packagedServer}`);

  const reports = themeLabPackagedAssetReport(repositoryRoot);
  const expectedFiles = [
    ...reports.flatMap((report) => report.files),
    ...themeStandalonePackagedAssets(repositoryRoot),
  ];
  const port = await reserveLoopbackPort();
  let childOutput = "";
  const child = spawn(packagedServer, [], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PORT: String(port),
      AI_SYSTEM6_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const rememberOutput = (chunk) => {
    childOutput = `${childOutput}${String(chunk)}`.slice(-32000);
  };
  child.stdout.on("data", rememberOutput);
  child.stderr.on("data", rememberOutput);

  const failures = [];
  try {
    await waitForPackagedServer(port, child, () => childOutput);
    await runWithConcurrency(expectedFiles, 24, async (file) => {
      try {
        const response = await getPackagedFile(port, file.relativePath);
        const sha256 = createHash("sha256").update(response.body).digest("hex");
        if (response.statusCode !== 200) failures.push(`${file.relativePath}: HTTP ${response.statusCode}`);
        else if (!response.contentType.startsWith("image/png")) failures.push(`${file.relativePath}: ${response.contentType || "missing content type"}`);
        else if (response.contentLength !== file.bytes || response.body.length !== file.bytes) failures.push(`${file.relativePath}: ${response.body.length}/${file.bytes} bytes`);
        else if (sha256 !== file.sha256) failures.push(`${file.relativePath}: packaged bytes differ from the reviewed source`);
      } catch (error) {
        failures.push(`${file.relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  } finally {
    await stopChild(child);
  }

  if (failures.length) {
    console.error(`Packaged Theme Lab icon verification failed (${failures.length} file(s)):`);
    failures.slice(0, 25).forEach((failure) => console.error(`- ${failure}`));
    if (failures.length > 25) console.error(`- … and ${failures.length - 25} more`);
    process.exit(1);
  }

  const totalBytes = expectedFiles.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`OK  packaged server returned all ${expectedFiles.length} UI-referenced theme PNGs byte-for-byte (${totalBytes} bytes)`);
}

await main();
