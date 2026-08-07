"use strict";

const { decodeHtml, stripTags, cleanText } = require("./lib/text.js");
const { getTextOnceWithFallback, headerValue } = require("./lib/fetch.js");
const {
  READER_TIMEOUT_MS,
  resolveReaderTarget,
  cleanHtmlForReader,
  friendlyReaderError,
} = require("./reader.js");

const TIME_MACHINE_MAX_BYTES = 4 * 1024 * 1024;
const TIME_MACHINE_CAPTURE_LIMIT = 120;
const TIME_MACHINE_TIMEOUT_MS = 45000;
const TIME_MACHINE_PAGE_CACHE_TTL_MS = 60 * 1000;
const TIME_MACHINE_PAGE_CACHE_LIMIT = 8;
const timeMachinePageCache = new Map();
const ARCHIVE_TODAY_QUERY_HOSTS = [
  "archive.today",
  "archive.is",
  "archive.ph",
];
const ARCHIVE_TODAY_HOSTS = new Set([
  ...ARCHIVE_TODAY_QUERY_HOSTS,
  "archive.vn",
  "archive.fo",
  "archive.li",
  "archive.md",
]);

function timeMachineUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error("Time Machine accepts only valid URLs.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Time Machine accepts only http or https URLs.");
  }
  parsed.hash = "";
  return parsed.href;
}

function timeMachineTargetDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Time Machine date must use YYYY-MM-DD.");
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error("Time Machine date is not valid.");
  }
  return raw;
}

function waybackTimestampDate(timestamp) {
  const raw = String(timestamp || "");
  if (!/^\d{14}$/.test(raw)) return "";
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}.000Z`;
  return Number.isNaN(Date.parse(iso)) ? "" : iso;
}

function normalizeTimeMachineProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "auto") return "auto";
  if (raw === "wayback" || raw === "web.archive.org") return "wayback";
  if (raw === "archive-is" || raw === "archive-today") return "archive-is";
  let hostname = raw;
  try {
    hostname = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    hostname = raw;
  }
  return ARCHIVE_TODAY_HOSTS.has(hostname) ? "archive-is" : "";
}

function captureDistance(capture, targetDate) {
  if (!targetDate) return 0;
  const captured = Date.parse(capture?.capturedAt || "");
  if (Number.isNaN(captured)) return Number.POSITIVE_INFINITY;
  return Math.abs(captured - Date.parse(`${targetDate}T12:00:00.000Z`));
}

function sortCaptures(captures, targetDate = "") {
  const unique = [];
  const seen = new Set();
  for (const capture of captures || []) {
    const key = `${capture.provider}:${capture.snapshotUrl || capture.capturedAt || capture.id}`;
    if (!capture?.snapshotUrl || seen.has(key)) continue;
    seen.add(key);
    unique.push(capture);
  }
  if (targetDate) {
    return unique.sort((a, b) => captureDistance(a, targetDate) - captureDistance(b, targetDate));
  }
  return unique.sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));
}

async function fetchPinnedPage(value, signal, options = {}) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 AI-System-6-Time-Machine/1.0",
    "Accept": options.accept || "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.7",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    ...(options.headers || {}),
  };
  let resolved = await resolveReaderTarget(timeMachineUrl(value));
  let finalUrl = resolved.url;
  let upstream;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    upstream = await getTextOnceWithFallback(finalUrl, signal, headers, {
      maxBytes: options.maxBytes || TIME_MACHINE_MAX_BYTES,
      pinnedAddress: resolved.address,
      pinnedFamily: resolved.family,
    });
    if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
    const location = headerValue(upstream.headers, "location");
    if (!location) throw new Error(`Archive service returned ${upstream.status}.`);
    resolved = await resolveReaderTarget(new URL(location, finalUrl).href);
    finalUrl = resolved.url;
  }
  if ([301, 302, 303, 307, 308].includes(upstream?.status)) {
    throw new Error("Archive service redirected too many times.");
  }
  return { ...upstream, finalUrl };
}

function parseWaybackCdx(payload, originalUrl) {
  let rows;
  try {
    rows = JSON.parse(String(payload || ""));
  } catch {
    return [];
  }
  if (!Array.isArray(rows) || rows.length < 2 || !Array.isArray(rows[0])) return [];
  const fields = rows[0];
  const fieldIndex = Object.fromEntries(fields.map((field, index) => [field, index]));
  return rows.slice(1).filter(Array.isArray).map((row) => {
    const timestamp = String(row[fieldIndex.timestamp] || "");
    const capturedAt = waybackTimestampDate(timestamp);
    const archivedOriginal = String(row[fieldIndex.original] || originalUrl);
    const snapshotUrl = `https://web.archive.org/web/${timestamp}/${archivedOriginal}`;
    return {
      id: `wayback:${timestamp}:${archivedOriginal}`,
      provider: "wayback",
      originalUrl: archivedOriginal,
      snapshotUrl,
      browseUrl: `https://web.archive.org/web/${timestamp}id_/${archivedOriginal}`,
      capturedAt,
      statusCode: String(row[fieldIndex.statuscode] || ""),
      mimeType: String(row[fieldIndex.mimetype] || ""),
      digest: String(row[fieldIndex.digest] || ""),
      availability: "available",
    };
  }).filter((capture) => capture.capturedAt);
}

