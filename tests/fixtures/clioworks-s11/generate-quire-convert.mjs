// ClioWorks S11 M3 (F9): the docx whose ordinary edits make the first-save list appear.
//   node tests/fixtures/clioworks-s11/generate-quire-convert.mjs          write quire-convert-s11.docx
//   node tests/fixtures/clioworks-s11/generate-quire-convert.mjs --check  rebuild and compare, write nothing
// Derived from the frozen quire-s11.docx by two hand edits to word/document.xml, the same two
// variants the clioworks-v4-quire contract builds in-test, frozen together as one file:
//   1. the table's <w:tblGrid> is emptied, so any save rebuilds the column widths (converted);
//   2. the first paragraph opens with a <w:bookmarkStart> that has no matching end, so any save
//      drops the bookmark (lost) and tidies the bookmark ranges (converted).
// Every other part keeps quire-s11.docx's bytes. Fixed zip timestamps; synthetic content.
import AdmZip from "adm-zip";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FIXED = new Date(2026, 9, 17, 8, 0, 0);
const NAME = "quire-convert-s11.docx";

export function buildConvertFixture() {
  const base = new AdmZip(readFileSync(join(here, "quire-s11.docx")));
  const zip = new AdmZip();
  for (const entry of base.getEntries()) {
    let data = entry.getData();
    if (entry.entryName === "word/document.xml") {
      const xml = data.toString("utf8");
      const grid = xml.replace(/<w:tblGrid>.*?<\/w:tblGrid>/s, "<w:tblGrid/>");
      const changed = grid.replace("<w:p>", '<w:p><w:bookmarkStart w:id="77" w:name="orphan"/>');
      if (grid === xml || changed === grid) throw new Error("quire-s11.docx no longer has the table grid or plain paragraph this fixture edits");
      data = Buffer.from(changed, "utf8");
    }
    zip.addFile(entry.entryName, data);
  }
  for (const e of zip.getEntries()) e.header.time = FIXED;
  return zip.toBuffer();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = buildConvertFixture();
  const target = join(here, NAME);
  if (process.argv.includes("--check")) {
    const same = Buffer.compare(readFileSync(target), out) === 0;
    console.log(same ? `${NAME} matches its generator` : `${NAME} differs from its generator`);
    process.exit(same ? 0 : 1);
  }
  writeFileSync(target, out);
  console.log(`${NAME} written (${out.length} bytes)`);
}
