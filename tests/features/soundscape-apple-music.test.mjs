// Soundscape's Apple Music bridge: link parsing, engine choice, the download
// job lifecycle, signed audio, pairing and consent -- asserted by calling the
// modules and a spawned server, never by reading their source.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("soundscape-apple-music");
const gamdl = require("../../apps/server/server/gamdl.js");
const mediaSignature = require("../../apps/server/server/security/media-signature.js");
const bridge = require("../../apps/server/server/music-bridge.js");
const audioTags = require("../../apps/server/server/audio-tags.js");
const musicTools = require("../../apps/server/server/music-tools.js");

// ---------- fixtures ----------

// Vorbis comment lengths are little-endian, unlike every MP4 and FLAC block
// header around them.
function u32le(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function box(type, body = Buffer.alloc(0)) {
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, "latin1"), body]);
}

function mp4DataBox(kind, value) {
  return box("data", Buffer.concat([u32(kind), u32(0), value]));
}

function mp4TextItem(type, text) {
  return box(type, mp4DataBox(1, Buffer.from(text, "utf8")));
}

function mp4TrknItem(track, total) {
  const value = Buffer.alloc(8);
  value.writeUInt16BE(track, 2);
  value.writeUInt16BE(total, 4);
  return box("trkn", mp4DataBox(0, value));
}

function mp4Fixture() {
  const mvhdBody = Buffer.alloc(100);
  mvhdBody.writeUInt32BE(0, 0); // version 0 + flags
  mvhdBody.writeUInt32BE(0, 4); // creation
  mvhdBody.writeUInt32BE(0, 8); // modification
  mvhdBody.writeUInt32BE(1000, 12); // timescale
  mvhdBody.writeUInt32BE(213000, 16); // duration
  const mvhd = box("mvhd", mvhdBody);

  const ilst = box("ilst", Buffer.concat([
    mp4TextItem("©nam", "One"),
    mp4TextItem("©ART", "Artist"),
    mp4TextItem("©alb", "Album"),
    mp4TrknItem(1, 2),
  ]));
  const meta = box("meta", Buffer.concat([u32(0), ilst]));
  const udta = box("udta", meta);
  const moov = box("moov", Buffer.concat([mvhd, udta]));
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("M4A ", "latin1"), u32(0)]));
  return Buffer.concat([ftyp, moov]);
}

function flacFixture() {
  // STREAMINFO: 10 bytes of anything, then sampleRate (20 bits), channels-1
  // (3 bits), bitsPerSample-1 (5 bits) and total samples (36 bits). Together
  // those three fields and the low nibble of byte 13 carry the 36-bit count,
  // so they are packed here exactly the way a real encoder lays them out.
  const streamInfo = Buffer.alloc(34);
  const sampleRate = 44100;
  const channelsMinusOne = 1;
  const bitsPerSampleMinusOne = 15;
  const totalSamples = sampleRate * 5;
  streamInfo[10] = (sampleRate >> 12) & 0xff;
  streamInfo[11] = (sampleRate >> 4) & 0xff;
  streamInfo[12] = ((sampleRate & 0x0f) << 4) | (channelsMinusOne << 1) | ((bitsPerSampleMinusOne >> 4) & 0x01);
  streamInfo[13] = ((bitsPerSampleMinusOne & 0x0f) << 4) | ((totalSamples / 2 ** 32) & 0x0f);
  streamInfo.writeUInt32BE(totalSamples % 2 ** 32, 14);
  const comments = Buffer.from("TITLE=Hello", "utf8");
  const vendor = Buffer.from("test", "utf8");
  const vorbisBody = Buffer.concat([
    u32le(vendor.length),
    vendor,
    u32le(1),
    u32le(comments.length),
    comments,
  ]);
  // "fLaC" + STREAMINFO (type 0, NOT the last block) + VORBIS_COMMENT (type 4,
  // last block: header flag bit 7 set -> 0x84). The scan stops at the block
  // that carries the last-block flag, so the flag belongs on the comment.
  const streamInfoHeader = Buffer.from([0x00, 0x00, 0x00, 34]);
  const vorbisHeader = Buffer.from([0x84, (vorbisBody.length >> 16) & 0xff, (vorbisBody.length >> 8) & 0xff, vorbisBody.length & 0xff]);
  return Buffer.concat([
    Buffer.from("fLaC", "latin1"),
    streamInfoHeader,
    streamInfo,
    vorbisHeader,
    vorbisBody,
  ]);
}