function parseWaybackAvailability(payload, originalUrl) {
  let closest;
  try {
    closest = JSON.parse(String(payload || ""))?.archived_snapshots?.closest;
  } catch {
    return [];
  }
  const timestamp = String(closest?.timestamp || "");
  const capturedAt = waybackTimestampDate(timestamp);
  if (!closest?.available || !capturedAt || !closest?.url) return [];
  const archivedOriginal = timeMachineUrl(originalUrl);
  return [{
    id: `wayback:${timestamp}:${archivedOriginal}`,
    provider: "wayback",
    originalUrl: archivedOriginal,
    snapshotUrl: `https://web.archive.org/web/${timestamp}/${archivedOriginal}`,
    browseUrl: `https://web.archive.org/web/${timestamp}id_/${archivedOriginal}`,
    capturedAt,
    statusCode: String(closest.status || "200"),
    mimeType: "text/html",
    digest: "",
    availability: "available",
  }];
}

function parseWaybackSparkline(payload) {
  let parsed;
  try {
    parsed = JSON.parse(String(payload || ""));
  } catch {
    return null;
  }
  const years = Object.entries(parsed?.years || {}).map(([year, months]) => {
    const normalizedMonths = Array.from({ length: 12 }, (_, index) => {
      const count = Number(Array.isArray(months) ? months[index] : 0);
      return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    });
    return {
      year: Number(year),
      count: normalizedMonths.reduce((sum, count) => sum + count, 0),
      months: normalizedMonths,
    };
  }).filter((entry) => Number.isInteger(entry.year) && entry.year >= 1996)
    .sort((a, b) => a.year - b.year);
  const firstCapturedAt = waybackTimestampDate(String(parsed?.first_ts || ""));
  const lastCapturedAt = waybackTimestampDate(String(parsed?.last_ts || ""));
  if (!years.length && !firstCapturedAt && !lastCapturedAt) return null;
  return {
    provider: "wayback",
    totalCaptures: years.reduce((sum, entry) => sum + entry.count, 0),
    firstCapturedAt,
    lastCapturedAt,
    years,
  };
}

function parseWaybackCalendarCaptures(payload, selectedYear) {
  let parsed;
  try {
    parsed = JSON.parse(String(payload || ""));
  } catch {
    return [];
  }
  const days = new Map();
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (!Array.isArray(node.ts)) {
      Object.values(node).forEach(visit);
      return;
    }
    const timestamps = node.ts.map(String).filter((timestamp) => /^\d{14}$/.test(timestamp));
    if (!timestamps.length) return;
    const first = timestamps[0];
    const date = `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}`;
    if (Number(date.slice(0, 4)) !== Number(selectedYear)) return;
    const statuses = Array.isArray(node.st) ? node.st.map(String) : [];
    let preferredIndex = statuses.findIndex((status) => status === "200");
    if (preferredIndex < 0) preferredIndex = statuses.findIndex((status) => /^3\d\d$/.test(status));
    if (preferredIndex < 0 || !timestamps[preferredIndex]) preferredIndex = 0;
    const count = Number(node.cnt);
    days.set(date, {
      date,
      count: Number.isFinite(count) && count > 0 ? Math.floor(count) : timestamps.length,
      timestamp: timestamps[preferredIndex],
      statusCode: statuses[preferredIndex] || "",
    });
  };
  visit(parsed);
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function timeMachineCalendarYear(value) {
  const year = Number(value);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1996 || year > currentYear) {
    throw new Error("Time Machine calendar year is not valid.");
  }
  return year;
}

