// The colour the installed app hands its host to paint chrome with.
//
// `theme-color` paints the band above the page in a standalone window: on iOS 26
// that band is a Liquid Glass strip, and on Android it is the address bar. The
// value has to be OPAQUE — two eras fill their menu bar with 0.9 white, and a
// theme colour carrying an alpha is one browsers drop. Dropped, the host paints
// chrome of its own over whatever is behind it, which is the soft band the owner
// photographed above the menu bar. This runs the shipped module against a fake
// bar and desk, because the arithmetic is the contract.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("web-app-shell-chrome");
const webAppShell = read("app/core/web-app-shell.js");

{
  const chromeFor = ({ barColor, barImage = "none", deskColor }) => {
    const meta = {
      content: "#000000",
      getAttribute(name) { return name === "content" ? this.content : null; },
      setAttribute(name, value) { if (name === "content") this.content = value; },
    };
    const shades = new Map([
      [".menu-bar", { backgroundColor: barColor, backgroundImage: barImage }],
      [".desktop", { backgroundColor: deskColor }],
    ]);
    const document_ = {
      readyState: "complete",
      documentElement: { lang: "en" },
      querySelector(selector) {
        if (selector === "meta[name='theme-color']") return meta;
        return shades.has(selector) ? { selector } : null;
      },
      addEventListener() {},
      querySelectorAll: () => [],
    };
    const sandbox = {
      console,
      document: document_,
      navigator: {},
      location: { protocol: "https:", origin: "https://example.test" },
      setTimeout,
      clearTimeout,
      requestAnimationFrame: (fn) => fn(),
      getComputedStyle: (node) => shades.get(node.selector) || { backgroundColor: "", backgroundImage: "none" },
      addEventListener() {},
    };
    sandbox.window = sandbox;
    vm.runInContext(webAppShell, vm.createContext(sandbox));
    sandbox.AISystem6WebAppShell.syncThemeColorMeta();
    return meta.content;
  };

  test.assert(
    chromeFor({ barColor: "rgb(255, 255, 255)", deskColor: "rgb(182, 182, 182)" }) === "rgb(255, 255, 255)",
    "an opaque bar is handed to the host as it is"
  );
  test.assert(
    chromeFor({ barColor: "rgba(248, 248, 248, 0.9)", deskColor: "rgb(70, 73, 85)" }) === "rgb(230, 231, 232)",
    "and a translucent one is composited over the desk, so the host gets a colour rather than an alpha it drops"
  );
  test.assert(
    chromeFor({ barColor: "rgba(0, 0, 0, 0)", barImage: "repeating-linear-gradient(rgb(250, 250, 250) 0 1px, #ffffff 1px 2px)", deskColor: "rgb(73, 121, 176)" }) === "rgb(250, 250, 250)",
    "a gradient reads from its first stop, the way the bar itself reads at the top edge"
  );
  test.assert(
    !/rgba\(/.test(webAppShell.slice(webAppShell.indexOf("function syncThemeColorMeta"))),
    "and nothing on the path to the meta tag can write an alpha colour at all"
  );
}

test.finish();
