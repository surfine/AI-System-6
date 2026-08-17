import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { unzipSync, zipSync } from "../../node_modules/three/examples/jsm/libs/fflate.module.js";

const root = join(fileURLToPath(import.meta.url), "..", "..", "..");
const source = readFileSync(join(root, "apps/desktop/app/features/cmf-usdz-export.js"), "utf8");

const window = {};
const sandbox = { window, TextEncoder, TextDecoder, Uint8Array, Blob };
runInNewContext(source, sandbox, { filename: "cmf-usdz-export.js" });

const exporter = window.AISystem6CMFUsdzExport;
assert.ok(exporter, "browser exporter installs on window.AISystem6CMFUsdzExport");

const recipeInput = {
  modelId: "iphone-17-standard",
  parts: {
    frame: "red",
    backGlass: "blue",
    actionButton: "red",
    usbC: "blue",
  },
  colors: [
    { id: "red", hex: "#ff0000" },
    { id: "blue", hex: "#0000ff" },
  ],
  exactMeshParts: {
    body: "frame",
    back: "backGlass",
  },
  exactOnly: false,
  slug: "test-phone",
};

const normalized = exporter.normalizeRecipe(recipeInput);
assert.equal(normalized.parts.actionOrSim, "red", "browser actionButton maps to actionOrSim");
assert.equal(normalized.parts.frameSide, "red", "frameSide follows frame when not supplied");
assert.equal(normalized.parts.screwOrSpeaker, "blue", "screwOrSpeaker follows USB-C when not supplied");

const usda = `#usda 1.0
(
    defaultPrim = "phone"
)

def Xform "phone"
{
    def Mesh "body"
    {
        point3f[] points = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]
        rel material:binding = </phone/materials/base>
    }

    def Mesh "back"
    {
        point3f[] points = [(0, -1, 0), (1, -1, 0), (1, -1, 1), (0, -1, 1), (0, -1.8, 0), (1, -1.8, 0), (1, -1.8, 1), (0, -1.8, 1)]
        rel material:binding = </phone/materials/base>
    }

    def Material "base"
    {
        color3f inputs:diffuseColor = (0.5, 0.5, 0.5)
    }
}
`;

const payload = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
const inputZip = zipSync({
  "model.usda": new TextEncoder().encode(usda),
  "payload.bin": payload,
}, { level: 6 });

const result = exporter.repackageUsdzBuffer(inputZip, recipeInput, { unzipSync, zipSync });
const outputEntries = unzipSync(new Uint8Array(result.buffer));
const outputUsda = new TextDecoder().decode(outputEntries["model.usda"]);

assert.deepEqual(outputEntries["payload.bin"], payload, "non-USD entries are preserved byte-for-byte");
assert.notEqual(outputUsda, usda, "model.usda is recolored");
assert.match(outputUsda, /def Material "base__frame_red"/, "frame material clone is written");
assert.match(outputUsda, /def Material "base__backGlass_blue"/, "backGlass material clone is written");
assert.match(outputUsda, /rel material:binding = <\/phone\/materials\/base__frame_red>/, "body mesh is rebound to its frame clone");
assert.match(outputUsda, /rel material:binding = <\/phone\/materials\/base__backGlass_blue>/, "back mesh is rebound to its backGlass clone");
assert.equal(result.stats.materialCloneCount, 2, "both recolored surfaces produce exactly one clone");

console.log("OK  cmf-usdz-export: browser recolor and USDZ repackaging behavior");
