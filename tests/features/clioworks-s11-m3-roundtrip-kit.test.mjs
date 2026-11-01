// ClioWorks S11 M3 contract: the Office round-trip (3) kit for docx. It imports the kit's own
// builders (so the generated files and the contract can never disagree) and reads edited.docx
// back through the REAL vendored Quire codec + the ClioWorks quire adapter. Asserts the run
// change, bold word, heading, list item, the new root comment (with its landing range) and the
// reply threaded under it, and that the comment already in base.docx is kept.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { buildBase, buildEdited, makeSession, sha256, EDITS } from "../fixtures/clioworks-s11/roundtrip-3/make-roundtrip.mjs";

const test = createFeatureTest("clioworks-s11-m3-roundtrip-kit");
const here = dirname(fileURLToPath(import.meta.url));
const kit = join(here, "..", "fixtures", "clioworks-s11", "roundtrip-3");

const run = async () => {
  const base = buildBase();

  // --check logic: two builds are byte-identical, and the files on disk are those bytes.
  const built = await buildEdited(base);
  const again = (await buildEdited(buildBase())).bytes;
  test.assert(sha256(built.bytes) === sha256(again), "two builds in one process are byte-identical");
  for (const [name, data] of [["base.docx", base], ["edited.docx", built.bytes]]) {
    const path = join(kit, name);
    test.assert(existsSync(path) && sha256(readFileSync(path)) === sha256(data), `--check: ${name} on disk matches the rebuild`);
  }
  const expectedPath = join(kit, "EXPECTED.zh-CN.md");
  const expected = existsSync(expectedPath) ? readFileSync(expectedPath, "utf8") : "";
  test.assert(expected.includes("勿手改") && expected.includes(sha256(built.bytes)), "EXPECTED.zh-CN.md is the generated file for these bytes");

  // Read the written edited.docx back through the real adapter.
  const { open } = makeSession();
  const back = await open(new Uint8Array(readFileSync(join(kit, "edited.docx"))));
  const paras = back.paragraphs();
  const find = (t) => paras.find((p) => p.text.startsWith(t));
  test.assert(paras.length === 12 && back.tables().length === 1, "edited.docx keeps 12 paragraphs and the table");
  test.assert(!!find(EDITS.runText) && !paras.some((p) => p.text === EDITS.runBefore), "the changed run text reads back");
  const bolded = find(EDITS.boldParagraph).runs.filter((r) => r.kind === "text" && r.b).map((r) => r.text);
  test.assert(bolded[0] === EDITS.boldWord, "the one word is bold and reads back as its own bold run");
  test.assert(find(EDITS.headingParagraph).headingLevel === EDITS.headingLevel, "the paragraph reads back as a heading");
  test.assert(find(EDITS.runText).list && find(EDITS.runText).list.kind === EDITS.listKind, "the paragraph reads back as a bullet item");
  test.assert(find("新书架").runs[0].kind === "image", "the picture survives the preserving save");

  const comments = back.comments();
  const existing = comments.find((c) => c.text === "纸箱数量再确认一下");
  const root = comments.find((c) => c.text === EDITS.newCommentText && c.author === EDITS.newCommentAuthor);
  const reply = comments.find((c) => c.text === EDITS.replyText && c.author === EDITS.replyAuthor);
  test.assert(comments.length === 3, "three comments: the one from base.docx plus the new root and reply");
  test.assert(!!existing && existing.parentId === null && existing.anchor.quote === "纸箱", "the comment already in base.docx is kept with its range");
  test.assert(!!root && root.parentId === null && root.anchor.paragraphId === find(EDITS.newCommentParagraph).id, "the new comment reads back as a root on its paragraph");
  test.assert(!!reply && !!root && reply.parentId === root.id, "the reply reads back with parentId equal to the new root's id");

  test.finish();
};

run();
