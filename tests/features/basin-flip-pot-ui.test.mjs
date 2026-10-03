// The two surfaces the flip-the-pot lane needs: Rootline saves the plan, Bonsai
// City prices it and lays it. The logic behind them is behaviour-tested in
// basin-flip-pot.test.mjs; this file is the wiring — the rows a person clicks,
// the commands behind them, and the fact that neither surface can move the city
// without the mayor confirming.
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("basin-flip-pot-ui");
const rootline = read("app/features/rootline.js");
const bonsai = read("app/features/bonsai-city.js");
const bonsaiStrings = read("app/features/bonsai-translations.js");
const renderer = read("app/features/bonsai-renderer-canvas.js");
const simSource = read("app/features/bonsai-city-sim.js");
const zh = read("app/data/translations-zh.js");
const en = read("app/data/translations-en.js");

// ----- Rootline: File > Save as a line-network plan -------------------------
test.assertIncludes(rootline, 'item("save-plan", "rootline_menu_save_plan")', "the planner has a row for saving the plan");
test.assertIncludes(rootline, '"save-plan": () => saveTransitPlan(),', "and the row runs the one save function");
test.assertIncludes(rootline, 'if (command === "save-plan") return Boolean(state.pot?.cityId) && Boolean(state.game?.lines?.length);',
  "it is offered only on a pot with something drawn");
test.assertIncludes(rootline, "async function saveTransitPlan()", "the save is one function");
test.assertIncludes(rootline, "builder.planFrom({ pot: pot.desc, game, core, fingerprint, id })",
  "the plan is built from the drawing and the city's own tiles");
test.assertIncludes(rootline, "World.plans.validate(plan)", "and checked against the shared contract before it is stored");
test.assertIncludes(rootline, "await putStoredTransitPlan(record)", "then saved as a draft record");
test.assertIncludes(rootline, 'status: "draft"', "a saved plan is a draft until the mayor lays it");
test.assertIncludes(rootline, "async function potFingerprint(cityId)", "the plan carries the fingerprint of the city it was drawn on");
test.assertIncludes(zh, "rootline_menu_save_plan", "the row is named in Chinese");
test.assertIncludes(en, "rootline_menu_save_plan", "and in English");

// ----- Bonsai City: File > Flip the pot ------------------------------------
test.assertIncludes(bonsai, 'item("flip-pot", "bonsai_flip_pot_menu")', "the mayor has a row for laying a plan");
test.assertIncludes(bonsai, '"flip-pot": () => openFlipPot(),', "and the row opens the bill");
test.assertIncludes(bonsai, "async function openFlipPot()", "the bill opens as one function");
test.assertIncludes(bonsai, 'await listStoredTransitPlans(state.record?.id || null)', "it lists this city's plans");
test.assertIncludes(bonsai, "flip.quote(sim(), state.current, record.plan, { depot: state.flipDepot === true })",
  "the price comes from the shared bill, on the city the mayor has open");
test.assertIncludes(bonsai, 'state.inspectorMode === "flipPot"', "the bill has its own inspector pane");
test.assertIncludes(bonsai, 'data-bonsai-flip-confirm', "the pane carries the confirm control");
test.assertIncludes(bonsai, "async function confirmFlipPot()", "confirming is one function");
test.assertIncludes(bonsai, "const laid = flip.lay(sim(), state.current, record.plan, { depot: state.flipDepot === true });",
  "confirming lays exactly the bill's commands");
test.assertIncludes(bonsai, "sim().setTransitLines(state.current, laid.sidecar)", "what was laid is recorded in the city");
test.assertIncludes(bonsai, "await saveCurrentCity()", "the city is saved through its own path");
test.assertIncludes(rootline, "if (!shape.ok)", "a plan that no longer matches the contract is refused before it is stored");
test.assertIncludes(bonsaiStrings, "bonsai_flip_pot_menu:", "the row is named in the game's own strings");
test.assertIncludes(bonsaiStrings, "bonsai_flip_cannot:", "and the refusal wording exists");
test.assertIncludes(bonsaiStrings, "bonsai_flip_depot_option:", "and the depot option the rubber-tyre lines need");

// Neither surface moves the city on its own: the bill only reads, and the
// commands run from the one confirm path.
const quoteCalls = (bonsai.match(/flip\.quote\(/g) || []).length;
test.assert(quoteCalls >= 1, "the pane prices by reading");
test.assert(!/openFlipPot\(\)[\s\S]{0,400}submitCommand/.test(bonsai), "opening the bill submits nothing");
test.assert(/confirmFlipPot\(\)[\s\S]{0,900}submitCommand/.test(bonsai), "only the confirm path submits commands");
test.assert(/confirmFlipPot\(\)[\s\S]{0,1200}restoreFallbackSnapshot\(before\)/.test(bonsai),
  "a command the city refuses restores the snapshot taken before the first one");

// ----- The city shows what it laid ------------------------------------------
// The overlay the mayor can switch to, the newspaper box, and the tile balloon
// all read the same record; a city with nothing laid shows nothing.
test.assertIncludes(simSource, "transitLayer", "the render snapshot carries the transit picture");
test.assertIncludes(simSource, 'layer[index] = mode === "bus" ? 8 : ((line.color ?? 0) % 7) + 1;',
  "a laid line's tiles take its colour, or the bus category");
test.assertIncludes(simSource, "layer[index] = depots.some(", "an avenue half is in service only when a depot is in reach");
test.assertIncludes(simSource, "layer[index] = 11;", "a station or stop reads as a station");
test.assertIncludes(renderer, '"transit"]', "the renderer knows the transit overlay");
test.assertIncludes(renderer, "const TRANSIT_COLORS = Object.freeze([", "and has its own colours");
test.assert(/TRANSIT_COLORS = Object\.freeze\(\[[\s\S]*?\]\);/.test(renderer), "the colour table is frozen");
test.assert((renderer.match(/rgba\(/g) || []).length >= 12, "with a colour for every category");
test.assertIncludes(bonsai, '"health", "transit",', "the city offers the overlay beside the other coverage maps");
test.assertIncludes(bonsai, "function transitBoxMarkup()", "the newspaper has a transit box");
test.assertIncludes(bonsai, "${transitBoxMarkup()}", "and the news pane renders it");
test.assertIncludes(bonsai, "function transitAtTile(tile)", "the tile balloon can name the line over a tile");
test.assertIncludes(bonsai, "bonsai_tile_transit: transitAtTile(tile) || \"—\"", "and shows it as a row");
test.assertIncludes(bonsaiStrings, "bonsai_transit_box:", "the box is named in the game's own strings");

test.finish();
