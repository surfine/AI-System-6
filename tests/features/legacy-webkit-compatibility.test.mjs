// macOS 11.2.3 ships Safari 14.0, which parses neither public class fields
// nor the newer platform helpers used by the desktop state code.

import { runInNewContext } from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("legacy-webkit-compatibility");
const manifest = read("scripts/runtime-manifest.mjs");
const compatibility = read("app/core/legacy-browser-compat.js");
const config = read("app/core/config.js");
const desktopRuntime = read("app/core/desktop-runtime.js");
const backportBuild = read("scripts/build-legacy-webkit-bundle.mjs");
const packageManifest = read("package.json");
const legacyStyles = read("styles/95-legacy-webkit.css");
const marked = read("app/vendor/marked.umd.js");

function createDialogFallbackHarness() {
  const formListeners = {};
  const attributes = new Map();
  const button = { value: "cancel" };
  const form = {
    addEventListener(type, listener) {
      formListeners[type] = listener;
    },
    querySelector() {
      return button;
    },
  };
  button.form = form;

  const dialog = {
    dataset: {},
    hidden: false,
    returnValue: "",
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    querySelector(selector) {
      return selector === "form[method='dialog']" ? form : null;
    },
    dispatchEvent(event) {
      if (typeof this.onclose === "function") this.onclose(event);
      return true;
    },
  };

  return { dialog, formListeners, button };
}

function runDialogFallbackHarness() {
  const harness = createDialogFallbackHarness();
  function FakeElement() {
    this.children = [];
  }
  Object.defineProperty(FakeElement.prototype, "firstChild", {
    get() {
      return this.children[0] || null;
    },
  });
  FakeElement.prototype.removeChild = function removeChild(child) {
    this.children.splice(this.children.indexOf(child), 1);
    return child;
  };
  FakeElement.prototype.appendChild = function appendChild(child) {
    this.children.push(child);
    return child;
  };
  const sandbox = {
    Element: FakeElement,
    crypto: {
      getRandomValues(bytes) {
        return bytes;
      },
    },
    document: {
      activeElement: null,
      documentElement: {
        classList: {
          add() {},
        },
      },
      querySelectorAll() {
        return [harness.dialog];
      },
      createEvent() {
        return {
          initEvent(type) {
            this.type = type;
          },
        };
      },
      createTextNode(value) {
        return { nodeType: 3, value };
      },
    },
  };
  sandbox.globalThis = sandbox;
  runInNewContext(compatibility, sandbox);
  return { ...harness, FakeElement };
}

