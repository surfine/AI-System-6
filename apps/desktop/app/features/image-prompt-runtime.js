// Pure image-prompt writing runtime shared by Cover Glass and Image Prompt
// Studio. No DOM, network, or storage dependencies; the model call happens in
// the caller through the unified model layer.
(function () {
  "use strict";

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function extractSection(source, heading) {
    const pattern = new RegExp(
      "##\\s*" + escapeRegExp(heading) + "[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)",
      "i"
    );
    const match = String(source || "").match(pattern);
    return (match ? match[1] : "").trim();
  }

  /**
   * Build the guardrailed messages for a ready-to-paste image-generation prompt.
   * The model must return exactly two sections: GPT-Image (natural-language
   * paragraph) and 通用 (compact structured prompt).
   */
  function buildImagePromptMessages(options = {}) {
    const idea = text(options.idea);
    const title = text(options.title);
    const aspect = text(options.aspect) || "16:9";
    const background = options.background === true;
    const styleHint = String(options.style || "default").toLowerCase() === "photographic"
      ? "photorealistic, editorial product photography"
      : "polished, high-fidelity, visually striking";

    const system = [
      "You write professional, ready-to-paste image-generation prompts.",
      "Output exactly two sections and nothing else, with exactly these headings:",
      "## GPT-Image",
      "## 通用",
      "For GPT-Image, write ONE natural-language paragraph (not comma tag-soup): lead with purpose, then subject, composition, lighting/color, medium, and aspect ratio. Fold any exclusions into a Constraints sentence inside that same paragraph.",
      "For 通用, output a compact structured prompt with exactly these lines:",
      "Subject:",
      "Style:",
      "Lighting:",
      "Composition:",
      "Negative:",
      "Aspect ratio:",
      background ? "This is a BACKGROUND image for a video-cover / title card. The composition MUST keep generous, clean, low-contrast NEGATIVE SPACE where a glass title sits later; push richer detail toward the edges and do not render the title text." : "",
      "Be concrete and specific. Do not explain, do not add commentary, and do not render any supplied title text.",
    ].filter(Boolean).join("\n");

    const user = [
      "Idea / brief: " + (idea || "(not provided)"),
      title ? "Title or text that may sit on top (describe the scene around it, do NOT render the text): " + title : "",
      "Aspect ratio: " + aspect,
      "Style direction: " + styleHint,
    ].filter(Boolean).join("\n");

    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }

  /**
   * Split a model reply back into its two prompt strings.
   * @returns {{ gptImage: string, universal: string }}
   */
  function parseImagePromptResult(output) {
    return {
      gptImage: extractSection(output, "GPT-Image"),
      universal: extractSection(output, "通用"),
    };
  }

  const api = Object.freeze({ buildImagePromptMessages, parseImagePromptResult });
  if (typeof window !== "undefined") window.AISystem6ImagePromptRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
