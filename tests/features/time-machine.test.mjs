// Time Machine is a restricted browser: it navigates the live web or resolves
// every clicked URL near one historical date, while Reader remains an optional
// reading and clipping view.

import { createRequire } from "node:module";
import zlib from "node:zlib";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("time-machine");
const feature = read("app/features/time-machine.js");
const server = read("src/server/time-machine.js");
const route = read("src/server/routes/time-machine.js");
const index = read("index.html");
const projectDisk = read("app/features/project-disk.js");
const persistence = read("app/core/persistence-status.js");
const menus = read("app/data/menus.js");
const html = read("index.html");
const styles = read("styles/22-time-machine.css");
const router = read("src/server/router.js");
const dictionary = read("app/data/system-dictionary.js");
const strings = read("app/core/strings.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const {
  parseWaybackCdx,
  parseWaybackAvailability,
  parseWaybackSparkline,
  parseWaybackCalendarCaptures,
  directWaybackCapture,
  parseArchiveIsResults,
  normalizeTimeMachineProvider,
  sanitizeBrowserHtml,
  timeMachineReaderIntegrity,
} = require("../../src/server/time-machine.js");
const { decodeTextBuffer } = require("../../src/server/lib/fetch.js");
const { charsetFromMetaPrescan } = require("../../src/server/lib/charset.js");

test.assertIncludes(index, 'data-window="timeMachine"', "Time Machine owns an independent application window");
test.assertIncludes(index, 'id="time-machine-back"', "restricted browser exposes Back navigation");
test.assertIncludes(index, 'id="time-machine-forward"', "restricted browser exposes Forward navigation");
test.assertIncludes(index, 'id="time-machine-address"', "restricted browser exposes an address field");
test.assertIncludes(index, 'id="time-machine-enabled"', "time travel is a browsing mode");
test.assertIncludes(index, 'class="time-machine-time-controls"', "the date expands inside the address bar");
test.assertIncludes(index, 'id="time-machine-calendar-button"', "calendar icon opens the historical date helper");
test.assertIncludes(index, 'class="time-machine-calendar-icon"', "the calendar control uses an unambiguous calendar-page icon");
test.assertNotIncludes(index, "<span aria-hidden=\"true\">▦</span>", "the calendar control does not use the old grid placeholder");
test.assertIncludes(index, 'id="time-machine-date-popover"', "date guidance stays in a window-local popover");
test.assertIncludes(index, 'id="time-machine-date-range"', "the calendar popover explains the usable date range");
test.assertIncludes(index, 'id="time-machine-year-strip"', "the calendar visualizes capture density over the actual archive years");
test.assertIncludes(index, 'id="time-machine-calendar-grid"', "the popover itself is a navigable month calendar");
test.assertIncludes(index, 'id="time-machine-date-count"', "the calendar reports the actual capture count");
test.assertNotIncludes(index, 'id="time-machine-date-picker"', "the calendar is not delegated to a second native date field");
test.assertIncludes(styles, "z-index: var(--z-local-popover)", "date guidance stays inside the window layer system");
test.assertIncludes(index, 'id="time-machine-source-switch"', "navigation exposes an immediate archive source switch");
test.assertNotIncludes(index, 'data-action="time-machine-home"', "source switching replaces the browser home action");
test.assertIncludes(index, 'id="chooser-archive-title"', "archive preference lives in Chooser");
test.assertIncludes(index, 'id="time-machine-provider"', "Chooser exposes the archive preference");
test.assertNotIncludes(index, 'id="time-machine-time-band"', "time controls do not occupy a separate browser toolbar");
test.assertNotIncludes(index, 'id="time-machine-resolution"', "title bar owns the live or historical time label");
test.assertIncludes(index, 'id="time-machine-title"', "title bar owns the visible time context");
// Superseded 2026-08-04: the window may echo its own receipt, because the
// desktop status line lives in ClioTalk's details bar and is invisible when
// that window is closed. What stays forbidden is accumulating a second
// notification feed: one transient line, gone again when the news is over.
test.assertMatches(index, /id="time-machine-provenance"[^>]*role="status"/, "Time Machine echoes its own receipt in its own window");
test.assertNotIncludes(index, 'id="time-machine-notifications"', "Time Machine does not duplicate the system notification center");
test.assertIncludes(index, 'id="time-machine-docmap"', "bottom bar keeps DocMap");
test.assertIncludes(index, 'id="time-machine-question"', "bottom bar keeps the visible question field");
test.assertIncludes(index, 'id="time-machine-ask"', "bottom bar keeps the Ask action");
test.assertNotIncludes(index, 'id="time-machine-clip"', "clip action is kept out of the bottom bar");
test.assertNotIncludes(index, 'id="time-machine-clip-translate"', "translated clip action is kept out of the bottom bar");
test.assertNotIncludes(index, 'id="time-machine-send-manuscript"', "manuscript transfer is kept out of the bottom bar");
test.assertIncludes(index, 'sandbox="allow-scripts"', "remote pages render in an opaque sandbox");
test.assertNotIncludes(index, 'sandbox="allow-scripts allow-same-origin"', "sandbox never combines scripts with same-origin privileges");

