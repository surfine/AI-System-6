import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("alarm-clock");
const html = read("index.html");
const feature = read("app/features/alarm-clock.js");
const manifest = read("scripts/runtime-manifest.mjs");
const config = read("app/core/config.js");
const boot = read("app/core/boot.js");
const actions = read("app/core/actions.js");
const persistence = read("app/core/persistence-status.js");
const workingSession = read("app/core/working-session.js");
const multiFinder = read("app/core/multi-finder.js");
const windows = read("app/core/window-manager.js");
const foundation = read("styles/00-foundation.css");
const surfaces = read("styles/30-surfaces.css");
const responsive = read("styles/60-responsive.css");
const liquid = read("styles/70-liquid-glass.css");
const cssSnapshots = read("scripts/css-surface-snapshot.mjs");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

test.assertIncludes(html, 'data-action="open-alarm-clock"', "Apple menu exposes Alarm Clock as a Utility DA");
test.assertIncludes(html, 'data-window="alarmClock"', "Alarm Clock has a fixed desk-accessory window");
test.assertIncludes(html, 'id="alarm-clock-lever"', "the original upper-right expansion lever is interactive");
test.assertIncludes(html, 'viewBox="0 0 8 13"', "the alarm enable control uses the native 8 by 13 pixel switch bounds");
test.assertIncludes(html, 'class="alarm-clock-stepper-glyph" viewBox="0 0 11 18"', "the alarm editor uses the native 11 by 18 pixel stepper bounds instead of font triangles");
test.assertIncludes(html, 'class="alarm-clock-bell-rays" viewBox="0 0 23 9"', "the ringing state carries the native 23 by 9 pixel ray field");
test.assertIncludes(html, 'class="alarm-clock-menu-icon" viewBox="0 0 15 16"', "ringing can replace the Apple glyph with the observed 15 by 16 pixel menu alarm");
test.assertIncludes(html, '<h2 class="visually-hidden" id="alarm-clock-title"', "the native time strip remains the visible chrome while the accessible window name stays available");
test.assertIncludes(html, 'data-alarm-clock-mode="time"', "the analogue clock pane remains available");
test.assertIncludes(html, 'data-alarm-clock-mode="date"', "the tear-off calendar pane remains available");
test.assertIncludes(html, 'data-alarm-clock-mode="alarm"', "the ringing alarm pane remains available");
test.assertNotIncludes(
  html.match(/<section class="window alarm-clock-window[\s\S]*?<\/section>/)?.[0] || "",
  'class="resize-box"',
  "the fixed-size desk accessory does not pretend to be resizable",
);
test.assertIncludes(
  manifest.slice(manifest.indexOf("lazyRuntimePaths")),
  '"app/features/alarm-clock.js"',
  "Alarm Clock stays outside the two-floppy core",
);
test.assertIncludes(config, "async function ensureAlarmClockModule()", "Alarm Clock has one lazy loader");
test.assertIncludes(boot, "ensureAlarmClockModule()", "boot loads the alarm timer before restoring its saved state");
test.assertIncludes(actions, '"open-alarm-clock": () => openWindow("alarmClock")', "the Apple-menu command opens the real window");
test.assertIncludes(feature, "function formatAlarmClockTime", "the compact title row shows live system time");
test.assertIncludes(feature, "function formatAlarmClockDate", "the expanded date pane shows the current date");
test.assertIncludes(feature, 'const alarmClockEditSegments = ["hour", "minute", "second", "meridiem"]', "alarm editing follows the native hour, minute, second, and meridiem fields");
test.assertIncludes(feature, "function selectAlarmClockSegment", "focusing the alarm time selects one native field instead of exposing a free caret");
test.assertIncludes(feature, 'alarmClockEditSegment === "second"', "the pixel stepper adjusts the selected field at its own granularity");
test.assertIncludes(feature, "function checkAlarmClock", "the alarm checks its stored time while the app is open");
test.assertIncludes(feature, 'querySelector(".alarm-clock-title-bar")?.addEventListener("dblclick"', "double-clicking the native top strip also folds the clock");
test.assertIncludes(feature, 'playSystemSound("alert")', "the alarm reproduces the original single alert sound");
test.assertIncludes(feature, 'document.body.classList.toggle("alarm-clock-ringing"', "a fired alarm owns one shared ringing state across the window and menu bar");
test.assertIncludes(feature, 'if (mode === "alarm" && alarmClockRinging) alarmClockRinging = false', "clicking the Alarm pane acknowledges the ringing state");
test.assertIncludes(persistence, "alarmClock: getAlarmClockState()", "alarm settings persist with the existing desk settings");
test.assertIncludes(persistence, "restoreAlarmClockState(settings.alarmClock)", "saved alarm settings restore at startup");
test.assertIncludes(workingSession, 'intrinsicSessionSizeWindowNames = new Set(["alarmClock"])', "session restore cannot revive an obsolete inline Alarm Clock size");
test.assertIncludes(multiFinder, 'alarmClock: "accessories"', "MultiFinder keeps Alarm Clock owned by Accessories");
test.assertIncludes(windows, '"alarmClock"', "global desk cleanup knows about Alarm Clock");
test.assertIncludes(foundation, "--alarm-clock-window-width: 130px", "window geometry stays at the 129px native WIND scale instead of using the old 2x scale");
test.assertIncludes(foundation, "--alarm-clock-section-gap: 0px", "Classic keeps the native readout and mode strip contiguous");
test.assertIncludes(foundation, "--alarm-clock-selection-bg: var(--ink)", "Classic inverts only the selected alarm-time segment");
test.assertIncludes(surfaces, ".alarm-clock-window.is-compact .alarm-clock-lever-glyph", "the native lever key points right when the lower rows fold away");
test.assertIncludes(surfaces, "width: 23px", "the analogue clock uses the native 23px PICT glyph bounds");
test.assertIncludes(surfaces, ".alarm-clock-switch.is-on .alarm-clock-switch-fill-on", "the native switch changes its internal pixel fill instead of sliding a generic knob");
test.assertIncludes(surfaces, ".alarm-clock-stepper-glyph", "the native stepper is painted as one 1-bit object without an invented middle divider");
test.assertIncludes(surfaces, ".alarm-clock-window.is-ringing .alarm-clock-bell-rays", "ringing adds the observed asymmetric ray pixels without rotating the resource bell");
test.assertIncludes(surfaces, "animation: alarm-clock-menu-apple-flash 2s step-end infinite", "the native Apple glyph owns the second half of the observed two-second flash cycle");
test.assertIncludes(surfaces, "animation: alarm-clock-menu-icon-flash 2s step-end infinite", "the native menu alarm owns the first half of the observed two-second flash cycle");
test.assertNotIncludes(surfaces, "transform: rotate(-6deg)", "the resource bell stays fixed while it rings");
test.assertIncludes(surfaces, ".alarm-clock-readout > .alarm-clock-value", "the compact readout owns its height and padding instead of inheriting full-size form-control geometry");
test.assertIncludes(surfaces, "grid-template-rows: repeat(2, minmax(0, 1fr))", "both alarm stepper cells must shrink inside the fixed native readout row");
test.assertIncludes(surfaces, "margin-top: var(--alarm-clock-section-gap)", "the theme owns optical space between the readout and mode strip through one token");
test.assertIncludes(responsive, ":not(.alarm-clock-window)", "responsive layout preserves the small accessory role");
test.assertNotIncludes(responsive, "body .window.alarm-clock-window > .title-bar.alarm-clock-title-bar", "late responsive CSS cannot replace the native Alarm Clock top strip");
test.assertIncludes(liquid, "--alarm-clock-surface-bg:", "Liquid Glass changes material through tokens without changing the object grammar");
test.assertIncludes(liquid, "--alarm-clock-section-gap: 2px", "Liquid Glass leaves only a minimal optical separation below the rounded readout without resizing Classic");
test.assertIncludes(liquid, "--alarm-clock-selection-bg: rgba(0, 122, 255, 0.82)", "Liquid Glass keeps native field granularity while using its focus accent");
test.assertNotIncludes(liquid, "body.use-liquid-glass .alarm-clock-window > .alarm-clock-title-bar", "Liquid Glass changes the native top strip through tokens instead of a second structural painter");
test.assertIncludes(cssSnapshots, '"alarm-clock": {', "Classic and Liquid Glass snapshots cover the Alarm Clock surface");
test.assertIncludes(cssSnapshots, 'id: "compact"', "the snapshot contract covers the folded lever state");
test.assertIncludes(translationsEn, 'alarm_clock: "Alarm Clock"', "English labels name the original desk accessory");
test.assertIncludes(translationsZh, 'alarm_clock: "闹钟"', "Chinese labels are present for the new desk accessory");

test.finish();
