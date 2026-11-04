// The READMEs retired the generated status line on 2026-11-04 (owner call:
// the shields row above it already names the beta and links the release). The
// library stays because `npm run version:set` still imports it, and because a
// leftover block from an un-rebased branch is worse than none — the version
// gate refuses a remnant instead of updating it.
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

import {
  buildDate,
  findStatusLine,
  replaceStatusLine,
  statusLine,
} from "../../tooling/lib/readme-status.mjs";

const test = createFeatureTest("readme-status");

test.assert(buildDate("20261104.2") === "2026-11-04", "a build stamp yields its calendar date");
test.assert(buildDate("not-a-stamp") === "", "a malformed stamp yields no date instead of a guess");

const english = statusLine({ version: "2.0.0-beta.2", build: "20261104.2" });
test.assert(
  english === "<!-- status:start -->\n"
    + "**Beta 2.0.0-beta.2** · build 20261104.2 · 2026-11-04 · "
    + "[release notes](https://github.com/surfine/AI-System-6/releases/tag/v2.0.0-beta.2)\n"
    + "<!-- status:end -->",
  "the line builder still produces the shape it always did"
);
test.assert(
  english.startsWith("<!-- status:start -->\n")
    && english.endsWith("\n<!-- status:end -->"),
  "the HTML markers are separate lines so GitHub parses the Markdown between them"
);

const chinese = statusLine({ version: "2.0.0-beta.2", build: "20261104.2", chinese: true });
test.assert(chinese.includes("**测试版 2.0.0-beta.2**"), "the Chinese line names the beta");
test.assert(chinese.includes("[发布说明]"), "the Chinese line links the release notes in Chinese");

const document = `# Title\n\n${english}\n\nBody\n`;
const replaced = replaceStatusLine(document, chinese);
test.assert(replaced === `# Title\n\n${chinese}\n\nBody\n`, "only the marked line is replaced");
test.assert(findStatusLine(replaced) === chinese, "the marked line can be read back");
test.assert(replaceStatusLine("# Title\n", english) === null, "a document without markers is left alone");

for (const relative of ["README.md", "README.zh-CN.md"]) {
  test.assert(findStatusLine(read(relative)) === null, `${relative} carries no status line (retired 2026-11-04)`);
}

test.finish();
