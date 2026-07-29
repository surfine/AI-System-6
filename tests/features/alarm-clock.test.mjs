import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("alarm-clock");
const html = read("index.html");
const feature = read("app/features/alarm-clock.js");
const manifest = read("scripts/runtime-manifest.mjs");
const config = read("app/core/config.js");
const boot = read("app/core/boot.js");
const actions = read("app/core/actions.js");
const persistence = read("app/core/persistence-status.js");
const multiFinder = read("app/core/multi-finder.js");
const windows = read("app/core/window-manager.js");
const foundation = read("styles/00-foundation.css");
const surfaces = read("styles/30-surfaces.css");
const responsive = read("styles/60-responsive.css");
const liquid = read("styles/70-liquid-glass.css");
const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");

test.assertIncludes(html, 'data-action="open-alarm-clock"', "Apple menu exposes Alarm Clock as a Utility DA");
test.assertIncludes(html, 'data-window="alarmClock"', "Alarm Clock has a fixed desk-accessory window");
test.assertIncludes(html, 'id="alarm-clock-lever"', "the original upper-right expansion lever is interactive");
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
test.assertIncludes(feature, "function checkAlarmClock", "the alarm checks its stored time while the app is open");
test.assertIncludes(feature, 'playSystemSound("alert")', "the alarm reproduces the original single alert sound");
test.assertIncludes(feature, 'document.body.classList.toggle("alarm-clock-flash"', "a fired alarm flashes the Apple-menu position");
test.assertIncludes(persistence, "alarmClock: getAlarmClockState()", "alarm settings persist with the existing desk settings");
test.assertIncludes(persistence, "restoreAlarmClockState(settings.alarmClock)", "saved alarm settings restore at startup");
test.assertIncludes(multiFinder, 'alarmClock: "accessories"', "MultiFinder keeps Alarm Clock owned by Accessories");
test.assertIncludes(windows, '"alarmClock"', "global desk cleanup knows about Alarm Clock");
test.assertIncludes(foundation, "--alarm-clock-window-width:", "window geometry has one named owner token");
test.assertIncludes(surfaces, ".alarm-clock-window.is-compact .alarm-clock-lever-glyph", "the special lever turns horizontally in compact mode");
test.assertIncludes(responsive, ":not(.alarm-clock-window)", "responsive layout preserves the small accessory role");
test.assertIncludes(liquid, "--alarm-clock-surface-bg:", "Liquid Glass changes material through tokens without changing the object grammar");
test.assertIncludes(translationsEn, 'alarm_clock: "Alarm Clock"', "English labels name the original desk accessory");
test.assertIncludes(translationsZh, 'alarm_clock: "闹钟"', "Chinese labels are present for the new desk accessory");

test.finish();
