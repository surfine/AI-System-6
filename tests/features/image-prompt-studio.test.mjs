// Image Prompt Studio: the shared runtime builds a two-style image prompt and
// parses the model reply back into GPT-Image and universal sections. The
// studio window is wired as a lazy application, and Cover Glass no longer owns
// the BYOK image generator.

import { createRequire } from "node:module";
import { createFeatureTest, read, windowApp } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("image-prompt-studio");

const runtime = require("../../apps/desktop/app/features/image-prompt-runtime.js");

{
  const messages = runtime.buildImagePromptMessages({
    idea: "calm tech blue, cinematic",
    title: "The Shape of Quiet",
    aspect: "3:4",
  });
  const system = messages.find((m) => m.role === "system")?.content || "";
  const user = messages.find((m) => m.role === "user")?.content || "";
  test.assert(messages.length === 2, "runtime returns system and user messages");
  test.assert(system.includes("## GPT-Image") && system.includes("## 通用"), "system instructs both output sections");
  test.assert(user.includes("calm tech blue") && user.includes("The Shape of Quiet") && user.includes("3:4"), "user message carries idea, title, and aspect");

  const backgroundMessages = runtime.buildImagePromptMessages({ idea: "tech blue", background: true });
  const backgroundSystem = backgroundMessages.find((m) => m.role === "system")?.content || "";
  test.assert(backgroundSystem.includes("NEGATIVE SPACE"), "background mode reserves clean negative space for an overlaid title");
}

{
  const reply = [
    "## GPT-Image",
    "A calm, cinematic tech-blue scene with generous negative space.",
    "",
    "## 通用",
    "Subject: quiet minimal desk",
    "Style: cinematic, high-fidelity",
    "Lighting: soft key light",
    "Composition: wide shot",
    "Negative: text, logos, watermarks",
    "Aspect ratio: 3:4",
  ].join("\n");
  const parsed = runtime.parseImagePromptResult(reply);
  test.assert(parsed.gptImage.includes("calm, cinematic tech-blue"), "GPT-Image section is extracted");
  test.assert(parsed.universal.includes("Subject:") && parsed.universal.includes("Aspect ratio: 3:4"), "universal structured section is extracted");
  test.assert(runtime.parseImagePromptResult("no sections").gptImage === "", "missing sections parse empty");
}

{
  const studio = read("app/features/image-prompt-studio.js");
  const cover = read("app/features/liquid-cover.js");
  const actions = read("app/core/actions.js");
  const windowManager = read("app/core/window-manager.js");
  const chatMessages = read("app/core/chat-messages.js");
  const sideAskPad = read("app/features/sideask-pad.js");
  const multiFinder = read("app/core/multi-finder.js");
  const en = read("app/data/translations-en.js");
  const zh = read("app/data/translations-zh.js");
  test.assert(studio.includes('windowName: "imagePromptStudio"'), "the studio registers its window");
  test.assert(studio.includes('"open-image-prompt-studio"'), "the studio registers its open command");
  test.assert(studio.includes("canUseReferenceImage"), "the studio checks whether the current model can read images");
  test.assert(studio.includes("ips_ref_unavailable_cloud"), "the studio disables reference images on text-only cloud models");
  test.assert(read("app/core/app-admissions.js").includes('"open-image-prompt-studio"'), "the lazy open command is admitted through the shared table");
  test.assert(!cover.includes("image.generate"), "Cover Glass no longer calls the BYOK image proxy");
  test.assert(!cover.includes("generateBg"), "Cover Glass no longer owns in-app image generation");
  test.assert(studio.includes('id="ips-sideask"'), "the studio exposes a SideAsk entry");
  test.assert(studio.includes('arrangeWindowAssistantSplit("imagePromptStudio")'), "the studio opens SideAsk against itself");
  test.assert(studio.includes("wiredWindow"), "the studio does not re-bind listeners on restore");
  test.assert(windowApp("imagePromptStudio") === "imagePromptStudio", "the studio has its own app id instead of falling back to Finder");
  test.assert(read("app/core/app-admissions.js").includes('multiFinder: "Image Prompt Studio"'), "the studio has a MultiFinder app label in the admission table");
  test.assert(windowApp("imagePromptStudio") === "imagePromptStudio", "window manager maps the studio to its SideAsk source window");
  test.assert(windowManager.includes('if (appId === "imagePromptStudio") return t("image_prompt_studio_label")'), "SideAsk source chrome names the studio");
  test.assert(chatMessages.includes('anchor === "imagePromptStudio"'), "SideAsk context knows the studio anchor");
  test.assert(chatMessages.includes('studio.querySelector("#ips-gpt-out")'), "SideAsk reads the generated GPT-Image prompt");
  test.assert(chatMessages.includes('studio.querySelector("#ips-universal-out")'), "SideAsk reads the generated universal prompt");
  test.assert(sideAskPad.includes('"imagePromptStudio"'), "the Apple menu SideAsk pad can pair with the studio");
  test.assert(sideAskPad.includes('front.dataset.window === "imagePromptStudio"'), "the SideAsk pad extracts the studio context explicitly");
  test.assert(en.includes("ips_sideask:"), "English SideAsk label exists");
  test.assert(zh.includes("ips_sideask:"), "Chinese SideAsk label exists");
  test.assert(en.includes("ips_ref_unavailable_cloud:"), "English text-only cloud reference warning exists");
  test.assert(zh.includes("ips_ref_unavailable_cloud:"), "Chinese text-only cloud reference warning exists");
}