async function queryWaybackCalendar(originalUrl, selectedYear, signal) {
  const canonicalUrl = timeMachineUrl(originalUrl);
  const year = timeMachineCalendarYear(selectedYear);
  const encodedUrl = encodeURIComponent(canonicalUrl);
  const referer = `https://web.archive.org/web/${year}0000000000*/${canonicalUrl}`;
  const requestOptions = {
    accept: "application/json,text/plain;q=0.9,*/*;q=0.5",
    headers: { Referer: referer },
  };
  const timelineJob = fetchPinnedPage(
    `https://web.archive.org/__wb/sparkline?output=json&url=${encodedUrl}&collection=web`,
    signal,
    { ...requestOptions, maxBytes: 512 * 1024 }
  ).then((response) => {
    if (!response.ok) throw new Error(`Wayback timeline returned ${response.status}.`);
    const timeline = parseWaybackSparkline(response.text);
    if (!timeline) throw new Error("Wayback timeline returned no archive range.");
    return timeline;
  });
  const calendarJob = fetchPinnedPage(
    `https://web.archive.org/__wb/calendarcaptures?url=${encodedUrl}&selected_year=${year}`,
    signal,
    { ...requestOptions, maxBytes: 3 * 1024 * 1024 }
  ).then((response) => {
    if (!response.ok) throw new Error(`Wayback calendar returned ${response.status}.`);
    return parseWaybackCalendarCaptures(response.text, year);
  });
  const [timelineResult, calendarResult] = await Promise.allSettled([timelineJob, calendarJob]);
  if (timelineResult.status === "rejected" && calendarResult.status === "rejected") {
    throw timelineResult.reason || calendarResult.reason;
  }
  return {
    originalUrl: canonicalUrl,
    year,
    timeline: timelineResult.status === "fulfilled" ? timelineResult.value : null,
    days: calendarResult.status === "fulfilled" ? calendarResult.value : [],
    timelineError: timelineResult.status === "rejected" ? timeMachineError(timelineResult.reason) : "",
    calendarError: calendarResult.status === "rejected" ? timeMachineError(calendarResult.reason) : "",
  };
}

function directWaybackCapture(originalUrl, targetDate) {
  const timestamp = `${targetDate.replaceAll("-", "")}000000`;
  const archivedOriginal = timeMachineUrl(originalUrl);
  return {
    id: `wayback-direct:${timestamp}:${archivedOriginal}`,
    provider: "wayback",
    originalUrl: archivedOriginal,
    snapshotUrl: `https://web.archive.org/web/${timestamp}/${archivedOriginal}`,
    browseUrl: `https://web.archive.org/web/${timestamp}id_/${archivedOriginal}`,
    capturedAt: `${targetDate}T00:00:00.000Z`,
    statusCode: "",
    mimeType: "text/html",
    digest: "",
    availability: "direct",
  };
}

