import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function parseLaunch(search) {
  const source = readFileSync(`${repoRoot}apps/desktop/app/core/launch-intent.js`, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.AISystem6LaunchIntent.parse(search);
}

test("launch-intent parses known standalone routes", () => {
  const parsed = parseLaunch("?launch=endfield-terminal&mode=fullscreen");
  assert.equal(parsed.launch.name, "endfield-terminal");
  assert.equal(parsed.launch.command, "open-endfield-terminal");
  assert.equal(parsed.launch.fullscreen, true);
});

test("launch-intent defaults to non-fullscreen for a route without mode", () => {
  const parsed = parseLaunch("?launch=bonsai-city");
  assert.equal(parsed.launch.command, "open-bonsai-city");
  assert.equal(parsed.launch.fullscreen, false);
});

test("launch-intent refuses unknown and unsafe routes", () => {
  assert.equal(parseLaunch("?launch=javascript:alert(1)").launch, null);
  assert.equal(parseLaunch("?launch=not-a-real-route").launch, null);
  assert.equal(parseLaunch("").launch, null);
});

test("legacy open param still works", () => {
  const parsed = parseLaunch("?open=micropolis");
  assert.equal(parsed.open.name, "micropolis");
  assert.equal(parsed.open.command, "open-micropolis");
});

test("go short-link handler redirects known routes and rejects others", () => {
  const { handleGoRedirect } = require(`${repoRoot}apps/server/server/routes/go.js`);
  const run = (url) => {
    let status = 0;
    let location = "";
    const res = {
      writeHead(code, headers) {
        status = code;
        location = headers.Location || "";
      },
      end() {},
    };
    handleGoRedirect({ url }, res);
    return { status, location };
  };
  assert.deepEqual(run("/go/endfield-terminal?mode=fullscreen"), {
    status: 302,
    location: "/?launch=endfield-terminal&mode=fullscreen",
  });
  assert.deepEqual(run("/go/disks"), { status: 302, location: "/?launch=disks" });
  assert.equal(run("/go/bogus").status, 404);
  // 潮汐信笺 links from aaronlau.me carry a post, a block and ask=1, and nothing else.
  assert.deepEqual(run("/go/aaron-blog?post=iphone-air-165&p=3&ask=1&x=1"), {
    status: 302,
    location: "/?launch=aaron-blog&post=iphone-air-165&p=3&ask=1",
  });
  assert.equal(run("/go/aaron-blog?post=%3Cscript%3E&p=3").location, "/?launch=aaron-blog");
  assert.equal(run("/go/aaron-blog?post=long-x&p=abc").location, "/?launch=aaron-blog&post=long-x");
});

test("an aaron-blog launch names the post, the block and whether to ask", () => {
  const parsed = parseLaunch("?launch=aaron-blog&post=Iphone-Air-165&p=3&ask=1");
  assert.equal(parsed.launch.command, "open-aaron-blog");
  assert.equal(parsed.launch.window, "aaronBlog");
  assert.deepEqual({ ...parsed.blog }, { post: "iphone-air-165", para: 3, ask: true });
  assert.deepEqual({ ...parseLaunch("?launch=aaron-blog&post=x&p=99999").blog }, { post: "x", para: -1, ask: false });
  assert.equal(parseLaunch("?launch=aaron-blog&post=../etc").blog, null);
  assert.equal(parseLaunch("?launch=disks&post=x").blog, null, "only the blog route reads a post");
});