test.assertMatches(
  manifest,
  /appModulePaths\s*=\s*\[\s*"app\/core\/legacy-browser-compat\.js"/,
  "Legacy browser compatibility shims load before application modules"
);
test.assertIncludes(compatibility, "Array.prototype.at", "Array.at has a Safari 14 fallback");
test.assertIncludes(compatibility, "crypto.randomUUID", "randomUUID has a Safari 14 fallback");
test.assertIncludes(compatibility, "structuredClone", "structuredClone has a Safari 14 fallback");
test.assertIncludes(compatibility, "replaceChildren", "Element.replaceChildren has a Safari 14 fallback");
test.assertIncludes(compatibility, "AISystem6LegacyWebKit", "Legacy WebKit is exposed to runtime loaders");
test.assertIncludes(compatibility, "ResizeObserver", "Legacy layout fallbacks react to window and component resizing");
test.assertIncludes(compatibility, "syncContainerFallbacks", "Container-query breakpoints have a legacy layout fallback");
test.assertIncludes(compatibility, "syncHasFallbacks", "Parent-state selectors have a legacy class fallback");
test.assertIncludes(compatibility, "is-legacy-keyboard-nav", "Keyboard focus is preserved without :focus-visible");
test.assert(!compatibility.includes('querySelectorAll("*")'), "Legacy compatibility never scans every layout node");
test.assert(!compatibility.includes("is-legacy-flex-gap"), "Legacy compatibility never writes generic flex-gap margins");
test.assertIncludes(compatibility, "HTMLDialogElement", "Dialog support is detected before using native modal APIs");
test.assertIncludes(compatibility, 'querySelectorAll("dialog")', "Safari 14 initializes every dialog with the fallback");
test.assertIncludes(compatibility, "dialog.hidden = true", "Fallback dialogs are hidden until explicitly opened");
test.assertIncludes(compatibility, "dialog.showModal", "Fallback dialogs expose showModal");
test.assertIncludes(compatibility, "dialog.close", "Fallback dialogs expose close");
test.assertIncludes(compatibility, "form[method='dialog']", "Fallback handles dialog forms locally");
test.assertIncludes(compatibility, "event.preventDefault()", "Fallback prevents dialog cancellation from submitting the page");

const dialogHarness = runDialogFallbackHarness();
test.assert(dialogHarness.dialog.hidden === true, "Unsupported dialogs are hidden on initial load");
dialogHarness.dialog.showModal();
test.assert(dialogHarness.dialog.open === true && dialogHarness.dialog.hidden === false, "Fallback showModal opens a hidden dialog");
let cancelPrevented = false;
dialogHarness.formListeners.click({
  target: { closest: () => dialogHarness.button },
  preventDefault() {
    cancelPrevented = true;
  },
});
test.assert(cancelPrevented, "Fallback Cancel prevents the form's default navigation");
test.assert(
  dialogHarness.dialog.hidden === true && dialogHarness.dialog.returnValue === "cancel",
  "Fallback Cancel closes the dialog with a cancel result"
);
const replacementTarget = new dialogHarness.FakeElement();
replacementTarget.appendChild({ nodeType: 1, value: "old" });
replacementTarget.replaceChildren("new", { nodeType: 1, value: "node" });
test.assert(
  replacementTarget.children.length === 2
    && replacementTarget.children[0].value === "new"
    && replacementTarget.children[1].value === "node",
  "Fallback replaceChildren replaces legacy DOM content without native support"
);
test.assertIncludes(config, "resolveClassicScriptSource", "Lazy loader selects a legacy script copy on old WebKit");
test.assertIncludes(config, "app/legacy/", "Lazy loader resolves transformed legacy script paths");
test.assertIncludes(backportBuild, "lazySourcePaths", "DTK build backports lazy feature scripts");
test.assertIncludes(backportBuild, 'join(root, "app", "legacy"', "DTK build writes legacy scripts outside the normal runtime paths");
test.assertIncludes(legacyStyles, ".is-legacy-webkit .memory-card", "Legacy stylesheet restores Memory Cards dimensions");
test.assertIncludes(legacyStyles, ".is-legacy-webkit .puzzle-board", "Legacy stylesheet restores puzzle grid rows");
test.assertIncludes(legacyStyles, ".is-legacy-webkit .clio-stage-slide-frame", "Legacy stylesheet restores ClioStage slide proportions");
test.assertIncludes(legacyStyles, ".is-legacy-webkit .boot-screen", "Legacy stylesheet gives the boot layer explicit viewport edges");
test.assertIncludes(legacyStyles, ".is-legacy-webkit .shutdown-screen", "Legacy stylesheet gives shutdown and modal layers explicit viewport edges");
test.assertIncludes(legacyStyles, ".is-legacy-over-760 .tdi-shell", "Legacy stylesheet restores wide TDI container layouts");
test.assertIncludes(legacyStyles, ".is-legacy-has-hidden-tabs", "Legacy stylesheet restores :has-driven hidden tab rails");
test.assertIncludes(legacyStyles, ".is-legacy-has-add-layer", "Legacy stylesheet restores Cover Glass parent-state layouts");
test.assertIncludes(legacyStyles, ".is-legacy-liquid-glass", "Legacy stylesheet restores Liquid Glass root scrollbar state");
test.assertNotIncludes(legacyStyles, ".is-legacy-endfield-open", "Endfield no longer styles root scrollbars in legacy WebKit");
test.assertNotIncludes(compatibility, "is-legacy-endfield-open", "Legacy runtime no longer toggles an Endfield root scrollbar state");
test.assertIncludes(legacyStyles, ".is-legacy-keyboard-nav .btn:focus", "Legacy stylesheet restores keyboard focus without :focus-visible");
test.assert(!legacyStyles.includes("is-legacy-flex-gap"), "Legacy stylesheet leaves menu-bar flex ownership untouched");
test.assertIncludes(desktopRuntime, "async function runBootSequence()", "Legacy boot layer keeps the normal startup animation lifecycle");
test.assertIncludes(backportBuild, 'target: ["safari13"]', "DTK build backports the startup bundle to Safari 13 syntax");
test.assertMatches(
  packageManifest,
  /"prebundle:mac-x64":\s*"[^"]*build:legacy-webkit/,
  "Intel packaging backports the startup bundle for Monterey WebKit"
);
test.assertIncludes(packageManifest, '"bundle:mac-intel-app"', "Intel app packaging is a first-class release command");
test.assertIncludes(marked, "marked v4.3.0", "Startup Markdown parser targets legacy WebKit");
test.assert(
  !/class\s+[A-Za-z_$][\w$]*\s*\{\s*[A-Za-z_$][\w$]*\s*;/.test(marked),
  "Startup Markdown parser contains no public class fields"
);

test.finish();