async function queryWaybackCaptures(originalUrl, targetDate, signal) {
  if (targetDate) {
    const availabilityParams = new URLSearchParams({
      url: originalUrl,
      timestamp: targetDate.replaceAll("-", ""),
    });
    try {
      const availability = await fetchPinnedPage(
        `https://archive.org/wayback/available?${availabilityParams}`,
        signal,
        {
          accept: "application/json,text/plain;q=0.9,*/*;q=0.5",
          maxBytes: 512 * 1024,
        }
      );
      if (!availability.ok) throw new Error(`Wayback returned ${availability.status}.`);
      const captures = parseWaybackAvailability(availability.text, originalUrl);
      if (captures.length) return captures;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
    // The index endpoints are more aggressively rate-limited than replay.
    // A dated replay URL redirects to the closest real capture, so browsing can
    // still succeed when capture discovery is unavailable.
    return [directWaybackCapture(originalUrl, targetDate)];
  }
  const params = new URLSearchParams({
    url: originalUrl,
    output: "json",
    fl: "timestamp,original,mimetype,statuscode,digest",
    filter: "statuscode:200",
    collapse: "digest",
  });
  params.set("limit", String(-TIME_MACHINE_CAPTURE_LIMIT));
  const endpoint = `https://web.archive.org/cdx/search/cdx?${params}`;
  const response = await fetchPinnedPage(endpoint, signal, {
    accept: "application/json,text/plain;q=0.9,*/*;q=0.5",
    maxBytes: 2 * 1024 * 1024,
  });
  if (!response.ok) throw new Error(`Wayback returned ${response.status}.`);
  return sortCaptures(parseWaybackCdx(response.text, originalUrl), targetDate).slice(0, TIME_MACHINE_CAPTURE_LIMIT);
}

function archiveIsTimestampFromContext(context) {
  const datetime = context.match(/datetime=["']([^"']+)["']/i)?.[1];
  if (datetime && !Number.isNaN(Date.parse(datetime))) return new Date(datetime).toISOString();
  const compact = context.match(/\b(20\d{2}|19\d{2})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (compact) {
    const iso = `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6] || "00"}.000Z`;
    if (!Number.isNaN(Date.parse(iso))) return iso;
  }
  const textDate = cleanText(stripTags(context)).match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+((?:19|20)\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (textDate) {
    const parsed = Date.parse(`${textDate[1]} ${textDate[2]} ${textDate[3]} ${textDate[4] || "00"}:${textDate[5] || "00"} UTC`);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return "";
}

function parseArchiveIsResults(html, originalUrl, finalUrl = "https://archive.is/") {
  const source = String(html || "");
  const captures = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  for (const match of source.matchAll(linkPattern)) {
    let href;
    try {
      href = new URL(decodeHtml(match[1]), finalUrl).href;
    } catch {
      continue;
    }
    const parsed = new URL(href);
    if (!ARCHIVE_TODAY_HOSTS.has(parsed.hostname.toLowerCase())) continue;
    const snapshotId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (!/^[A-Za-z0-9]{4,}$/.test(snapshotId) || /^(faq|blog|rss)$/i.test(snapshotId)) continue;
    const start = Math.max(0, match.index - 700);
    const end = Math.min(source.length, match.index + match[0].length + 700);
    const context = source.slice(start, end);
    const capturedAt = archiveIsTimestampFromContext(context);
    captures.push({
      id: `archive-is:${snapshotId}`,
      provider: "archive-is",
      originalUrl,
      snapshotUrl: href,
      browseUrl: href,
      capturedAt,
      statusCode: "",
      mimeType: "text/html",
      digest: "",
      availability: "available",
    });
  }

  const final = new URL(finalUrl);
  const directId = final.pathname.split("/").filter(Boolean)[0] || "";
  if (ARCHIVE_TODAY_HOSTS.has(final.hostname.toLowerCase()) && /^[A-Za-z0-9]{4,}$/.test(directId)) {
    captures.push({
      id: `archive-is:${directId}`,
      provider: "archive-is",
      originalUrl,
      snapshotUrl: final.href,
      browseUrl: final.href,
      capturedAt: archiveIsTimestampFromContext(source.slice(0, 3000)),
      statusCode: "",
      mimeType: "text/html",
      digest: "",
      availability: "available",
    });
  }
  return sortCaptures(captures);
}

async function queryArchiveIsCaptures(originalUrl, targetDate, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  try {
    const result = await Promise.any(ARCHIVE_TODAY_QUERY_HOSTS.map(async (hostname) => {
      const endpoint = `https://${hostname}/${encodeURIComponent(originalUrl)}`;
      const response = await fetchPinnedPage(endpoint, controller.signal, { maxBytes: 3 * 1024 * 1024 });
      const captures = sortCaptures(
        parseArchiveIsResults(response.text, originalUrl, response.finalUrl),
        targetDate
      ).slice(0, TIME_MACHINE_CAPTURE_LIMIT);
      // Some archive.today edges attach a non-2xx status to an otherwise
      // usable results document. Trust a validated snapshot list before the
      // transport status, but never accept an unparseable challenge page.
      if (captures.length) return captures;
      if (!response.ok) throw new Error(`${hostname} returned ${response.status}.`);
      throw new Error(`${hostname} returned no snapshots.`);
    }));
    controller.abort();
    return result;
  } catch (error) {
    const details = error instanceof AggregateError
      ? error.errors.map((item) => item?.message).filter(Boolean).join(" ")
      : error?.message;
    throw new Error(details || "archive.today could not find a snapshot.");
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

function removeDangerousMarkup(html) {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(?:iframe|frame|frameset|object|embed|portal)\b[\s\S]*?<\/(?:iframe|frame|frameset|object|embed|portal)\s*>/gi, "")
    .replace(/<(?:iframe|frame|object|embed|portal)\b[^>]*\/?>/gi, "")
    .replace(/<meta\b[^>]*http-equiv=["']?(?:refresh|content-security-policy)[^>]*>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:nonce|integrity)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
}

function waybackReplayTimestamp(value) {
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== "web.archive.org") return "";
    return parsed.pathname.match(/^\/web\/(\d{14})(?:[a-z_]+)?\//i)?.[1] || "";
  } catch {
    return "";
  }
}

function safeBrowserAttributeUrl(value, baseUrl, archiveOriginalUrl = "") {
  const decoded = decodeHtml(String(value || "").trim());
  if (!decoded || decoded.startsWith("#")) return decoded;
  if (/^(?:javascript|data:text\/html|vbscript):/i.test(decoded)) return "";
  if (/^(?:mailto|tel):/i.test(decoded)) return decoded;
  try {
    const replayTimestamp = archiveOriginalUrl ? waybackReplayTimestamp(baseUrl) : "";
    const absolute = new URL(decoded, replayTimestamp ? archiveOriginalUrl : baseUrl);
    if (!["http:", "https:"].includes(absolute.protocol)) return "";
    if (replayTimestamp && absolute.hostname.toLowerCase() !== "web.archive.org") {
      return `https://web.archive.org/web/${replayTimestamp}id_/${absolute.href}`;
    }
    return absolute.href;
  } catch {
    return "";
  }
}

function sanitizeBrowserHtml(html, baseUrl, archiveOriginalUrl = "") {
  let output = removeDangerousMarkup(html);
  output = output.replace(/\s+(href|src|action|poster)\s*=\s*(["'])(.*?)\2/gi, (match, name, quote, value) => {
    const safe = safeBrowserAttributeUrl(value, baseUrl, archiveOriginalUrl);
    return safe ? ` ${name.toLowerCase()}=${quote}${safe.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}${quote}` : "";
  });
  output = output.replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  output = output.replace(/\s+formtarget\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return output;
}

function pageTitle(html, fallbackUrl) {
  const title = stripTags(String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  if (title) return cleanText(title);
  try {
    return new URL(fallbackUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Untitled Page";
  }
}

function timeMachineReaderIntegrity(reader, html) {
  const text = cleanText(reader?.text || "");
  if (!text) return { status: "unavailable", reason: "" };
  const source = String(html || "");
  const accessWall = /\bregwall\b|to keep reading this (?:story|article)|create a free account|log in to continue reading/i.test(source);
  const abruptEnding = /(?:…|\.{3})\s*$/.test(text);
  if (accessWall && (abruptEnding || text.length < 2000)) return { status: "partial", reason: "access-wall" };
  if (abruptEnding && text.length < 800) return { status: "partial", reason: "truncated" };
  return { status: "complete", reason: "" };
}

function timeMachinePageCacheKey(targetUrl, originalUrl = "") {
  return `${timeMachineUrl(targetUrl)}\n${originalUrl ? timeMachineUrl(originalUrl) : ""}`;
}

function cachedTimeMachinePage(key) {
  const entry = timeMachinePageCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    timeMachinePageCache.delete(key);
    return null;
  }
  timeMachinePageCache.delete(key);
  timeMachinePageCache.set(key, entry);
  return entry.page;
}

function cacheTimeMachinePage(keys, page) {
  const entry = { page, expiresAt: Date.now() + TIME_MACHINE_PAGE_CACHE_TTL_MS };
  for (const key of new Set(keys)) {
    timeMachinePageCache.delete(key);
    timeMachinePageCache.set(key, entry);
  }
  while (timeMachinePageCache.size > TIME_MACHINE_PAGE_CACHE_LIMIT) {
    timeMachinePageCache.delete(timeMachinePageCache.keys().next().value);
  }
}

function unwrapArchiveOriginal(value) {
  const url = timeMachineUrl(value);
  const parsed = new URL(url);
  if (parsed.hostname.toLowerCase() === "web.archive.org") {
    const match = parsed.pathname.match(/^\/web\/\d+(?:[a-z_]+)?\/(https?:\/\/.+)$/i);
    if (match) return timeMachineUrl(`${match[1]}${parsed.search}`);
  }
  return url;
}

async function browseTimeMachinePage(targetUrl, originalUrl, signal) {
  const requestKey = timeMachinePageCacheKey(targetUrl, originalUrl);
  const cached = cachedTimeMachinePage(requestKey);
  if (cached) return cached;
  const response = await fetchPinnedPage(targetUrl, signal);
  if (!response.ok) throw new Error(`Page returned ${response.status}.`);
  const contentType = headerValue(response.headers, "content-type");
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error("Time Machine can browse HTML pages only.");
  }
  const canonicalOriginal = originalUrl ? timeMachineUrl(originalUrl) : unwrapArchiveOriginal(response.finalUrl);
  const sanitizedHtml = sanitizeBrowserHtml(response.text, response.finalUrl, canonicalOriginal);
  let reader = null;
  try {
    reader = await cleanHtmlForReader(response.text, canonicalOriginal);
    const integrity = timeMachineReaderIntegrity(reader, response.text);
    reader = { ...reader, completeness: integrity.status, partialReason: integrity.reason };
  } catch {
    reader = null;
  }
  const page = {
    title: pageTitle(response.text, canonicalOriginal),
    url: canonicalOriginal,
    fetchedUrl: response.finalUrl,
    html: sanitizedHtml,
    reader,
    retrievedAt: new Date().toISOString(),
  };
  const finalKey = timeMachinePageCacheKey(response.finalUrl, canonicalOriginal);
  cacheTimeMachinePage([requestKey, finalKey], page);
  return page;
}

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Response-header CSP for /api/time-machine/render. The app's global CSP
// (src/server/security/local-request.js) is stricter on img-src than
// archived pages need — a srcdoc iframe inherits that global policy on top
// of any it declares itself, so an <img> allowance here would still get
// blocked. Serving the archived page as its own fetched document (rather
// than srcdoc) gives it an independent policy instead of a stacked one.
const TIME_MACHINE_FRAME_CSP =
  "default-src 'none'; img-src http: https: data: blob:; " +
  "style-src 'unsafe-inline' http: https:; font-src http: https: data:; " +
  "media-src http: https:; script-src 'unsafe-inline'; connect-src 'none'; " +
  "frame-src 'none'; object-src 'none'; form-action 'none'";

/**
 * Wraps a browsed page's sanitized HTML into a full document: charset, a
 * <base> pinning relative URLs to the fetched snapshot, cosmetic archive-
 * banner hiding, and a bridge script that turns link/form navigation inside
 * the frame into postMessage requests the parent handles (rather than
 * letting the sandboxed frame navigate on its own).
 *
 * Mirrors app/features/time-machine.js's timeMachineFrameDocument() — kept
 * in sync by hand; there is no shared module between client and server.
 */
function renderTimeMachineFrameDocument(page) {
  const baseUrl = page?.fetchedUrl || page?.url || "about:blank";
  // Archived and live pages commonly ship lazy images as `data-src` /
  // `data-srcset` placeholders (a 1x1 gif in `src`) that their own scripts
  // promote on scroll. This viewer's CSP deliberately blocks every external
  // script, so those images would otherwise stay 1x1 forever — the "pictures
  // missing" half of the Time Machine report. This passive sweeper does the
  // promotion itself: it only copies the real URL into the attribute the
  // browser already understands; it never executes page code.
  const lazyMedia = `
    <script>
      (() => {
        const promote = () => {
          document.querySelectorAll("img[data-src], img[data-srcset], source[data-srcset], video[data-src], video[data-poster]").forEach((node) => {
            if (node.dataset.srcset) node.setAttribute("srcset", node.dataset.srcset);
            if (node.dataset.src && node.tagName !== "SOURCE") node.setAttribute("src", node.dataset.src);
            if (node.tagName === "VIDEO" && node.dataset.poster) node.poster = node.dataset.poster;
          });
          // Apple-style lazy art pins a 1x1 gif in a <source data-empty>
          // (or a gif-only srcset) that outranks the real img src inside
          // <picture>, so the placeholder must go for the image to show.
          document.querySelectorAll("picture source[data-empty], video source[data-empty], picture source[srcset^='data:image/gif'], video source[srcset^='data:image/gif']").forEach((source) => source.remove());
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", promote);
        else promote();
      })();
    </script>
  `;
  const bridge = `
    <script>
      (() => {
        const send = (type, detail = {}) => parent.postMessage({ channel: "ai-system-6-time-machine", type, ...detail }, "*");
        document.addEventListener("click", (event) => {
          const anchor = event.target.closest("a[href]");
          if (!anchor) return;
          const href = anchor.href;
          if (!/^https?:/i.test(href)) return;
          event.preventDefault();
          send("navigate", { url: href });
        }, true);
        document.addEventListener("submit", (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          event.preventDefault();
          const method = String(form.method || "get").toLowerCase();
          if (method !== "get") {
            send("blocked", { reason: "form" });
            return;
          }
          const target = new URL(form.action || location.href, location.href);
          new FormData(form).forEach((value, key) => {
            if (typeof value === "string") target.searchParams.append(key, value);
          });
          send("navigate", { url: target.href });
        }, true);
      })();
    </script>
  `;
  const shell = `
    <meta charset="utf-8">
    <base href="${escapeHtmlAttr(baseUrl)}">
    <style>
      html, body { min-height: 100%; }
      body { margin: 0; overflow-wrap: anywhere; }
      img, video, svg, canvas { max-width: 100%; height: auto; }
      #wm-ipp-base, #wm-ipp-print, .archive-header, [id^="archive-banner"] { display: none; }
    </style>
  `;
  let html = String(page?.html || "");
  if (/<head\b[^>]*>/i.test(html)) {
    html = html.replace(/<head\b([^>]*)>/i, `<head$1>${shell}`);
  } else if (/<html\b[^>]*>/i.test(html)) {
    html = html.replace(/<html\b([^>]*)>/i, `<html$1><head>${shell}</head>`);
  } else {
    html = `<!doctype html><html><head>${shell}</head><body>${html}</body></html>`;
  }
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${lazyMedia}${bridge}</body>`);
  return `${html}${lazyMedia}${bridge}`;
}

function timeMachineError(error) {
  const message = friendlyReaderError(error);
  return message.replace(/^Reader\b/i, "Time Machine");
}

module.exports = {
  TIME_MACHINE_MAX_BYTES,
  TIME_MACHINE_TIMEOUT_MS,
  TIME_MACHINE_PAGE_CACHE_TTL_MS,
  READER_TIMEOUT_MS,
  timeMachineUrl,
  timeMachineTargetDate,
  timeMachineCalendarYear,
  normalizeTimeMachineProvider,
  waybackTimestampDate,
  sortCaptures,
  parseWaybackCdx,
  parseWaybackAvailability,
  parseWaybackSparkline,
  parseWaybackCalendarCaptures,
  directWaybackCapture,
  parseArchiveIsResults,
  sanitizeBrowserHtml,
  timeMachineReaderIntegrity,
  unwrapArchiveOriginal,
  queryWaybackCaptures,
  queryWaybackCalendar,
  queryArchiveIsCaptures,
  browseTimeMachinePage,
  renderTimeMachineFrameDocument,
  TIME_MACHINE_FRAME_CSP,
  timeMachineError,
};