test.assertIncludes(feature, "function timeMachineNavigate(value, options = {})", "one navigation kernel owns live and historical browsing");
test.assertIncludes(feature, "function prepareTimeMachineBlankLaunch()", "each system launch starts Time Machine on a blank tab");
test.assertIncludes(feature, "function switchTimeMachineSource()", "the active historical page can retry through the other archive");
test.assertIncludes(feature, "seenProviders", "historical browsing keeps one automatic browse fallback per archive family");
test.assertIncludes(feature, "for (const candidate of browseCandidates)", "an unreadable snapshot automatically falls through to the other archive");
test.assertIncludes(feature, "partialFallback", "a preview-only snapshot falls through to a more complete archive before being shown");
test.assertIncludes(feature, "pageFallback", "a snapshot with no reader text also falls through before replacing a readable preview");
test.assertIncludes(feature, 't("time_machine_reader_partial")', "preview-only reader text is disclosed in the reading surface");
test.assertIncludes(feature, "timeMachineLoadArchiveCalendar", "opening the calendar queries the URL's real archive history");
test.assertIncludes(feature, "timeline.firstCapturedAt.slice(0, 10)", "the input minimum comes from the site's actual first capture");
test.assertIncludes(feature, "timeMachineChooseCalendarDate(date, dayData)", "calendar days open exact captures when available");
test.assertIncludes(feature, "function timeMachineSetDatePopover(open)", "calendar guidance has an explicit open and close state");
test.assertNotIncludes(feature, "\ntimeMachineUpdateDateRange();\ntimeMachineUpdateSourceSwitch();\nwindow.addEventListener", "date UI does not run before translations initialize");
test.assertIncludes(feature, 'message.channel !== "ai-system-6-time-machine"', "sandbox navigation uses a scoped message bridge");
test.assertIncludes(feature, "currentTimeMachinePage?.url || activeTimeMachineTab()?.state?.address", "raw Wayback relative links return to the original site before re-archiving");
test.assertIncludes(feature, "function showTimeMachineReaderView()", "Reader is an optional view inside the browser");
test.assertIncludes(feature, "function openTimeMachineSnapshotSource(source = {})", "Scrapbook can return to the exact archived source");
test.assertIncludes(feature, "function preserveCurrentTimeMachinePage(provider)", "current public pages can be handed to an archive");
test.assertIncludes(feature, 'type: "time-machine-preservation"', "preservation requests leave a local provenance record");
test.assertNotIncludes(feature, "timeMachineProviderInput.value = state.providerPreference", "opening a tab does not overwrite the global archive preference");
test.assertIncludes(feature, 'sourceKind: archive ? "archive_snapshot" : "web"', "historical clips preserve source identity");
test.assertIncludes(menus, '"time-machine-preserve-wayback"', "Wayback preservation is available from the Time menu");
test.assertIncludes(menus, '"time-machine-preserve-archive-is"', "archive.is preservation is available from the Time menu");
test.assertIncludes(menus, '"time-machine-switch-source"', "Navigate menu mirrors the source switch");
test.assertIncludes(projectDisk, '"timeMachine"', "project document tabs preserve Time Machine sessions");

