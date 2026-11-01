import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function loadModule(windowOverrides = {}) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(`${repoRoot}apps/desktop/app/core/endfield-grounding.js`, "utf8"), sandbox);
  const api = sandbox.window.AISystem6EndfieldGrounding;
  if (windowOverrides.capabilities) sandbox.window.AISystem6Capabilities = windowOverrides.capabilities;
  if (windowOverrides.cached) sandbox.window.AISystem6EndfieldSideAsk = windowOverrides.cached;
  return api;
}

const fixture = [
  { missionId: "c34m1", missionTitle: "迷雾藏起松林", speaker: "秦茳尺", text: "管理员，安德烈那家伙到武陵了吗？", section: "Main", missionUrl: "https://example.test/c34m1" },
  { missionId: "official_world_spaceship", missionTitle: "帝江号", speaker: "", text: "帝江号是终末地工业的总部。", section: "世界观资料" },
];

test("buildFromResults numbers [S1].. sources and keeps route+speaker labels", () => {
  const api = loadModule();
  const grounding = api.buildFromResults(fixture);
  assert.equal(grounding.sourceCount, 2);
  assert.equal(grounding.sources[0].citation, "[S1]");
  assert.equal(grounding.sources[1].citation, "[S2]");
  assert.equal(grounding.sources[0].label, "迷雾藏起松林 / Main / 秦茳尺");
  assert.equal(grounding.sources[0].kind, "endfield");
  assert.equal(grounding.sources[0].key, "endfield:c34m1:1");
  assert.equal(grounding.sources[0].index, 1);
  assert.equal(grounding.sources[0].url, "https://example.test/c34m1");
});

test("buildFromResults returns empty grounding for no results", () => {
  const api = loadModule();
  const grounding = api.buildFromResults([]);
  assert.equal(grounding.sources.length, 0);
  assert.equal(grounding.sourceCount, 0);
});

test("toSideAskContext instructs [S] citations and states no-evidence clearly", () => {
  const api = loadModule();
  const zh = api.toSideAskContext("雾隐冬梦", fixture, { lang: "zh" });
  assert.match(zh, /\[S1\]/);
  assert.match(zh, /只能依据证据/);
  const en = api.toSideAskContext("", [], { lang: "en" });
  assert.match(en, /no matching source text/);
});

test("searchForSideAsk calls the shared request service and normalizes results", async () => {
  const api = loadModule({
    capabilities: {
      requestService: async (_name, _opts) => {
        await Promise.resolve();
        return {
          ok: true,
          json: () => Promise.resolve({ results: fixture }),
        };
      },
    },
  });
  const result = await api.searchForSideAsk("帝江号");
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 2);
});

test("prepare falls back to the terminal's cached answer when live search fails", async () => {
  const api = loadModule({
    capabilities: {
      requestService: async () => {
        await Promise.resolve();
        return { ok: false, status: 500, json: () => Promise.resolve({ error: "boom" }) };
      },
    },
    cached: { query: "上次问题", results: fixture },
  });
  const state = await api.prepare("新问题");
  assert.equal(state.fallback, true);
  assert.equal(state.grounding.sourceCount, 2);
});
