// GET  /bridge/pair                 — the pairing page, on this Mac only
// POST /api/music/bridge/pair       — issue a token for one public origin
// GET  /api/music/bridge/pairings   — paired origins and recent bridged jobs
// POST /api/music/bridge/revoke     — forget one origin, or all
//
// A public page cannot pair itself: it opens this page (a different origin it
// cannot script), the writer reads the disclaimer and presses Allow here, and
// this page hands the token back with postMessage to that exact origin. The
// API calls are same-origin only — none of these paths is on the bridge list.

"use strict";

const { randomBytes } = require("node:crypto");

const { readJsonBody, sendJson } = require("../lib/http.js");
const bridge = require("../music-bridge.js");
const { gamdlLibraryRoot } = require("../gamdl.js");
const { configuredBrowserBridgeOrigins, hostHeaderParts, isLoopbackHostname } = require("../security/local-request.js");

const COPY = Object.freeze({
  en: {
    title: "Allow a web page to use this Mac",
    lead: "wants Soundscape on this Mac to fetch Apple Music links you paste there.",
    noticeTitle: "Before you allow it",
    notice: [
      "This uses your own Apple Music subscription to save music you are entitled to listen to, on your own Mac, for your personal listening.",
      "Follow the Apple Media Services terms and the law where you live. Whether to use this is your own decision and responsibility.",
      "AI System 6 is not affiliated with Apple. It does not provide, host or distribute any audio; downloaded files stay on this Mac.",
      "Downloads rely on third-party open-source tools. This project does not guarantee how they behave or whether they keep working.",
    ],
    allow: "Agree and allow",
    deny: "Don't allow",
    done: "Allowed. You can close this page; the download continues on the web page.",
    doneNoOpener: "Allowed. Go back to the web page and press Download again.",
    denied: "Not allowed. Nothing was changed.",
    unknownOrigin: "This page is not one AI System 6 knows. Nothing can be allowed from here.",
    paired: "Pages allowed on this Mac",
    none: "None.",
    revoke: "Revoke",
    revokeAll: "Revoke all",
    recent: "Recent downloads started from web pages",
    failed: "That did not work. Try again.",
  },
  zh: {
    title: "允许网页使用这台 Mac",
    lead: "想让这台 Mac 上的 Soundscape 获取你在该网页里粘贴的 Apple Music 链接。",
    noticeTitle: "允许之前请读一下",
    notice: [
      "这个功能用你自己的 Apple Music 订阅，在你自己的 Mac 上保存你有权收听的内容，仅供个人收听。",
      "请遵守 Apple 媒体服务条款和你所在地的法律。是否使用由你自行判断、自行负责。",
      "AI System 6 与 Apple 没有关联，不提供、不托管、不分发任何音频；下载的文件只在这台 Mac 上。",
      "下载依赖第三方开源工具，本项目不保证它们的行为与可用性。",
    ],
    allow: "同意并允许",
    deny: "不允许",
    done: "已允许。可以关闭本页，下载会在原网页里继续。",
    doneNoOpener: "已允许。请回到原网页，再点一次「下载」。",
    denied: "未允许，没有做任何改动。",
    unknownOrigin: "这个网页不在 AI System 6 认识的列表里，无法从这里允许。",
    paired: "已允许的网页",
    none: "无。",
    revoke: "撤销",
    revokeAll: "全部撤销",
    recent: "最近由网页发起的下载",
    failed: "没有成功，请再试一次。",
  },
});