test.assertIncludes(server, "queryWaybackCaptures", "Wayback queries are isolated behind a provider adapter");
test.assertIncludes(server, "__wb/sparkline", "the calendar reads Wayback's real capture timeline");
test.assertIncludes(server, "__wb/calendarcaptures", "the calendar reads Wayback's real day-level captures");
test.assertIncludes(server, "headers: { Referer: referer }", "Wayback calendar requests include the page context required by the archive");
test.assertIncludes(server, "queryArchiveIsCaptures", "archive.is queries are isolated behind a provider adapter");
test.assertIncludes(server, "ARCHIVE_TODAY_QUERY_HOSTS", "archive.today aliases race as one resilient provider family");
test.assertMatches(server, /parseArchiveIsResults\(response\.text[\s\S]*if \(captures\.length\) return captures;[\s\S]*if \(!response\.ok\)/, "archive.today keeps a validated snapshot list even when an edge reports a non-2xx status");
test.assertIncludes(server, "removeDangerousMarkup", "remote active content is removed before rendering");
test.assertIncludes(route, "Promise.allSettled", "one archive provider can fail without hiding the other");
test.assertIncludes(route, 'pathname === "/api/time-machine/calendar"', "the server exposes a calendar query without leaking archive calls into the client");
test.assertIncludes(route, "TIME_MACHINE_PROVIDER_TIMEOUT_MS", "a slow provider cannot consume the whole capture request");
// The public host reaches the archives far slower than a home connection does;
// a budget that fits only a fast link turns a working lookup into a bare 502.
test.assertIncludes(server, "TIME_MACHINE_TIMEOUT_MS = 85000", "historical replay gets a practical timeout independent of Reader");
test.assertIncludes(server, "TIME_MACHINE_PAGE_CACHE_TTL_MS", "browse and frame rendering can reuse one recent upstream snapshot");
test.assertIncludes(server, "TIME_MACHINE_INDEX_CACHE_TTL_MS", "a capture list or calendar is not re-fetched for every step through a site's history");
test.assertMatches(server, /cachedTimeMachineIndex\(cacheKey\);\s*\n\s*if \(cached\) return cached;/, "the index cache is read before any archive request is made");
test.assertMatches(server, /if \(!calendar\.timelineError && !calendar\.calendarError\) cacheTimeMachineIndex/, "a half-loaded calendar is not cached as if it were an answer");
test.assertIncludes(server, "isDirectFallback", "the stand-in replay entry never displaces a real capture list in the cache");
test.assertIncludes(route, "TIME_MACHINE_SECONDARY_TIMEOUT_MS", "the fallback archive cannot hold the reply after the preferred archive answered");
test.assertIncludes(route, '["archive-is", "wayback"]', "archive preference changes provider order without disabling fallback");
test.assertIncludes(route, 'captures.filter((capture) => capture.provider === provider)', "preferred provider wins when it has a capture");
test.assertIncludes(persistence, "timeMachineProvider:", "archive preference persists with other Chooser settings");
test.assertIncludes(router, 'prefix: "/api/time-machine"', "server exposes the Time Machine route family");
test.assertNotIncludes(feature, "window.open(", "site navigation remains inside Time Machine");
test.assertNotIncludes(feature, "window.prompt(", "source questions use visible product controls");
test.assertNotIncludes(styles, "!important", "new Time Machine CSS does not add priority debt");
test.assertIncludes(server, "data-srcset", "the replay frame promotes lazy media (data-src / data-srcset) without executing page scripts");
test.assertIncludes(server, "visibleTextLength < 80", "tiny bot-check / JS-shell pages fail with a named error instead of a blank frame");
test.assertIncludes(html, '<span class="time-machine-provenance" id="time-machine-provenance"', "which snapshot is on screen rides in the navigation row, costing the page no height");
test.assertIncludes(feature, "? timeMachineProviderLabel(page.archive.provider)", "the toolbar names the archive; the title bar already carries the date and page");
test.assertIncludes(feature, "setStatus(message, options.error === true ? { notify: true } : {})", "a Time Machine failure reaches the notification center by being marked, not by matching a keyword list");
test.assertNotIncludes(html, "time-machine-details-bar", "a transient receipt never costs the page a row");
test.assertIncludes(feature, "timeMachineReceiptTimer = window.setTimeout(renderTimeMachineProvenance", "and hands the slot back");
test.assertIncludes(html, '<button class="btn ask-bar-lead" type="button" id="time-machine-docmap"', "DocMap keeps its place beside the question");
test.assertIncludes(feature, "if (timeMachineProvenanceEl) {", "Time Machine reports its own receipts in its own window");
test.assertNotIncludes(feature, "\n  setStatus(", "no Time Machine receipt is left reporting only into ClioTalk's details bar");
test.assertIncludes(feature, 'registerAskBarSource("timeMachine", describeTimeMachineAskScope)', "Time Machine uses the shared ask bar instead of its own question row");
test.assertIncludes(feature, 'if (!page?.reader?.text) return { ready: false };', "an empty Time Machine gives the ask bar's space back instead of showing a dead control");
test.assertIncludes(feature, 'arrangeWindowAssistantSplit("timeMachine")', "a Time Machine question pairs the page with ClioTalk in SideAsk like every other source window");
test.assertIncludes(feature, 'range: selection ? t("ask_scope_selection") : t("ask_scope_whole_page")', "the ask bar states whether the question carries the selection or the whole page");
test.assertNotIncludes(`${index}\n${feature}\n${styles}`, "1996—Today", "the UI never invents a universal archive range");
test.assertIncludes(dictionary, 'id: "time-machine"', "System Help exposes Time Machine as a restricted historical browser");
test.assertIncludes(dictionary, "choose a 1990s capture", "System Help documents the historical Apple-site demonstration path");

const cdx = JSON.stringify([
  ["timestamp", "original", "mimetype", "statuscode", "digest"],
  ["19981212030405", "https://example.com/", "text/html", "200", "ABC"],
]);
const wayback = parseWaybackCdx(cdx, "https://example.com/");
test.assert(wayback.length === 1 && wayback[0].provider === "wayback", "CDX rows normalize into Wayback captures");
test.assert(wayback[0].browseUrl.includes("19981212030405id_"), "Wayback browse URL requests raw captured markup");

const availability = parseWaybackAvailability(JSON.stringify({
  archived_snapshots: {
    closest: {
      available: true,
      status: "200",
      timestamp: "20240102030405",
      url: "http://web.archive.org/web/20240102030405/https://example.com/",
    },
  },
}), "https://example.com/");
test.assert(availability[0]?.capturedAt === "2024-01-02T03:04:05.000Z", "dated browsing uses Wayback's nearest available snapshot");
test.assert(
  directWaybackCapture("https://example.com/", "2024-01-02").browseUrl.includes("/20240102000000id_/"),
  "rate-limited capture discovery falls back to a dated replay URL"
);

const timeline = parseWaybackSparkline(JSON.stringify({
  first_ts: "20000302184359",
  last_ts: "20260728105626",
  years: {
    2000: [0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    2026: [2, 0, 0, 0, 0, 0, 7],
  },
}));
test.assert(timeline?.firstCapturedAt === "2000-03-02T18:43:59.000Z", "Wayback timeline exposes the actual first capture");
test.assert(timeline?.lastCapturedAt === "2026-07-28T10:56:26.000Z", "Wayback timeline exposes the actual last capture");
test.assert(timeline?.totalCaptures === 13, "Wayback monthly density totals become the visible capture count");

const calendarDays = parseWaybackCalendarCaptures(JSON.stringify([[[{
  ts: ["20240102010000", "20240102020000"],
  cnt: 2,
  st: ["302", "200"],
}]]]), 2024);
test.assert(calendarDays[0]?.date === "2024-01-02", "Wayback calendar rows become marked days");
test.assert(calendarDays[0]?.timestamp === "20240102020000", "marked days prefer a successful exact capture");
test.assert(normalizeTimeMachineProvider("archive.today") === "archive-is", "archive.today belongs to the archive.today family");
test.assert(normalizeTimeMachineProvider("https://archive.is/AbC12") === "archive-is", "archive.is belongs to the archive.today family");
test.assert(normalizeTimeMachineProvider("archive.ph") === "archive-is", "archive.ph belongs to the archive.today family");

const archiveHtml = `
  <article><time datetime="2021-05-06T07:08:09Z"></time>
  <a href="/AbC12">snapshot</a></article>
`;
const archiveIs = parseArchiveIsResults(archiveHtml, "https://example.com/", "https://archive.is/https%3A%2F%2Fexample.com");
test.assert(archiveIs.some((capture) => capture.snapshotUrl === "https://archive.is/AbC12"), "archive.is HTML normalizes into provider captures");

const sanitized = sanitizeBrowserHtml(
  '<html><head><script>alert(1)</script></head><body onload="steal()"><a href="/next" onclick="steal()">Next</a><iframe src="https://bad.example"></iframe></body></html>',
  "https://example.com/start"
);
test.assert(!/<script|onload|onclick|iframe/i.test(sanitized), "active remote markup is removed");
test.assert(sanitized.includes('href="https://example.com/next"'), "relative navigation is rebased to the source page");

const previewIntegrity = timeMachineReaderIntegrity(
  { text: "A readable opening paragraph. The next sentence stops here…" },
  '<div id="regwall-heading">To keep reading this story, create a free account.</div>'
);
test.assert(
  previewIntegrity.status === "partial" && previewIntegrity.reason === "access-wall",
  "access-wall captures are not presented as complete articles"
);
test.assert(
  timeMachineReaderIntegrity({ text: "A complete article paragraph with a deliberate conclusion." }, "<article>Complete</article>").status === "complete",
  "ordinary readable captures remain complete"
);

const replaySanitized = sanitizeBrowserHtml(
  '<link rel="stylesheet" href="/style.css"><a href="/next"><img src="/hero.png"></a>',
  "https://web.archive.org/web/20240102030405id_/https://example.com/",
  "https://example.com/"
);
test.assert(
  replaySanitized.includes("https://web.archive.org/web/20240102030405id_/https://example.com/style.css"),
  "relative historical resources stay on the same Wayback replay timestamp"
);
test.assert(
  replaySanitized.includes("https://web.archive.org/web/20240102030405id_/https://example.com/next"),
  "historical links retain enough replay context to unwrap and re-query"
);

const archivedMarkup = "<html><title>Archived page</title><body>Readable</body></html>";
test.assert(
  decodeTextBuffer(zlib.gzipSync(Buffer.from(archivedMarkup)), {}, 1024) === archivedMarkup,
  "headerless gzip snapshots are decoded before archive rendering"
);

const legacyPage = Buffer.concat([
  Buffer.from('<html><head><script src="/wombat.js" charset="utf-8"></script>'),
  Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=gb2312"><title>'),
  Buffer.from([0xc6, 0xbb, 0xb9, 0xfb]),
  Buffer.from("</title></head><body></body></html>"),
]);
test.assert(
  decodeTextBuffer(legacyPage, { "content-type": "text/html" }, 65536).includes("<title>苹果</title>"),
  "an archived page declaring a legacy charset is decoded with that charset, not as UTF-8"
);
test.assert(
  decodeTextBuffer(legacyPage, { "content-type": "text/html; charset=utf-8" }, 65536).includes("<title>苹果</title>"),
  "the page's own declaration wins when a replay header claims UTF-8 over bytes that are not UTF-8"
);
test.assert(
  charsetFromMetaPrescan(legacyPage) === "gb2312",
  "the charset prescan reads <meta> declarations only, not the archive's injected script tags"
);
test.assertIncludes(server, '<meta charset="utf-8">', "the replay frame states the encoding of the transcoded page it renders");
test.assertIncludes(feature, "docMapSource: timeMachineDocMapSource,", "the loaded page is published as a DocMap source, not only as a button handler");
test.assertIncludes(feature, "function timeMachineDocMapSource()", "one accessor answers both the window's DocMap button and DocMap's own entry points");
test.assertIncludes(feature, "throw new Error(serviceErrorDetail(response.status, text));", "a failed archive request reports a status, never the upstream error page it received");
test.assertNotIncludes(feature, "payload?.error || text", "a gateway's HTML body is never used as the message shown to the writer");
test.assertIncludes(strings, "function serviceErrorDetail(status, body)", "one shared helper decides what a failed response is allowed to say");
test.assertIncludes(strings, "looksLikeMarkup", "the helper recognizes an HTML error page and refuses to quote it");
for (const key of ["service_http_error", "time_machine_reader_partial", "time_machine_reader_partial_status", "time_machine_reader_partial_source"]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}

test.finish();
