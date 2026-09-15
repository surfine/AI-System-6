window.AISystem6LaunchIntent = {
  parse(search) {
    const appearances = "classic platinum aqua snow-leopard yosemite liquid-glass".split(" ");
    const commands = {
      micropolis: "open-micropolis",
      teachtext: "open-teachtext",
      reader: "open-reader",
      scrapbook: "open-scrapbook",
      soundscape: "open-soundscape",
      // PWA Home Screen shortcuts (apps/desktop/assets/app-icon/manifest.json
      // "shortcuts") arrive here: a long-press on the installed icon opens the
      // one surface asked for instead of the desk. Keep these three in step
      // with that file.
      cliotalk: "open-assistant",
      "quick-draft": "open-quick-draft",
      lightroom: "open-lightroom",
    };
    // Standalone launch routes (1.0.52): human-readable route ids that are
    // safe to share in external links. Keep in sync with the server /go
    // redirect table and the macOS aisystem6:// allowlist.
    const launchCommands = {
      "endfield-terminal": { command: "open-endfield-terminal", window: "endfieldTerminal" },
      "bonsai-city": { command: "open-bonsai-city", window: "bonsaiCity" },
      micropolis: { command: "open-micropolis", window: "micropolis" },
      openttd: { command: "open-openttd", window: "openttd" },
      doom: { command: "open-doom", window: "doom" },
      "time-machine": { command: "open-time-machine", window: "timeMachine" },
      "liquid-cover": { command: "open-liquid-cover", window: "liquidCover" },
      "cmf-studio": { command: "open-cmf-studio", window: "cmfStudio" },
      // A shared Project Hard Disk. The window it stops on is TeachText,
      // because the manuscript is what such a link is shared for.
      dtk: { command: "open-shared-disk-dtk", window: "teachText" },
    };
    const param = (name) => {
      const match = String(search || "").match(new RegExp(`[?&]${name}=([^&#]+)`, "i"));
      return String(match ? match[1] : "").toLowerCase();
    };
    const open = param("open");
    const launch = param("launch");
    const appearance = param("appearance");
    const tour = param("tour");
    const mode = param("mode");
    return {
      open: commands[open] ? { name: open, command: commands[open] } : null,
      launch: launchCommands[launch]
        ? { name: launch, command: launchCommands[launch].command, window: launchCommands[launch].window, fullscreen: mode === "fullscreen" }
        : null,
      appearance: appearances.includes(appearance) ? appearance : "",
      tour: tour === "writing" ? "writing" : "",
    };
  },
};
window.AISystem6LaunchIntentLoaded = true;
