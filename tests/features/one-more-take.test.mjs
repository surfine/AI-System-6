// One More Take / 再来一条 — the props master's Apple-history quiz.
//
// The rules this contract holds are the ones a later pass is most likely to
// sand off:
//
//   1. A take never prints its answer: the dressed set names no model, year or
//      tagline, and the share text carries no answers.
//   2. Unknown time is null, never 0, and a prop within the date margin of the
//      scene is not fair game.
//   3. A home keeps old things: only "too early" is a goof there; "off sale" is
//      a goof only in a shop window.
//   4. The year is 360 set-days (60 sets × 6 rounds) plus 5 anniversaries.
//
// The module is also lazy, declared through the admissions table, and bilingual.

import vm from "node:vm";

import { admissionRows, createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";
import { lazyStyleBundles } from "../../tooling/style-manifest.mjs";
import { windowInterfaceRegistry } from "../../tooling/interface-guidelines-contract.mjs";

const test = createFeatureTest("one-more-take");

const source = read("app/features/one-more-take.js");
const deck = JSON.parse(read("data/one-more-take-deck.json"));

// ---- Lazy, admitted, declared -----------------------------------------------
test.assert(lazyRuntimePaths.includes("app/features/one-more-take.js"), "the module is a lazy runtime file, not a boot cost");
test.assertIncludes(
  read("app/core/config.js"),
  'createLazyModuleLoader("AISystem6OneMoreTakeLoaded", ["app/core/application-shell.js", "app/features/one-more-take.js"], false, ["styles.one-more-take.css"])',
  "one loader names the shell, the module and its stylesheet together"
);
test.assertIncludes(source, "window.AISystem6OneMoreTakeLoaded = true;", "the module installs its loaded flag");
test.assert(lazyStyleBundles.find((b) => b.id === "one-more-take")?.output === "styles.one-more-take.css", "a lazy style bundle is declared under the name the loader asks for");
const row = admissionRows().oneMoreTake;
test.assert(row?.command === "open-one-more-take" && row?.applicationGroup === "extras", "admitted next to One More Tune, with its opener");
test.assert(row?.phone === 1, "it is a full-screen app page on a phone");
test.assert(windowRegistryRecords().oneMoreTake?.builtByModule === true, "the window is built by the module, not shipped in index.html");
test.assert(windowInterfaceRegistry.oneMoreTake?.role === "creative-lab", "the interface guidelines register it as a creative lab, like its sibling");
test.assertIncludes(read("app/core/launch-intent.js"), '"one-more-take": { command: "open-one-more-take", window: "oneMoreTake" }', "?launch=one-more-take opens it");
test.assertIncludes(read("app/core/system-icons.js"), "oneMoreTake: `", "it has its own glyph");

// ---- Bilingual -----------------------------------------------------------------
const tables = {};
for (const lang of ["en", "zh"]) {
  const box = { window: {} };
  vm.runInNewContext(read(`app/data/translations-${lang}.js`), box);
  tables[lang] = box.window[lang === "en" ? "AISystem6TranslationsEn" : "AISystem6TranslationsZh"];
}
const usedKeys = [...new Set([...source.matchAll(/"(one_more_take_[a-z_]+)"/g)].map((m) => m[1]))];
for (const key of [...usedKeys, "one_more_take_label", "app_desc_one_more_take"]) {
  test.assert(key in tables.en && key in tables.zh, `${key} exists in both languages`);
}
for (const m of ["standard", "monochrome", "rewind", "intern", "rush", "night"]) {
  test.assert(`one_more_take_mutator_${m}` in tables.en && `one_more_take_mutator_${m}` in tables.zh, `the ${m} day has a name in both languages`);
}
for (const k of ["early", "offsale", "clean", "pair"]) test.assert(`one_more_take_kind_${k}` in tables.zh, `the ${k} ruling has a label`);

// ---- The pure rules, run for real ---------------------------------------------
const zhText = (key, ...args) => (typeof tables.zh[key] === "function" ? tables.zh[key](...args) : tables.zh[key] ?? key);
const box = { window: {}, t: zhText, setTimeout, clearTimeout, setInterval, clearInterval, console };
vm.runInNewContext(source, box);
const rules = box.window.AISystem6OneMoreTake?.rules;
test.assert(!!rules, "the module exposes its pure rules for this contract");
const { ym, takeIsFair, goofs, dayPlan, shareText, sceneMarkup } = rules;

for (const empty of [null, undefined, "", []]) test.assert(ym(empty) === null, `a missing date (${JSON.stringify(empty)}) is unknown, not month zero`);
test.assert(ym("1998-08") === 1998 * 12 + 7, "a year-month becomes a month count");

const looks = deck.looks;
const scene = (date, props, extra = {}) => ({ kind: "scene", date, props: props.map((look) => ({ look, x: 0, y: 0 })), ...extra });
test.assert(!takeIsFair(scene("1999-08", ["ibookBlueberry"]), looks), "a prop one month from the scene is not fair game");
test.assert(takeIsFair(scene("1999-09", ["ibookBlueberry"]), looks), "two months is enough");
test.assert(!takeIsFair(scene("1999-09", ["ibookBlueberry", "undated"]), { ...looks, undated: { start: null } }), "a prop with no date never enters a take");
test.assert(goofs(scene("2003-01", ["ibookTangerine"]), looks).length === 0, "an old machine left at home is not a goof");
test.assert(goofs(scene("2003-01", ["ibookTangerine"], { onSale: true }), looks)[0] === "ibookTangerine", "the same machine in a shop window is off sale");

// ---- The deck obeys them -------------------------------------------------------
for (const set of deck.sets) {
  test.assert(set.shots.length === 10, `set ${set.number} has ten takes`);
  const scenes = set.shots.filter((s) => s.kind === "scene");
  if (scenes.length) {
    const clean = scenes.filter((s) => s.verdict === "clean").length;
    test.assert(clean >= 2 && clean <= 4, `set ${set.number} has 2–4 clean takes among its scenes (has ${clean})`);
  }
  set.shots.forEach((shot, i) => {
    const where = `set ${set.number} take ${i + 1}`;
    if (shot.kind === "scene") {
      test.assert(takeIsFair(shot, looks), `${where} is fair: every prop dated and outside the margin`);
      const found = goofs(shot, looks);
      const expected = shot.verdict === "clean" ? [] : [shot.wrong];
      test.assert(JSON.stringify(found) === JSON.stringify(expected), `${where}: the dates agree with its ruling (${found.join(",") || "clean"})`);
      test.assert(shot.verdict !== "offsale" || shot.onSale === true, `${where}: off sale is only ruled in a shop window`);
      const markup = sceneMarkup(shot, looks);
      const visible = [...markup.matchAll(/>([^<]+)</g), ...markup.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]).join(" | ");
      for (const p of shot.props) {
        const look = looks[p.look];
        for (const word of [look.name.en, look.name.zh, look.short.en, look.short.zh, look.tagline].filter(Boolean)) {
          test.assert(!visible.includes(word), `${where}: the set does not print "${word}"`);
        }
      }
      test.assert(!/\b(19|20)\d\d\b/.test(visible), `${where}: the set prints no year`);
    } else {
      const lefts = shot.left.map((l) => l.id), rights = shot.right.map((r) => r.id);
      test.assert(JSON.stringify(Object.keys(shot.answer).sort()) === JSON.stringify([...lefts].sort()), `${where}: every left item has an answer`);
      test.assert(new Set(Object.values(shot.answer)).size === lefts.length && Object.values(shot.answer).every((r) => rights.includes(r)), `${where}: answers are distinct right items`);
      shot.left.filter((l) => l.look).forEach((l) => test.assert(!!looks[l.look], `${where}: ${l.look} is a known look`));
    }
  });
}

