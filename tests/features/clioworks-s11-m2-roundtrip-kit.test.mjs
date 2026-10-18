// ClioWorks S11 M2 contract: the Office round-trip (2) kit for pptx. It imports the
// kit's own builders (so the generated files and the contract can never disagree) and
// reads edited.pptx back through the REAL vendored Lectern codec + the ClioWorks
// lectern adapter. Asserts the run change, the notes change, the duplicated slide, the
// new root comment and the reply threaded under the existing root.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { buildBase, buildEdited, makeSession, sha256, EDITS } from "../fixtures/clioworks-s11/roundtrip-2/make-roundtrip.mjs";

const test = createFeatureTest("clioworks-s11-m2-roundtrip-kit");
const here = dirname(fileURLToPath(import.meta.url));
const kit = join(here, "..", "fixtures", "clioworks-s11", "roundtrip-2");

const run = async () => {
  const base = buildBase();

  // --check mode logic: two builds are byte-identical, and the files on disk are those bytes.
  const built = await buildEdited(base);
  const again = (await buildEdited(buildBase())).bytes;
  test.assert(sha256(built.bytes) === sha256(again), "two builds in one process are byte-identical");
  for (const [name, data] of [["base.pptx", base], ["edited.pptx", built.bytes]]) {
    const path = join(kit, name);
    test.assert(existsSync(path) && sha256(readFileSync(path)) === sha256(data), `--check: ${name} on disk matches the rebuild`);
  }
  const expectedPath = join(kit, "EXPECTED.zh-CN.md");
  const expected = existsSync(expectedPath) ? readFileSync(expectedPath, "utf8") : "";
  test.assert(expected.includes("勿手改") && expected.includes(sha256(built.bytes)), "EXPECTED.zh-CN.md is the generated file for these bytes");

  // Read the written edited.pptx back through the real adapter.
  const { open } = makeSession();
  const back = await open(new Uint8Array(readFileSync(join(kit, "edited.pptx"))));
  const slides = back.slides();
  test.assert(slides.length === 3, "edited.pptx reads back with one more slide (3)");
  const [s0, s1, s2] = slides.map((sl) => sl.id);

  const runs = [];
  for (const shape of back.shapes(s0)) {
    if (!shape.editable || !Array.isArray(shape.paragraphs)) continue;
    for (const para of shape.paragraphs) for (const r of para.runs) runs.push(r.text);
  }
  test.assert(runs.includes(EDITS.runText), "the changed run reads back on slide 1");
  test.assert(back.notes(s0) === EDITS.notesText, "the replaced speaker notes read back on slide 1");
  test.assert(back.notes(s1) === back.notes(s2) && back.notes(s1).length > 0, "the duplicate carries the source slide's notes");

  const comments = back.comments(s0);
  const root = comments.find((c) => c.text === "这个数字出处在哪？" && c.author === "阿澄");
  const added = comments.find((c) => c.text === EDITS.newCommentText && c.author === EDITS.newCommentAuthor);
  const reply = comments.find((c) => c.text === EDITS.replyText && c.author === EDITS.replyAuthor);
  test.assert(!!root && root.parentId === null, "the existing modern root comment is still there");
  test.assert(!!added && !added.parentId && added.anchorShapeId, "the new comment reads back as a root anchored to slide 1");
  test.assert(!!reply && !!root && reply.parentId === root.id, "the reply reads back with parentId equal to the root's id");

  test.finish();
};

run();