// ---------- HTTP helpers ----------

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method: options.method || "GET",
      headers: options.headers || {},
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start. Output: ${output}`));
    }, 15000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("running at http://")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before readiness with code ${code}. Output: ${output}`));
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollJob(port, pollUrl) {
  const deadline = Date.now() + 10000;
  let last = null;
  while (Date.now() < deadline) {
    last = await request(port, pollUrl);
    try {
      const parsed = JSON.parse(last.body);
      if (parsed.status === "done" || parsed.status === "error") return parsed;
    } catch {}
    await sleep(200);
  }
  return last ? JSON.parse(last.body) : null;
}

// ---------- 1. link parsing ----------

const embedded = gamdl.parseAppleMusicLink(
  "听这个 https://music.apple.com/us/album/some-record/1791923799?i=1791923800&l=zh-Hant-TW 好吗"
);
test.assert(embedded.ok, "a link embedded in Chinese text is found");
if (embedded.ok) {
  test.assert(
    embedded.cacheKey === "us-album-1791923799-i1791923800",
    "the cache key names storefront, kind, id and the track"
  );
  test.assert(
    embedded.url.includes("i=1791923800") && !embedded.url.includes("l="),
    "the cleaned url keeps i and drops the interface language"
  );
}

const second = gamdl.parseAppleMusicLink("https://music.apple.com/us/album/x/1?l=zh-Hans-CN&i=456");
test.assert(second.ok && second.url.includes("i=456"), "a language-first query still keeps the track id");

const playlist = gamdl.parseAppleMusicLink("https://music.apple.com/us/playlist/My-Mix/pl.1a2b3c4d");
test.assert(
  playlist.ok && playlist.cacheKey === "us-playlist-pl.1a2b3c4d",
  "a playlist id lands in the cache key in lowercase form"
);
const shoutedPlaylist = gamdl.parseAppleMusicLink("https://music.apple.com/US/PLAYLIST/My-Mix/PL.1A2B3C4D");
test.assert(
  shoutedPlaylist.ok && shoutedPlaylist.cacheKey === "us-playlist-pl.1a2b3c4d",
  "a link shouted in capitals yields the same lowercased cache key"
);

const badKind = gamdl.parseAppleMusicLink("https://music.apple.com/us/music-video/x/123");
test.assert(
  !badKind.ok && badKind.code === "apple_music_unsupported_kind",
  "music videos are refused as an unsupported kind"
);
const artist = gamdl.parseAppleMusicLink("https://music.apple.com/us/artist/x/123");
test.assert(
  !artist.ok && artist.code === "apple_music_unsupported_kind",
  "artist pages are refused as an unsupported kind"
);

test.assert(!gamdl.parseAppleMusicLink("https://example.com/us/album/x/123").ok, "other hosts are refused");
test.assert(!gamdl.parseAppleMusicLink("https://music.apple.com:8443/us/album/x/123").ok, "an explicit port is refused");
test.assert(!gamdl.parseAppleMusicLink("http://music.apple.com/us/album/x/123").ok, "plain http is refused");

// ---------- 2. quality plan ----------

test.assert(
  JSON.stringify(gamdl.qualityPlan({ alac: true, flac: true, aac: true }, { lossless: true, ffmpeg: true, aac: true })) === JSON.stringify(["alac", "aac"]),
  "a lossless-capable browser gets alac first"
);
test.assert(
  JSON.stringify(gamdl.qualityPlan({ alac: false, flac: true, aac: true }, { lossless: true, ffmpeg: true, aac: true })) === JSON.stringify(["flac", "aac"]),
  "a browser without alac gets flac when ffmpeg is present"
);
test.assert(
  JSON.stringify(gamdl.qualityPlan({ alac: false, flac: true, aac: true }, { lossless: true, ffmpeg: false, aac: true })) === JSON.stringify(["aac"]),
  "flac is dropped without ffmpeg"
);
test.assert(
  JSON.stringify(gamdl.qualityPlan({ alac: true, flac: true, aac: true }, { lossless: false, ffmpeg: true, aac: true })) === JSON.stringify(["aac"]),
  "no lossless engine falls back to aac"
);
test.assert(
  JSON.stringify(gamdl.qualityPlan({ alac: true, flac: true, aac: true }, { lossless: false, ffmpeg: false, aac: false })) === JSON.stringify([]),
  "no engine at all yields an empty plan"
);
test.assert(
  gamdl.normalizePlayable(undefined).aac === true,
  "a client that says nothing still gets the one format that always works"
);