function pickLanguage(req, url) {
  const asked = String(url.searchParams.get("lang") || "").toLowerCase();
  if (asked.startsWith("zh")) return "zh";
  if (asked.startsWith("en")) return "en";
  return /^zh/i.test(String(req.headers["accept-language"] || "")) ? "zh" : "en";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pageHtml(copy, origin, known, nonce, lang) {
  const notice = copy.notice.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  const body = known
    ? `<p><strong>${escapeHtml(origin)}</strong> ${escapeHtml(copy.lead)}</p>
<h2>${escapeHtml(copy.noticeTitle)}</h2><ul>${notice}</ul>
<p class="actions"><button id="deny" type="button">${escapeHtml(copy.deny)}</button>
<button id="allow" type="button" class="default">${escapeHtml(copy.allow)}</button></p>`
    : `<p>${escapeHtml(copy.unknownOrigin)}</p>`;
  return `<!doctype html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(copy.title)}</title>
<style nonce="${nonce}">
body{font:15px/1.5 -apple-system,"PingFang SC",sans-serif;max-width:34rem;margin:2rem auto;padding:0 16px;color:#000;background:#fff}
h1{font-size:1.2rem}h2{font-size:1rem;margin-top:1.5rem}
.box{border:1px solid #000;box-shadow:2px 2px 0 #000;padding:1rem 1.25rem}
button{font:inherit;border:1px solid #000;border-radius:6px;background:#fff;padding:.3rem 1rem;margin-left:.5rem}
button.default{box-shadow:0 0 0 2px #fff,0 0 0 3px #000}
.actions{text-align:right}#status{min-height:1.5em}
li{margin:.25rem 0}small{color:#555}
@media (prefers-color-scheme:dark){body{background:#111;color:#eee}.box{border-color:#eee;box-shadow:2px 2px 0 #eee}button{background:#222;color:#eee;border-color:#eee}}
</style></head>
<body><div class="box"><h1>${escapeHtml(copy.title)}</h1>${body}<p id="status" role="status"></p></div>
<h2>${escapeHtml(copy.paired)}</h2><ul id="pairings"><li>${escapeHtml(copy.none)}</li></ul>
<p><button id="revoke-all" type="button">${escapeHtml(copy.revokeAll)}</button></p>
<h2>${escapeHtml(copy.recent)}</h2><ul id="recent"><li>${escapeHtml(copy.none)}</li></ul>
<script nonce="${nonce}">
(() => {
  const copy = ${JSON.stringify(copy).replace(/</g, "\\u003c")};
  const origin = ${JSON.stringify(known ? origin : "").replace(/</g, "\\u003c")};
  const status = document.getElementById("status");
  const post = (url, body) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const item = (text, extra) => {
    const li = document.createElement("li");
    li.textContent = text;
    if (extra) li.append(" ", extra);
    return li;
  };
  async function refresh() {
    const data = await fetch("/api/music/bridge/pairings", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!data) return;
    const pairings = document.getElementById("pairings");
    pairings.replaceChildren(...(data.pairings.length ? data.pairings.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = copy.revoke;
      button.addEventListener("click", async () => { await post("/api/music/bridge/revoke", { origin: entry.origin }); refresh(); });
      return item(entry.origin, button);
    }) : [item(copy.none)]));
    const recent = document.getElementById("recent");
    recent.replaceChildren(...(data.recent.length ? data.recent.map((entry) => {
      const small = document.createElement("small");
      small.textContent = new Date(entry.at).toLocaleString() + " · " + entry.origin;
      return item(entry.url, small);
    }) : [item(copy.none)]));
  }
  document.getElementById("revoke-all").addEventListener("click", async () => {
    await post("/api/music/bridge/revoke", { origin: "*" });
    refresh();
  });
  document.getElementById("deny")?.addEventListener("click", () => {
    status.textContent = copy.denied;
    window.opener?.postMessage({ type: "ai-system6-bridge-denied" }, origin);
    setTimeout(() => window.close(), 600);
  });
  document.getElementById("allow")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    const response = await post("/api/music/bridge/pair", { origin }).catch(() => null);
    const data = response && response.ok ? await response.json().catch(() => null) : null;
    if (!data?.token) {
      status.textContent = copy.failed;
      event.currentTarget.disabled = false;
      return;
    }
    if (window.opener) {
      window.opener.postMessage({ type: "ai-system6-bridge-paired", token: data.token }, origin);
      status.textContent = copy.done;
      setTimeout(() => window.close(), 800);
    } else {
      status.textContent = copy.doneNoOpener;
    }
    refresh();
  });
  refresh();
})();
</script></body></html>`;
}

async function handleBridgePairPage(req, res) {
  const host = hostHeaderParts(req.headers.host);
  if (!isLoopbackHostname(host.hostname)) {
    sendJson(res, 403, { code: "untrusted_local_request", error: "Open this page on the Mac itself." });
    return;
  }
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const origin = String(url.searchParams.get("origin") || "");
  const known = configuredBrowserBridgeOrigins().has(origin);
  const lang = pickLanguage(req, url);
  const nonce = randomBytes(16).toString("base64");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "X-Frame-Options": "DENY",
  });
  res.end(pageHtml(COPY[lang], origin, known, nonce, lang));
}

async function handleBridgePair(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req, { limitBytes: 2048 });
  } catch {
    sendJson(res, 400, { code: "bridge_bad_request", error: "A JSON body with an origin is required." });
    return;
  }
  const origin = String(body?.origin || "");
  if (!configuredBrowserBridgeOrigins().has(origin)) {
    sendJson(res, 400, { code: "bridge_unknown_origin", error: "That page cannot be allowed." });
    return;
  }
  const root = gamdlLibraryRoot();
  // Pairing is where the writer reads and accepts the disclaimer.
  await bridge.acceptConsent(root);
  const token = await bridge.pairOrigin(root, origin);
  sendJson(res, 200, { origin, token });
}

async function handleBridgePairings(req, res) {
  const root = gamdlLibraryRoot();
  sendJson(res, 200, {
    pairings: await bridge.listPairings(root),
    recent: await bridge.recentBridgeJobs(root),
  });
}

async function handleBridgeRevoke(req, res) {
  let body = {};
  try {
    body = await readJsonBody(req, { limitBytes: 2048 });
  } catch {
    sendJson(res, 400, { code: "bridge_bad_request", error: "A JSON body with an origin is required." });
    return;
  }
  const origin = String(body?.origin || "");
  if (!origin) {
    sendJson(res, 400, { code: "bridge_bad_request", error: "An origin is required." });
    return;
  }
  await bridge.revokePairing(gamdlLibraryRoot(), origin);
  sendJson(res, 200, { revoked: origin });
}

module.exports = {
  handleBridgePair,
  handleBridgePairPage,
  handleBridgePairings,
  handleBridgeRevoke,
};
