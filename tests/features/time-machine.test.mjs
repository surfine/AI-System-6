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
test.assertNotIncludes(index, 'id="time-machine-status"', "Time Machine does not duplicate the system notification center");
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
test.assertIncludes(server, "removeDangerousMarkup", "remote active content is removed before rendering");
test.assertIncludes(route, "Promise.allSettled", "one archive provider can fail without hiding the other");
test.assertIncludes(route, 'pathname === "/api/time-machine/calendar"', "the server exposes a calendar query without leaking archive calls into the client");
test.assertIncludes(route, "TIME_MACHINE_PROVIDER_TIMEOUT_MS", "a slow provider cannot consume the whole capture request");
test.assertIncludes(server, "TIME_MACHINE_TIMEOUT_MS = 45000", "historical replay gets a practical timeout independent of Reader");
test.assertIncludes(route, '["archive-is", "wayback"]', "archive preference changes provider order without disabling fallback");
test.assertIncludes(route, 'captures.filter((capture) => capture.provider === provider)', "preferred provider wins when it has a capture");
test.assertIncludes(persistence, "timeMachineProvider:", "archive preference persists with other Chooser settings");
test.assertIncludes(router, 'prefix: "/api/time-machine"', "server exposes the Time Machine route family");
test.assertNotIncludes(feature, "window.open(", "site navigation remains inside Time Machine");
test.assertNotIncludes(feature, "window.prompt(", "source questions use visible product controls");
test.assertNotIncludes(styles, "!important", "new Time Machine CSS does not add priority debt");
test.assertIncludes(styles, "border-radius: var(--control-radius)", "Time Machine inputs follow the active theme radius token");
test.assertIncludes(styles, "grid-template-columns: repeat(7", "the popover renders a seven-day calendar");
test.assertIncludes(styles, "grid-template-columns: repeat(auto-fit, minmax(44px, 1fr))", "phone navigation and view choices share one adaptive control row");
test.assertIncludes(styles, ".time-machine-view-switch {\n    display: contents;", "phone view choices join the navigation row without a second toolbar");
test.assertIncludes(styles, ".time-machine-reader-actions:has(#time-machine-docmap:disabled):has(#time-machine-question:disabled)", "empty Time Machine pages do not reserve space for unusable bottom controls");
test.assertIncludes(styles, ".time-machine-ask-form {\n    grid-template-columns: minmax(0, 1fr) auto;", "loaded pages keep DocMap and Ask in one compact bottom row");
test.assertIncludes(styles, ".time-machine-toggle > span {\n    display: none;", "phone address bar hides the redundant mode label without removing its accessible label");
test.assertIncludes(styles, "min-height: 44px", "phone Time Machine controls meet the touch target floor");
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
for (const key of ["service_http_error"]) {
  test.assertIncludes(en, `${key}:`, `English includes ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese includes ${key}`);
}

test.finish();
