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
  test.assert(actions.includes('registerLazyCommand?.("open-image-prompt-studio"'), "the lazy open command is registered");
  test.assert(!cover.includes("image.generate"), "Cover Glass no longer calls the BYOK image proxy");
  test.assert(!cover.includes("generateBg"), "Cover Glass no longer owns in-app image generation");
  test.assert(studio.includes('id="ips-sideask"'), "the studio exposes a SideAsk entry");
  test.assert(studio.includes('arrangeWindowAssistantSplit("imagePromptStudio")'), "the studio opens SideAsk against itself");
  test.assert(studio.includes("wiredWindow"), "the studio does not re-bind listeners on restore");
  test.assert(windowApp("imagePromptStudio") === "imagePromptStudio", "the studio has its own app id instead of falling back to Finder");
  test.assert(multiFinder.includes("imagePromptStudio: \"Image Prompt Studio\""), "the studio has a MultiFinder app label");
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
  // The window is three framed groups, not one flat column.
  //
  // The first repair gave the window a box and stacked its controls in a single
  // column. That is not what a System 6 window of this kind is: the half you
  // fill in and the half you get back wore the same clothes, and the verb sat
  // between them instead of ending the group it acts on.
  const source = read("app/features/image-prompt-studio.js");

  for (const key of ["ips_group_input", "ips_group_output", "ips_history"]) {
    test.assert(
      source.includes(`data-i18n="${key}"`),
      `the ${key} group carries a legend the language sweep can reach`,
    );
  }
  test.assert(
    (source.match(/class="control-section ips-group/g) || []).length === 3,
    "all three groups are the shared control-section, the same framed box every Control Panel section is",
  );

  // The action row is the shared primitive, and the default button is last:
  // a spacer pushes the two verbs right, and SideAsk - which opens another
  // window rather than producing a prompt - stays at the far left.
  test.assert(
    source.includes('class="button-row ips-actions"') && source.includes('class="spacer"'),
    "the action row is button-row with its spacer rather than a private flex row",
  );
  const sideAsk = source.indexOf('id="ips-sideask"');
  const spacer = source.indexOf('class="spacer"');
  const attach = source.indexOf('id="ips-ref"');
  const go = source.indexOf('id="ips-go"');
  test.assert(
    sideAsk > 0 && sideAsk < spacer && spacer < attach && attach < go,
    "SideAsk, then the spacer, then Attach, then the default button last",
  );

  // Two blank boxes are not a result. The group says so until one exists.
  test.assert(
    source.includes('data-i18n="ips_output_empty"') && source.includes("ips-outputs-group"),
    "the prompts group has an empty state and a group to hang its state on",
  );
  test.assert(
    /function syncOutputState\(\)/.test(source) && source.includes('classList.toggle("is-filled"'),
    "and the state is computed from the textareas rather than assumed",
  );
  test.assert(
    read("styles/95-image-prompt-studio.css").includes(".ips-outputs-group:not(.is-filled) > .ips-outputs"),
    "the stylesheet hides the outputs while that state is off",
  );

  // The empty row is built by JS, so it needs the key as well as the text --
  // without the attribute a Chinese session kept an English line under three
  // Chinese headings.
  test.assert(
    /empty\.dataset\.i18n = "ips_history_empty"/.test(source),
    "the history empty row carries its key, so switching language reaches it",
  );

  const en = read("app/data/translations-en.js");
  const zh = read("app/data/translations-zh.js");
  for (const key of ["ips_group_input", "ips_group_output", "ips_output_empty"]) {
    test.assert(en.includes(`${key}:`), `${key} exists in English`);
    test.assert(zh.includes(`${key}:`), `${key} exists in Chinese`);
  }
}

test.finish();
