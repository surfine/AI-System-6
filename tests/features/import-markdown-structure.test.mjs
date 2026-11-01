// An external .md imported through the server importer keeps its Markdown:
// headings, nested lists, fenced code and emphasis come back as written, so the
// TeachText document that receives it (Markdown inside) saves back as the same .md.
import { createRequire } from "node:module";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("import-markdown-structure");
const require = createRequire(import.meta.url);
const { extractSimpleImportedTextNative } = require("../../apps/server/server/importers/text.js");

const fixture = [
  "# 标题一",
  "",
  "段落里有 **粗体**、*斜体* 和 `行内代码`。",
  "",
  "## 列表",
  "",
  "- 第一项",
  "    - 缩进子项",
  "1. 有序一",
  "2. 有序二",
  "",
  "```js",
  "function a() {",
  "    return 1;",
  "}",
  "```",
  "",
  "> 引用",
  "",
].join("\n");

const out = await extractSimpleImportedTextNative("note.md", "text/markdown", Buffer.from(fixture, "utf8"));
test.assert(out === fixture, "the imported text is the file's own Markdown, byte for byte");
const crlf = await extractSimpleImportedTextNative("note.md", "text/markdown", Buffer.from(fixture.replace(/\n/g, "\r\n"), "utf8"));
test.assert(crlf === fixture, "CRLF files come through with LF line endings and nothing else changed");

test.finish();
