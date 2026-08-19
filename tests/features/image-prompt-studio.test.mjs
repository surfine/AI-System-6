// Image Prompt Studio: the shared runtime builds a two-style image prompt and
// parses the model reply back into GPT-Image and universal sections. The
// studio window is wired as a lazy application, and Cover Glass no longer owns
// the BYOK image generator.

import { createRequire } from "node:module";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

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
  test.assert(multiFinder.includes("imagePromptStudio: \"imagePromptStudio\""), "the studio has its own app id instead of falling back to Finder");
  test.assert(multiFinder.includes("imagePromptStudio: \"Image Prompt Studio\""), "the studio has a MultiFinder app label");
  test.assert(windowManager.includes('imagePromptStudio: "imagePromptStudio"'), "window manager maps the studio to its SideAsk source window");
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

test.finish();