// ---- Upright phones move the camera in, never cutting a prop ------------------
for (const set of deck.sets) for (const shot of set.shots.filter((s) => s.kind === "scene")) for (const aspect of [1, 5 / 4, 4 / 3]) {
  const [cx, cy, cw, ch] = rules.cropFor(shot, looks, aspect);
  const inside = shot.props.every((p) => { const [x, y, w, h] = rules.placed(p, shot, looks).box; return x >= cx && y >= cy && x + w <= cx + cw && y + h <= cy + ch; });
  test.assert(inside, `set ${set.number} ${shot.date}: the upright crop keeps every prop in frame`);
  test.assert(cx >= 0 && cy >= 0 && cx + cw <= 960 && cy + ch <= 540, `set ${set.number} ${shot.date}: the crop stays inside the set`);
}
test.assertIncludes(source, 'const LINK_KEY = "oneMoreLink"', "the first device goes into the one record both games share");
test.assertIncludes(source, "store.askedFirstDevice", "the first-device question waits for the first wrap and is asked once");

// ---- End credits come from One More Tune and obey its gate --------------------
const tune = JSON.parse(read("data/one-more-tune-deck.json"));
for (const set of deck.sets.filter((s) => s.credits)) {
  const card = tune.cards.find((c) => c.id === set.credits);
  test.assert(!!card?.song && card?.questionSound?.provider === "preview", `set ${set.number}'s credits song ${set.credits} exists in One More Tune with a pinned store preview`);
}
test.assertIncludes(source, 'card.enabled === true && card.questionSound?.provider === "preview"', "a credits song plays only when One More Tune has cleared the card");

