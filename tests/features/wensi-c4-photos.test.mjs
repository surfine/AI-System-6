// 文思泉涌 P4 · the photo collection editor.
//
// Two edits the writer actually makes: a frame's words, and a stack's order.
// Both rewrite photos.json, so both must refuse anything that would corrupt it —
// a field outside the five words a writer types, an order that adds or drops a
// photograph, a stack that does not exist. The contract also reads the file back
// after each write: the site has to be able to parse what the editor produced.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c4-photos");

const photos = require("../../apps/server/server/lib/blog-sites/photos.js");

const root = mkdtempSync(join(tmpdir(), "wensi-photos-"));
const photosDir = join(root, "photos");
mkdirSync(photosDir, { recursive: true });
const collection = {
  self: "",
  frames: {
    a: { file: "a.jpg", w: 900, h: 600, cap: "甲", alt: "甲图", city: "珠海", taken: "2024-08", medium: "速写" },
    b: { file: "b.jpg", w: 900, h: 600, cap: "", alt: "", city: "", taken: "", medium: "照片" },
    c: { file: "c.jpg", w: 900, h: 600, cap: "丙", alt: "丙图", city: "", taken: "", medium: "" },
  },
  stacks: [
    { slug: "one", title: "一叠", meta: "", intro: "", ids: ["a", "b"] },
    { slug: "two", title: "二叠", meta: "", intro: "", ids: ["c"] },
  ],
  rolls: [{ code: "R1", date: "2024-08" }],
};
writeFileSync(join(photosDir, "photos.json"), `${JSON.stringify(collection, null, 2)}\n`);

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  channel: { root },
  contentTypes: {
    photos: { label: "影像", storage: { kind: "json-collection", dir: photosDir, file: "photos.json" }, fields: [] },
  },
};

// ---- the view ----

const view = photos.photoView(site);
test.assert(view.ok === true && view.summary.stacks === 2 && view.summary.frames === 3, "the view counts the stacks and frames");
test.assert(
  JSON.stringify(view.stacks[0].frames.map((frame) => frame.id)) === JSON.stringify(["a", "b"]),
  "a stack's frames come back in the order the writer arranged",
);
test.assert(view.loose.length === 0, "every frame is in a stack, so nothing is loose");

// ---- editing one frame's words ----

const edited = photos.updateFrame(site, { id: "b", patch: { alt: "乙图：雨里的街口", cap: "路口" } });
test.assert(edited.ok === true, "a frame edit lands");
const afterEdit = JSON.parse(readFileSync(join(photosDir, "photos.json"), "utf8"));
test.assert(afterEdit.frames.b.alt === "乙图：雨里的街口" && afterEdit.frames.b.cap === "路口", "the two fields were written");
test.assert(afterEdit.frames.a.alt === "甲图", "another frame's words did not move");
test.assert(afterEdit.frames.b.file === "b.jpg" && afterEdit.frames.b.medium === "照片", "the file name and medium survive the edit");

// The file name and dimensions describe the photograph, not the words.
let code = "";
try { photos.updateFrame(site, { id: "b", patch: { file: "elsewhere.jpg" } }); } catch (error) { code = error.code; }
test.assert(code === "field_not_editable", "the file name is not an editable word");
try { photos.updateFrame(site, { id: "nope", patch: { alt: "x" } }); } catch (error) { code = error.code; }
test.assert(code === "frame_missing", "an unknown frame is a named refusal");
try { photos.updateFrame(site, { id: "b", patch: {} }); } catch (error) { code = error.code; }
test.assert(code === "bad_request", "an empty patch is refused rather than writing nothing");

// ---- arranging a stack ----

const moved = photos.reorderStack(site, { slug: "one", ids: ["b", "a"] });
test.assert(moved.ok === true, "a reorder lands");
const afterOrder = JSON.parse(readFileSync(join(photosDir, "photos.json"), "utf8"));
test.assert(JSON.stringify(afterOrder.stacks[0].ids) === JSON.stringify(["b", "a"]), "the stack keeps the new order");
test.assert(JSON.stringify(afterOrder.stacks[1].ids) === JSON.stringify(["c"]), "another stack's order did not move");

// An order edit is a permutation, never a set edit.
try { photos.reorderStack(site, { slug: "one", ids: ["b"] }); } catch (error) { code = error.code; }
test.assert(code === "order_mismatch", "dropping a frame from the order is refused");
try { photos.reorderStack(site, { slug: "one", ids: ["b", "a", "c"] }); } catch (error) { code = error.code; }
test.assert(code === "order_mismatch", "adding a stranger to the order is refused");
try { photos.reorderStack(site, { slug: "nope", ids: [] }); } catch (error) { code = error.code; }
test.assert(code === "stack_missing", "an unknown stack is a named refusal");

// ---- the file stays readable, and the view follows the writes ----

const reread = photos.photoView(site);
test.assert(
  JSON.stringify(reread.stacks[0].frames.map((frame) => frame.id)) === JSON.stringify(["b", "a"]),
  "reading the collection again shows the order the editor wrote",
);
test.assert(
  reread.stacks[0].frames[0].alt === "乙图：雨里的街口",
  "reading again shows the words the editor wrote",
);

// A site with no collection declared says so.
try { photos.collectionPath({ contentTypes: {} }); } catch (error) { code = error.code; }
test.assert(code === "photos_not_configured", "a site without a collection reports photos_not_configured");

rmSync(root, { recursive: true, force: true });
test.finish();