{
  // The window has a stylesheet, and the loader asks for it.
  //
  // It shipped without one. Nothing in the repository matched
  // `.image-prompt-studio-window` or any `.ips-` class, so the window computed
  // to 0 pixels wide: the menu bar showed the application in front and the desk
  // stayed empty. Every feature contract above stayed green through all of it,
  // because they execute the runtime rather than open the window.
  const sheet = read("styles/95-image-prompt-studio.css");
  test.assert(
    /\.image-prompt-studio-window\s*\{[^}]*\bwidth\s*:/.test(sheet),
    "the window class carries a width, so the window has a box of its own",
  );
  test.assert(
    sheet.includes("var(--ips-window-width)") && sheet.includes("var(--ips-window-height)"),
    "and takes it from the shared window-size tokens rather than a literal",
  );

  const foundation = read("styles/00-foundation.css");
  for (const token of ["--ips-window-width", "--ips-window-height"]) {
    test.assert(
      foundation.includes(`${token}:`),
      `${token} is defined in the single token source (an undefined var() takes the initial value, it does not fall back)`,
    );
  }

  test.assert(
    read("app/core/config.js").includes('"styles.image-prompt-studio.css"'),
    "the lazy loader requests the sheet alongside the module, so opening the window brings its layout",
  );
  test.assert(
    windowApp("imagePromptStudio") === "imagePromptStudio",
    "and the window is still registered to its own application",
  );
}

