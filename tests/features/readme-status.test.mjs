import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

import {
  buildDate,
  findStatusLine,
  replaceStatusLine,
  statusLine,
} from "../../tooling/lib/readme-status.mjs";

const test = createFeatureTest("readme-status");

test.assert(buildDate("20261101.1") === "2026-11-01", "a build stamp yields its calendar date");
test.assert(buildDate("not-a-stamp") === "", "a malformed stamp yields no date instead of a guess");

const english = statusLine({ version: "2.0.0-beta.1", build: "20261101.1" });
test.assert(
  english === "<!-- status:start -->**Beta 2.0.0-beta.1** · build 20261101.1 · 2026-11-01 · "
    + "[release notes](https://github.com/surfine/AI-System-6/releases/tag/v2.0.0-beta.1)<!-- status:end -->",
  "the English line names the version, build, date and release tag"
);

const chinese = statusLine({ version: "2.0.0-beta.1", build: "20261101.1", chinese: true });
test.assert(chinese.includes("**测试版 2.0.0-beta.1**"), "the Chinese line names the beta");
test.assert(chinese.includes("[发布说明]"), "the Chinese line links the release notes in Chinese");

const document = `# Title\n\n${english}\n\nBody\n`;
const replaced = replaceStatusLine(document, chinese);
test.assert(replaced === `# Title\n\n${chinese}\n\nBody\n`, "only the marked line is replaced");
test.assert(findStatusLine(replaced) === chinese, "the marked line can be read back");
test.assert(replaceStatusLine("# Title\n", english) === null, "a document without markers is left alone");

for (const [relative, expected] of [
  ["README.md", statusLine({ version: "2.0.0-beta.1", build: "20261101.1" })],
  ["README.zh-CN.md", statusLine({ version: "2.0.0-beta.1", build: "20261101.1", chinese: true })],
]) {
  const actual = findStatusLine(read(relative));
  test.assert(actual !== null, `${relative} carries a status line`);
  test.assert(actual === expected, `${relative} status line matches this release`);
}

test.finish();
