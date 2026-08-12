import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { CORE_OBJECTS, ERAS, GENERATION_OBJECTS, REMAINING_OBJECTS, allMasterPromptRecords, buildPrompt } from "../../scripts/icon-generation/generated-era-core-prompts.mjs";

const test = createFeatureTest("generated-era-icon-pipeline");
const pipeline = read("scripts/generated-era-icon-pipeline.mjs");
const promptSource = read("scripts/icon-generation/generated-era-core-prompts.mjs");
const records = allMasterPromptRecords();

test.assert(Object.keys(CORE_OBJECTS).length === 14, "the generated family locks fourteen semantic objects");
test.assert(Object.keys(REMAINING_OBJECTS).length === 42, "the remaining generation inventory contains forty-two semantic objects");
test.assert(Object.keys(GENERATION_OBJECTS).length === 56, "the generation pipeline covers the complete semantic inventory");
test.assert(Object.keys(ERAS).length === 3, "the pipeline owns exactly Aqua, Snow Leopard, and Yosemite");
test.assert(records.length === 168, "one master prompt exists for all fifty-six objects in every owned era");
test.assert(new Set(records.map((entry) => `${entry.era}/${entry.icon}`)).size === 168, "every era/object prompt key is unique");

for (const era of Object.keys(ERAS)) {
  for (const icon of Object.keys(GENERATION_OBJECTS)) {
    const prompt = buildPrompt(era, icon);
    test.assertIncludes(prompt, "#FF00FF chroma-key background", `${era}/${icon} requests the removable flat key`);
    test.assertIncludes(prompt, "Do not copy, trace", `${era}/${icon} carries the copyright boundary`);
    test.assertIncludes(prompt, "no canvas-edge contact", `${era}/${icon} protects the trim margin`);
  }
}

test.assertIncludes(buildPrompt("aqua", "folder"), "specular gloss band", "Aqua prompts require real candy gloss");
test.assertIncludes(buildPrompt("aqua", "folder"), "dark saturated rim", "Aqua prompts reject neutral grey outlines");
test.assertIncludes(buildPrompt("snow-leopard", "hardDisk"), "neutral overhead light", "Snow Leopard prompts share neutral lighting");
test.assertIncludes(buildPrompt("snow-leopard", "hardDisk"), "No candy gloss band", "Snow Leopard prompts reject Aqua gloss");
test.assertIncludes(buildPrompt("yosemite", "document"), "shallow two-stop gradient", "Yosemite prompts cap shading depth");
test.assertIncludes(buildPrompt("yosemite", "document"), "not a current mobile-app badge", "Yosemite prompts resist modern drift");
test.assertIncludes(buildPrompt("aqua", "finderApp"), "eyes and a small smile", "Finder keeps the locked friendly Macintosh meaning");
test.assertIncludes(buildPrompt("yosemite", "assistant"), "solid filled balloon", "the user's ClioTalk turn is solid");
test.assertIncludes(buildPrompt("yosemite", "assistant"), "clearly dashed outline", "the provisional ClioTalk reply remains dashed");
test.assertIncludes(buildPrompt("aqua", "startupDisk"), "startup indicator", "Startup Disk stays distinct from the plain hard disk");
test.assertIncludes(buildPrompt("snow-leopard", "fileFloppy"), "3.5-inch floppy disk", "File Floppy keeps its physical storage metaphor");
test.assertIncludes(buildPrompt("yosemite", "projectDisc"), "rainbow diffraction", "Project CD remains an optical disc across the flatter era");

test.assertIncludes(pipeline, 'fetch(`${server}/api/image/generate`', "automated mode uses the existing server proxy");
test.assertIncludes(pipeline, "AI_SYSTEM6_IMAGE_API_KEY", "automated mode reads the key from local environment only");
test.assertIncludes(pipeline, "drafts/icon-generation/inbox", "manual mode has a stable drop folder");
test.assertIncludes(pipeline, "gridTransform", "imports use the shared icon grid");
test.assertIncludes(pipeline, "chromaToAlpha", "imports remove the flat key before placement");
test.assertIncludes(pipeline, "quantiseSmall", "small sizes receive deterministic hinting rather than a raw copy");
test.assertIncludes(pipeline, "one-pixel safety ring", "small raster outputs keep a real edge inset after grid normalisation");
test.assertIncludes(pipeline, "prepared.tiny", "a failed 16 px silhouette can opt into a separately generated tiny source");
test.assertIncludes(pipeline, "Pad it transparently to a square without stretching", "non-square model output is normalised without distortion");
test.assertIncludes(pipeline, "cross-era-candidate-board.png", "the human loop receives one aligned cross-era review board");
test.assertIncludes(pipeline, "cross-era-candidate-board-16px.png", "the human loop receives a nearest-neighbour 16 px proof board");
test.assertIncludes(pipeline, 'option("icons")', "the human review board can stay bounded to one production batch");
test.assertIncludes(pipeline, 'flag("partial")', "small production batches can be audited honestly");
test.assertIncludes(pipeline, "sha256", "candidate sources, prompts, and outputs carry hashes");
test.assertNotIncludes(pipeline, "assets/themes/${eraId}/icons", "candidate import cannot overwrite runtime icons before review");
test.assertNotIncludes(promptSource, "historical screenshot as input", "prompts do not embed historical screenshots");

test.finish();