{
  // The window is two halves and a drawer, run for real.
  //
  // The stacked version was three identical framed groups: the half you fill
  // in and the half you get back wore the same clothes, a picked reference
  // image left only a status line behind, "Copied" appeared at the far end of
  // the window, a running request could not be stopped, and "Written before"
  // gave back only the idea. These checks run the module against a DOM and
  // drive it the way the writer does, rather than reading its source.
  let parseHTML;
  try {
    ({ parseHTML } = await import("linkedom"));
  } catch {
    test.fail("linkedom is needed to run the studio against a real DOM");
    test.finish();
  }
  const vm = await import("node:vm");
  const { document, window: dom } = parseHTML('<html><body><div class="desktop"></div></body></html>');

  // linkedom has no radio state; this is the browser's: a property that
  // unchecks its named siblings when set.
  const checkedState = new WeakMap();
  Object.defineProperty(dom.HTMLInputElement.prototype, "checked", {
    configurable: true,
    get() { return checkedState.has(this) ? checkedState.get(this) : this.hasAttribute("checked"); },
    set(value) {
      if (value && this.getAttribute("type") === "radio") {
        document.querySelectorAll(`input[name="${this.getAttribute("name")}"]`).forEach((other) => checkedState.set(other, false));
      }
      checkedState.set(this, Boolean(value));
    },
  });

  const store = new Map();
  const pending = [];
  const statusKeys = [];
  const ctx = {
    document,
    console: { error() {}, log() {} },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout: () => 0,
    clearTimeout: () => {},
    AbortController,
    currentLanguage: "en",
    t: (key) => { statusKeys.push(key); return key; },
    applyLanguage: () => {},
    currentModelSupportsImageInputs: () => true,
    fetchModelPayload: () => {},
    openTransientFilePicker: () => {},
    clioVisionImageFilesFromList: (files) => [...files].map((file) => ({ file, type: "image" })),
    CLIO_IMAGE_MAX_SOURCE_BYTES: 10_000_000,
    CLIO_IMAGE_ACCEPT: "image/*",
    prepareClioImageInline: async () => ({ inlineDataUrl: "data:image/png;base64,AAAA" }),
    // Each call parks until the test settles it, and honours its signal the
    // way the real model layer does.
    sendLocalModelTask: ({ payload, signal }) => new Promise((resolve, reject) => {
      const call = { payload, resolve, reject };
      pending.push(call);
      signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
    AISystem6ImagePromptRuntime: runtime,
    AISystem6ApplicationShell: {
      createWindow(options) {
        const win = document.createElement("section");
        win.className = `window ${options.windowClass}`;
        win.dataset.window = options.windowName;
        win.innerHTML = `<div class="details-bar">${options.statusHtml}</div><div class="window-pane ${options.paneClass}">${options.paneHtml}</div>`;
        document.querySelector(".desktop").append(win);
        return win;
      },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("app/features/image-prompt-studio.js"), ctx);
  ctx.AISystem6ImagePromptStudio.render();

  const $ = (id) => document.getElementById(id);
  const click = (el) => el.dispatchEvent(new dom.Event("click", { bubbles: true }));
  const change = (el) => el.dispatchEvent(new dom.Event("change", { bubbles: true }));
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const reply = (gpt, universal) => `## GPT-Image\n${gpt}\n\n## 通用\n${universal}`;

  // Aspect: five drawn choices in one native radio group, and the plate
  // follows the one chosen.
  const aspects = [...document.querySelectorAll('input[name="ips-aspect"]')];
  test.assert(
    aspects.map((input) => input.getAttribute("value")).join(" ") === "16:9 4:3 1:1 3:4 9:16",
    "the aspect choice is one radio group of the five ratios, so it keeps one tab stop and arrow keys",
  );
  test.assert(aspects.every((input) => input.nextElementSibling?.dataset.ratio === input.getAttribute("value")), "each ratio is drawn beside its radio");
  const portrait = aspects.find((input) => input.getAttribute("value") === "9:16");
  portrait.checked = true;
  change(portrait);
  test.assert($("ips-plate").dataset.ratio === "9:16", "choosing a ratio reshapes the plate");

  // Reference: attached is visible, and Remove takes it back off the request.
  const well = $("ips-well");
  const drop = new dom.Event("drop", { cancelable: true });
  drop.dataTransfer = { types: ["Files"], files: [{ name: "bookshop-rain.jpg", size: 1000 }] };
  well.dispatchEvent(drop);
  await settle();
  test.assert(!$("ips-well-thumb").hidden && !$("ips-ref-remove").hidden, "a dropped image shows its thumbnail and a Remove button");
  test.assert($("ips-well-text").textContent === "bookshop-rain.jpg", "and names the file, not a hint");
  click($("ips-ref-remove"));
  test.assert($("ips-well-thumb").hidden && $("ips-ref-remove").hidden && !$("ips-ref").hidden, "Remove clears the well back to its Choose button");

  // Write: the removed image does not ride along, the prompts land, and the
  // universal lines read as a list while the raw text stays copyable.
  $("ips-idea").value = "rain at an old bookshop";
  click($("ips-go"));
  test.assert(pending.length === 1, "Write Prompt calls the model once");
  test.assert(typeof pending[0].payload.messages.find((m) => m.role === "user").content === "string", "a removed reference image is not sent");
  test.assert($("ips-go").disabled && !$("ips-cancel").hidden, "while writing, the default button is off and Cancel is offered");
  pending[0].resolve({ text: reply("A quiet photograph.", "Subject: bookshop\nStyle: editorial\nAspect ratio: 9:16") });
  await settle();
  test.assert($("ips-gpt-out").value === "A quiet photograph.", "the GPT-Image prompt lands in its field");
  test.assert($("ips-universal-out").value.includes("Subject: bookshop"), "the raw universal text stays in a field for Copy and SideAsk");
  test.assert(
    [...$("ips-universal-view").querySelectorAll("dt")].map((dt) => dt.textContent).join("|") === "Subject|Style|Aspect ratio",
    "and its lines read as a label/value list",
  );
  test.assert(!$("ips-go").disabled && $("ips-cancel").hidden, "the window is ready again once the prompts arrive");

  // Copy confirms on the button the eye is on.
  const copyGpt = $("ips-copy-gpt");
  click(copyGpt);
  await settle();
  test.assert(copyGpt.textContent === "ips_copied_button", "Copy says it copied on the button itself");

  // Cancel stops the run and leaves the previous prompts alone.
  click($("ips-go"));
  test.assert(pending.length === 2, "a second write starts");
  click($("ips-cancel"));
  await settle();
  test.assert(statusKeys.at(-1) === "ips_cancelled", "Cancel reports that it stopped");
  test.assert($("ips-gpt-out").value === "A quiet photograph.", "a cancelled run keeps the prompts that were there");
  test.assert(!$("ips-go").disabled && $("ips-cancel").hidden, "and gives the default button back");

  // History brings back the whole set, and an entry from before the prompts
  // were kept brings back what it has without blanking the fields.
  const saved = JSON.parse(store.get("aiSystem6.imagePromptStudio.history"));
  test.assert(saved.length === 1 && saved[0].gptImage === "A quiet photograph." && saved[0].aspect === "9:16", "history keeps the prompts and the ratio with the idea");
  // An entry in the older shape, as a browser that used the stacked window
  // still holds it. The next finished write re-reads the list.
  store.set("aiSystem6.imagePromptStudio.history", JSON.stringify([...saved, { idea: "an old idea", aspect: "1:1", at: 1 }]));
  $("ips-gpt-out").value = "";
  $("ips-idea").value = "";
  aspects[0].checked = true;
  const rows = () => [...document.querySelectorAll(".ips-history-item")];
  click($("ips-go"));
  test.assert(pending.length === 2, "an empty idea does not call the model");
  $("ips-idea").value = "fresh";
  click($("ips-go"));
  pending[2].resolve({ text: reply("Second.", "Subject: second") });
  await settle();
  test.assert(rows().length === 3, "every saved write is listed");
  click(rows()[1]);
  test.assert($("ips-gpt-out").value === "A quiet photograph." && $("ips-idea").value === "rain at an old bookshop", "a row brings back its idea and its prompts");
  test.assert(selectedValueOf(aspects) === "9:16", "and its ratio");
  click(rows()[2]);
  test.assert($("ips-idea").value === "an old idea" && $("ips-gpt-out").value === "A quiet photograph.", "an old idea-only row leaves the prompts alone");

  function selectedValueOf(inputs) {
    return inputs.find((input) => input.checked)?.getAttribute("value");
  }

  // Source facts a DOM cannot show: the language sweep reaches both legends,
  // and SideAsk sits left of the spacer with the default button last.
  const source = read("app/features/image-prompt-studio.js");
  for (const key of ["ips_group_input", "ips_group_output", "ips_history"]) {
    test.assert(source.includes(`data-i18n="${key}"`), `the ${key} heading carries a key the language sweep can reach`);
  }
  const order = ['id="ips-sideask"', 'class="spacer"', 'id="ips-cancel"', 'id="ips-go"'].map((needle) => source.indexOf(needle));
  test.assert(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), "SideAsk, the spacer, Cancel, then the default button last");
  test.assert(/empty\.dataset\.i18n = "ips_history_empty"/.test(source), "the history empty row carries its key, so switching language reaches it");
  test.assert(
    read("styles/95-image-prompt-studio.css").includes(".ips-outputs-group:not(.is-filled) > .ips-outputs"),
    "the stylesheet hides the outputs until there is something in them",
  );

  const en = read("app/data/translations-en.js");
  const zh = read("app/data/translations-zh.js");
  for (const key of ["ips_group_input", "ips_group_output", "ips_output_empty", "ips_ref_label", "ips_ref_drop", "ips_ref_choose", "ips_ref_remove", "ips_cancel", "ips_cancelled", "ips_copied_button", "ips_history_restored", "ips_history_restored_idea", "ips_gpt_kind", "ips_universal_kind", "ips_plate_with_ref", "ips_ref_drop_here", "ips_ref_removed"]) {
    test.assert(en.includes(`${key}:`), `${key} exists in English`);
    test.assert(zh.includes(`${key}:`), `${key} exists in Chinese`);
  }
}

test.finish();