// ---- The year ------------------------------------------------------------------
const days = [];
for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) days.push(dayPlan(new Date(d), deck));
const anniversaries = days.filter((p) => p.anniversary);
test.assert(anniversaries.length === 5, `2026 has five anniversary days (has ${anniversaries.length})`);
test.assert(dayPlan(new Date(2026, 0, 24), deck).anniversary?.month === 1, "24 January is the Macintosh's day");
test.assert(dayPlan(new Date(2026, 5, 8), deck).anniversary?.nth === 2, "WWDC day is the second Monday of June (8 June 2026)");
const regular = days.filter((p) => !p.anniversary).map((p) => `${p.round}/${p.setNumber}`);
test.assert(regular.length === 360 && new Set(regular).size === 360, "the other 360 days are 60 sets × 6 rounds, none repeated");
const leap = [];
for (let d = new Date(2028, 0, 1); d.getFullYear() === 2028; d.setDate(d.getDate() + 1)) leap.push(dayPlan(new Date(d), deck));
const leapRegular = leap.filter((p) => !p.anniversary).map((p) => `${p.round}/${p.setNumber}`);
test.assert(leap.length === 366 && leap.filter((p) => p.anniversary).length === 6, "a leap year has six special days: the five anniversaries and 29 February");
test.assert(dayPlan(new Date(2028, 1, 29), deck).anniversary?.leap === true, "29 February is the leap-day special");
test.assert(leapRegular.length === 360 && new Set(leapRegular).size === 360, "a leap year still plays each set-day exactly once");
test.assert(days[0].round === 1 && days[0].setNumber === 1 && days[0].mutator === "standard", "1 January opens round one, set one, standard");

// ---- Sharing carries no answers ------------------------------------------------
const share = shareText(deck.sets[0], Array.from({ length: 10 }, (_, i) => ({ take: (i % 3) + 1, saved: i === 9 })), 42, 777);
test.assert(!/\b(19|20)\d\d\b/.test(share), "the share text prints no year");
for (const look of Object.values(looks)) test.assert(!share.includes(look.short.en) && !share.includes(look.short.zh), `the share text does not name ${look.short.en}`);

test.finish();
