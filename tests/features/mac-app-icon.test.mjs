import { createRequire } from "node:module";
import { join } from "node:path";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import {
  INTERNATIONAL_ORANGE,
  MAC_APP_ICONSET_SIZES,
  renderVersionedMacAppIcon,
  versionLabelForSize,
} from "../../tooling/lib/mac-app-icon.mjs";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("canvas");

const test = createFeatureTest("mac-app-icon");
const shell = read("tooling/build-mac-shell-app.mjs");
const iconSource = join(root, "system.css-reference/docs/icon.png");

test.assertIncludes(shell, 'from "./lib/mac-app-icon.mjs"', "the Mac shell builder imports the versioned icon helper");
test.assertIncludes(shell, "renderVersionedMacAppIcon", "the Mac shell builder paints a versioned AppIcon");
test.assertIncludes(shell, "packageVersion", "the painted label is the release version");
test.assert(
  INTERNATIONAL_ORANGE.toUpperCase() === "#FF4F00",
  "the badge uses Federal Standard International Orange",
);
test.assert(
  versionLabelForSize("1.0.56", 32) === ""
    && versionLabelForSize("1.0.56", 64) === "56"
    && versionLabelForSize("1.0.56", 128) === "1.0.56"
    && versionLabelForSize("1.0.56", 512) === "1.0.56",
  "tiny tiers keep the orange band only; 64 shows the patch; 128+ shows the full version",
);
test.assert(
  MAC_APP_ICONSET_SIZES.some(([name, size]) => name === "icon_512x512@2x.png" && size === 1024),
  "the iconset still covers the full Apple icns ladder through 1024",
);

const png = renderVersionedMacAppIcon({
  sourcePath: iconSource,
  version: "1.0.56",
  size: 256,
});
const image = await loadImage(png);
const canvas = createCanvas(256, 256);
const ctx = canvas.getContext("2d");
ctx.drawImage(image, 0, 0);
const band = ctx.getImageData(0, 220, 256, 36).data;
let orangePixels = 0;
for (let i = 0; i < band.length; i += 4) {
  const r = band[i];
  const g = band[i + 1];
  const b = band[i + 2];
  // International Orange vicinity — allow anti-aliasing around the white glyphs.
  if (r > 200 && g < 120 && b < 80) orangePixels += 1;
}
test.assert(orangePixels > 800, `the 256 px icon carries an International Orange band (${orangePixels} orange pixels)`);

test.finish();