// ---------- 3. amdl job config ----------

const configText = 'alac-save-folder: /old\nlite-server: "http://x" # keep\nexit-on-error: false\n';
const rewritten = gamdl.amdlJobConfig(configText, { "alac-save-folder": "/new", "embed-lrc": false });
test.assert(typeof rewritten === "string", "a flat config is rewritten rather than refused");
test.assert(
  rewritten.includes('lite-server: "http://x" # keep'),
  "unlisted lines, including their comments, stay verbatim"
);
test.assert(rewritten.includes('alac-save-folder: "/new"'), "a listed scalar is replaced with a JSON-quoted value");
test.assert(rewritten.includes("embed-lrc: false"), "a missing key is appended");
test.assert(rewritten.includes("exit-on-error: false"), "an unlisted existing key is left alone");
test.assert(
  gamdl.amdlJobConfig("alac-save-folder:\n  - a\n", { "alac-save-folder": "/x" }) === null,
  "a block value is refused instead of mangled"
);

// ---------- 4. file refs ----------

const goodRef = { cacheKey: "us-album-1", quality: "aac", file: "A/01%20x.m4a" };
test.assert(gamdl.isValidFileRef(goodRef), "a well-formed file ref is accepted");
for (const file of ["../x.m4a", "%2e%2e/x.m4a", "a%2Fb/x.m4a", "/abs.m4a", "a\\b.m4a"]) {
  test.assert(
    !gamdl.isValidFileRef({ ...goodRef, file }),
    `the file ref ${JSON.stringify(file)} is rejected`
  );
}
test.assert(
  !gamdl.isValidFileRef({ ...goodRef, cacheKey: "us-album-1/../x" }),
  "a cache key outside the stable pattern is rejected"
);
test.assert(
  !gamdl.isValidFileRef({ ...goodRef, quality: "mp3" }),
  "a quality the library never writes is rejected"
);

// ---------- 5. media signatures ----------

const signedPath = "/api/music/gamdl/files/us-album-1/aac/A/01%20x.m4a";
const signedQuery = mediaSignature.signMediaPath(signedPath);
const signedUrl = `${signedPath}?${signedQuery}`;
test.assert(mediaSignature.verifySignedMediaUrl(signedUrl), "a freshly signed path verifies");
const tamperedSig = signedUrl.slice(0, -1) + (signedUrl.endsWith("A") ? "B" : "A");
test.assert(
  tamperedSig !== signedUrl && !mediaSignature.verifySignedMediaUrl(tamperedSig),
  "a signature whose last character is changed fails"
);
test.assert(
  !mediaSignature.verifySignedMediaUrl(`/api/music/gamdl/files/us-album-2/aac/A/01%20x.m4a?${signedQuery}`),
  "the same query on another path fails"
);
test.assert(
  !mediaSignature.verifySignedMediaUrl(
    signedUrl,
    Date.now() + mediaSignature.SIGNATURE_TTL_SECONDS * 1000 + 120000
  ),
  "an expired signature fails"
);
test.assert(
  !mediaSignature.verifySignedMediaUrl(signedPath),
  "a request without a signature fails"
);

// ---------- 6. pairing, limits and consent ----------

const bridgeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "soundscape-bridge-"));
try {
  const origin = "https://boot-system6.pages.dev";
  const otherOrigin = "https://system6.aaronlau.me";
  const token = await bridge.pairOrigin(bridgeRoot, origin);
  test.assert(await bridge.verifyPairing(bridgeRoot, origin, token), "the issued token verifies for its origin");
  test.assert(!(await bridge.verifyPairing(bridgeRoot, origin, "wrong-token")), "a wrong token fails");
  test.assert(!(await bridge.verifyPairing(bridgeRoot, otherOrigin, token)), "another origin cannot use the token");

  const pairingFile = path.join(bridgeRoot, "bridge-pairings.json");
  const pairingRaw = await fs.readFile(pairingFile, "utf8");
  const pairingStat = await fs.stat(pairingFile);
  test.assert(!pairingRaw.includes(token), "the token is never written to disk in the clear");
  test.assert(
    (pairingStat.mode & 0o777) === 0o600,
    "the pairing file is private to its owner"
  );

  await bridge.revokePairing(bridgeRoot, origin);
  test.assert(!(await bridge.verifyPairing(bridgeRoot, origin, token)), "a revoked pairing no longer verifies");

  await bridge.pairOrigin(bridgeRoot, origin);
  await bridge.pairOrigin(bridgeRoot, otherOrigin);
  await bridge.revokePairing(bridgeRoot, "*");
  test.assert((await bridge.listPairings(bridgeRoot)).length === 0, "revoke * empties the pairing list");

  bridge.resetBridgeRateLimits();
  let allowed = 0;
  for (let index = 0; index < bridge.RATE_LIMIT; index += 1) {
    if (bridge.takeBridgeRateSlot(origin)) allowed += 1;
  }
  test.assert(allowed === bridge.RATE_LIMIT, "one origin may start its hourly allowance of jobs");
  test.assert(!bridge.takeBridgeRateSlot(origin), "the allowance is then exhausted");
  test.assert(bridge.takeBridgeRateSlot(otherOrigin), "another origin has its own allowance");
  bridge.resetBridgeRateLimits();

  test.assert(!(await bridge.consentAccepted(bridgeRoot)), "consent starts unaccepted");
  await bridge.acceptConsent(bridgeRoot);
  test.assert(await bridge.consentAccepted(bridgeRoot), "consent is recorded once accepted");
} finally {
  await fs.rm(bridgeRoot, { recursive: true, force: true });
}

// ---------- 7. audio tags ----------

const tagsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "soundscape-tags-"));
try {
  const mp4Path = path.join(tagsRoot, "one.m4a");
  await fs.writeFile(mp4Path, mp4Fixture());
  const mp4Tags = await audioTags.readAudioTags(mp4Path);
  test.assert(mp4Tags.title === "One", "an MP4 title is read from its ilst");
  test.assert(mp4Tags.artist === "Artist" && mp4Tags.album === "Album", "MP4 artist and album are read");
  test.assert(mp4Tags.track === 1, "the MP4 track number is read");
  test.assert(mp4Tags.duration === 213, "the MP4 duration comes from mvhd timescale and duration");

  const flacPath = path.join(tagsRoot, "one.flac");
  await fs.writeFile(flacPath, flacFixture());
  const flacTags = await audioTags.readAudioTags(flacPath);
  test.assert(flacTags.codec === "flac", "a FLAC file reports the flac codec");
  test.assert(flacTags.sampleRate === 44100, "the FLAC sample rate is read from STREAMINFO");
  test.assert(flacTags.bitDepth === 16, "the FLAC bit depth is read from STREAMINFO");
  test.assert(flacTags.duration === 5, "the FLAC duration is total samples over sample rate");
  test.assert(flacTags.title === "Hello", "a Vorbis TITLE comment is read");

  const junkPath = path.join(tagsRoot, "junk.bin");
  await fs.writeFile(junkPath, Buffer.from("not audio at all"));
  const junkTags = await audioTags.readAudioTags(junkPath);
  test.assert(junkTags.title === "", "an unfamiliar file yields an empty title, not a throw");
} finally {
  await fs.rm(tagsRoot, { recursive: true, force: true });
}

// ---------- 8. tool discovery ----------

const toolsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "soundscape-tools-"));
try {
  const stubBin = path.join(toolsRoot, "gamdl");
  await fs.writeFile(stubBin, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const cookiesPath = path.join(toolsRoot, "cookies.txt");
  await fs.writeFile(cookiesPath, "cookie-data");

  const priorBin = process.env.AI_SYSTEM6_GAMDL_BIN;
  const priorCookies = process.env.AI_SYSTEM6_GAMDL_COOKIES_PATH;
  const priorPath = process.env.PATH;
  process.env.AI_SYSTEM6_GAMDL_BIN = stubBin;
  process.env.AI_SYSTEM6_GAMDL_COOKIES_PATH = cookiesPath;
  process.env.PATH = "/usr/bin:/bin";
  musicTools.resetMusicToolsCache();
  try {
    const tools = await musicTools.discoverMusicTools({ refresh: true });
    test.assert(tools.gamdl === stubBin, "an absolute env override resolves to the tool itself");
    test.assert(tools.cookies === cookiesPath, "the cookies override is found");

    // An override that points nowhere means "absent", never "use the default
    // ~/Music/AppleMusicDL": otherwise a test run could wake the writer's real
    // lossless engine.
    const priorAmdl = process.env.AI_SYSTEM6_AMDL_DIR;
    const priorWrapper = process.env.AI_SYSTEM6_WRAPPER_LITE_DIR;
    process.env.AI_SYSTEM6_AMDL_DIR = path.join(toolsRoot, "missing-amdl");
    process.env.AI_SYSTEM6_WRAPPER_LITE_DIR = path.join(toolsRoot, "missing-wrapper");
    try {
      const pointedAway = await musicTools.discoverMusicTools({ refresh: true });
      test.assert(
        pointedAway.amdl === "" && pointedAway.wrapperLauncher === "",
        "a missing override leaves the lossless tools absent instead of falling back"
      );
    } finally {
      if (priorAmdl === undefined) delete process.env.AI_SYSTEM6_AMDL_DIR;
      else process.env.AI_SYSTEM6_AMDL_DIR = priorAmdl;
      if (priorWrapper === undefined) delete process.env.AI_SYSTEM6_WRAPPER_LITE_DIR;
      else process.env.AI_SYSTEM6_WRAPPER_LITE_DIR = priorWrapper;
    }
  } finally {
    musicTools.resetMusicToolsCache();
    if (priorBin === undefined) delete process.env.AI_SYSTEM6_GAMDL_BIN;
    else process.env.AI_SYSTEM6_GAMDL_BIN = priorBin;
    if (priorCookies === undefined) delete process.env.AI_SYSTEM6_GAMDL_COOKIES_PATH;
    else process.env.AI_SYSTEM6_GAMDL_COOKIES_PATH = priorCookies;
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
  }
} finally {
  await fs.rm(toolsRoot, { recursive: true, force: true });
}

// ---------- integration ----------

let port = 0;
try {
  port = await reservePort();
} catch (error) {
  if (error?.code !== "EPERM") throw error;
  test.ok("socket integration checks are deferred when the sandbox forbids loopback listeners");
}

if (port) {
  const serverRoot = await fs.mkdtemp(path.join(os.tmpdir(), "soundscape-server-"));
  const cookies = path.join(serverRoot, "cookies.txt");
  await fs.writeFile(cookies, "cookie-data");
  const stubBin = path.join(serverRoot, "gamdl");
  await fs.writeFile(stubBin, [
    "#!/bin/bash",
    "out=\"\"",
    "args=(\"$@\")",
    "for ((i=0; i<${#args[@]}; i++)); do",
    "  if [ \"${args[$i]}\" = \"--output-path\" ]; then out=\"${args[$((i+1))]}\"; fi",
    "done",
    "echo \"[Track 1/2] a\"",
    "mkdir -p \"$out/Artist/Album\"",
    "printf 'x' > \"$out/Artist/Album/01 One.m4a\"",
    "echo \"[Track 2/2] b\"",
    "printf 'x' > \"$out/Artist/Album/02 Two.m4a\"",
    "exit 0",
    "",
  ].join("\n"), { mode: 0o755 });

  const child = spawn(process.execPath, ["apps/server/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      AI_SYSTEM6_DEPLOYMENT_PROFILE: "local",
      AI_SYSTEM6_HOST: "127.0.0.1",
      AI_SYSTEM6_ALLOW_LAN: "0",
      AI_SYSTEM6_GAMDL_LIBRARY: path.join(serverRoot, "lib"),
      AI_SYSTEM6_GAMDL_BIN: stubBin,
      AI_SYSTEM6_GAMDL_COOKIES_PATH: cookies,
      AI_SYSTEM6_AMDL_DIR: path.join(serverRoot, "none"),
      AI_SYSTEM6_WRAPPER_LITE_DIR: path.join(serverRoot, "none"),
      AI_SYSTEM6_WRAPPER_AUTOSTART: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const bridgeHeaders = {
    Origin: "https://boot-system6.pages.dev",
    "Sec-Fetch-Site": "cross-site",
  };
  const jsonHeaders = { "Content-Type": "application/json" };
  const jobBody = JSON.stringify({
    url: "see https://music.apple.com/us/album/x/123?l=zh",
    playable: { alac: false, flac: false, aac: true },
  });
  const filePath = "/api/music/gamdl/files/us-album-123/aac/Artist/Album/01%20One.m4a";

  try {
    await waitForServer(child);

    // a. consent gate
    const beforeConsent = await request(port, "/api/music/gamdl/jobs", {
      method: "POST",
      headers: jsonHeaders,
      body: jobBody,
    });
    const beforeConsentBody = JSON.parse(beforeConsent.body);
    test.assert(
      beforeConsent.status === 403 && beforeConsentBody.code === "consent_required",
      "a download is refused until the notice is accepted"
    );

    // b. a real download runs the tool and reports its work
    const consent = await request(port, "/api/music/gamdl/consent", {
      method: "POST",
      headers: jsonHeaders,
      body: "{}",
    });
    test.assert(consent.status === 200, "the notice can be accepted on the Mac");

    const started = await request(port, "/api/music/gamdl/jobs", {
      method: "POST",
      headers: jsonHeaders,
      body: jobBody,
    });
    test.assert(started.status === 202, "a new link is queued with 202");
    const startedBody = JSON.parse(started.body);
    const done = await pollJob(port, startedBody.pollUrl);
    test.assert(done?.status === "done", "the job finishes");
    test.assert(done?.quality === "aac", "the job's quality is the one the browser asked for");
    test.assert(done?.results?.length === 2, "both downloaded tracks are reported");
    test.assert(done?.progress?.total === 2, "the tool's own progress count is kept");
    test.assert(
      done?.results?.[0]?.ref?.cacheKey === "us-album-123",
      "each result is tied to the link's cache key"
    );
    test.assert(
      String(done?.results?.[0]?.url || "").startsWith("/api/music/gamdl/files/us-album-123/aac/"),
      "a local result points at the cached file on this Mac"
    );
    test.assert(typeof done?.logTail === "string", "a local job exposes its tool log");

    // c. a repeated link is a cache hit
    const repeat = await request(port, "/api/music/gamdl/jobs", {
      method: "POST",
      headers: jsonHeaders,
      body: jobBody,
    });
    const repeatBody = JSON.parse(repeat.body);
    test.assert(
      repeat.status === 200 && repeatBody.status === "done",
      "the same link is answered at once from the cache"
    );

    // d. the audio itself streams with range support
    const file = await request(port, filePath);
    test.assert(
      file.status === 200
        && file.headers["content-type"] === "audio/mp4"
        && file.headers["accept-ranges"] === "bytes",
      "a downloaded file is served as ranged audio"
    );
    const ranged = await request(port, filePath, { headers: { Range: "bytes=0-0" } });
    test.assert(ranged.status === 206, "a range request is answered with 206");

    // e. an unsigned cross-site media fetch is refused
    const unsignedMedia = await request(port, filePath, {
      headers: { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Dest": "audio" },
    });
    test.assert(unsignedMedia.status === 403, "cross-site audio without a signature is refused");

    // f. the bridge refuses an unpaired page
    const bridgeStatus = await request(port, "/api/music/gamdl/status", { headers: bridgeHeaders });
    test.assert(
      JSON.parse(bridgeStatus.body).paired === false,
      "an unpaired page sees only that this Mac is not paired with it"
    );
    const unpairedJob = await request(port, "/api/music/gamdl/jobs", {
      method: "POST",
      headers: { ...bridgeHeaders, ...jsonHeaders },
      body: jobBody,
    });
    test.assert(
      unpairedJob.status === 401 && JSON.parse(unpairedJob.body).code === "bridge_pairing_required",
      "an unpaired page cannot start a download"
    );
    const evilJob = await request(port, "/api/music/gamdl/jobs", {
      method: "POST",
      headers: { ...jsonHeaders, Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
      body: jobBody,
    });
    test.assert(evilJob.status === 403, "an unlisted origin cannot reach the bridge at all");

    // g. pairing happens on a loopback page only
    const selfPair = await request(port, "/api/music/bridge/pair", {
      method: "POST",
      headers: { ...bridgeHeaders, ...jsonHeaders },
      body: JSON.stringify({ origin: "https://boot-system6.pages.dev" }),
    });
    test.assert(selfPair.status === 403, "a public page cannot pair itself");
    const sameOriginPair = await request(port, "/api/music/bridge/pair", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: `http://127.0.0.1:${port}`,
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify({ origin: "https://boot-system6.pages.dev" }),
    });
    const paired = JSON.parse(sameOriginPair.body);
    test.assert(
      sameOriginPair.status === 200 && typeof paired.token === "string" && paired.token.length > 20,
      "the writer's own page can pair a public origin"
    );

    // h. a paired page uses the bridge without ever seeing logs or paths
    const bridgedJob = await request(port, "/api/music/gamdl/jobs", {
      method: "POST",
      headers: { ...bridgeHeaders, ...jsonHeaders, "X-AI-System-6-Bridge": paired.token },
      body: jobBody,
    });
    const bridgedBody = JSON.parse(bridgedJob.body);
    test.assert(
      bridgedJob.status === 200 && bridgedBody.status === "done",
      "a paired page reaches the same cached job"
    );
    test.assert(
      !("logTail" in bridgedBody) && !("error" in bridgedBody),
      "a bridged response carries no tool output"
    );
    test.assert(
      String(bridgedBody.results?.[0]?.url || "").includes("?exp=")
        && String(bridgedBody.results?.[0]?.url || "").includes("&sig="),
      "a bridged result carries a signed url"
    );
    const preflight = await request(port, "/api/music/gamdl/jobs", {
      method: "OPTIONS",
      headers: {
        ...bridgeHeaders,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-ai-system-6-bridge",
      },
    });
    test.assert(
      preflight.status === 204
        && String(preflight.headers["access-control-allow-headers"] || "")
          .toLowerCase()
          .includes("x-ai-system-6-bridge"),
      "the paired page's preflight admits its own header"
    );

    // i. the signed url plays across origins, and only that exact url
    const signedFileUrl = String(bridgedBody.results?.[0]?.url || "");
    const signedFile = await request(port, signedFileUrl, {
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    test.assert(signedFile.status === 200, "a signed url plays from another site");
    test.assert(
      signedFile.headers["cross-origin-resource-policy"] === "cross-origin",
      "a signed media response may be embedded cross-origin"
    );
    // Another loopback port is same-site, not cross-site, and carries no
    // Origin on a media request: the Origin check already trusts it, and the
    // signed response must still be embeddable there.
    const sameSiteSigned = await request(port, signedFileUrl, {
      headers: { "Sec-Fetch-Site": "same-site", "Sec-Fetch-Dest": "audio" },
    });
    test.assert(
      sameSiteSigned.status === 200
        && sameSiteSigned.headers["cross-origin-resource-policy"] === "cross-origin",
      "a signed media response is embeddable from another loopback port too"
    );
    const brokenSig = await request(port, signedFileUrl.slice(0, -1) + (signedFileUrl.endsWith("A") ? "B" : "A"), {
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    test.assert(brokenSig.status === 403, "a signed url with a broken signature is refused");

    // j. the pairing page itself
    const pairPage = await request(
      port,
      "/bridge/pair?origin=https%3A%2F%2Fboot-system6.pages.dev",
      { headers: { Host: `127.0.0.1:${port}` } }
    );
    test.assert(pairPage.status === 200, "the pairing page is served on the Mac");
    test.assert(
      String(pairPage.headers["content-security-policy"] || "").includes("frame-ancestors 'none'"),
      "the pairing page refuses to be framed"
    );
    const rebindingHost = await request(
      port,
      "/bridge/pair?origin=https%3A%2F%2Fboot-system6.pages.dev",
      { headers: { Host: `evil.example:${port}` } }
    );
    test.assert(rebindingHost.status === 403, "a rebinding Host cannot open the pairing page");
    const unknownPage = await request(
      port,
      "/bridge/pair?origin=https%3A%2F%2Fevil.example",
      { headers: { Host: `127.0.0.1:${port}` } }
    );
    test.assert(
      unknownPage.status === 200 && !unknownPage.body.includes('id="allow"'),
      "an unknown origin gets no Allow control"
    );

    // k. a wrong token is not a pairing
    const wrongToken = await request(port, "/api/music/gamdl/jobs", {
      method: "POST",
      headers: { ...bridgeHeaders, ...jsonHeaders, "X-AI-System-6-Bridge": "not-the-token" },
      body: jobBody,
    });
    test.assert(wrongToken.status === 401, "a wrong bridge token is refused");
  } finally {
    await stopServer(child);
    await fs.rm(serverRoot, { recursive: true, force: true });
  }
}

test.finish();
