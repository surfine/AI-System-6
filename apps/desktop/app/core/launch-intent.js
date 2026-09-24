window.AISystem6LaunchIntent = {
  parse(search) {
    const appearances = (window.AISystem6Theme?.themes || []).map(({ id }) => id);
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
      // The quiz. A link shared into a group chat is the whole point of it,
      // so this route lands on the challenge rather than the card shelf, and
      // a `set` beside it opens that exact ten.
      "one-more-tune": { command: "open-one-more-tune", window: "oneMoreTune" },
      // A shared Project Hard Disk. The window it stops on is TeachText,
      // because the manuscript is what such a link is shared for, and it opens
      // in the Writing view: the disk is a finished trip along the writing
      // route, and only that view shows the route it was written on.
      dtk: { command: "open-shared-disk-dtk", window: "teachText", profile: "writing" },
      ipad1: { command: "open-shared-disk-ipad1", window: "teachText", profile: "writing" },
      m5ipad: { command: "open-shared-disk-m5ipad", window: "teachText", profile: "writing" },
      iphone17e: { command: "open-shared-disk-iphone17e", window: "teachText", profile: "writing" },
      bongo: { command: "open-shared-disk-bongo", window: "teachText", profile: "writing" },
      glass: { command: "open-shared-disk-glass", window: "teachText", profile: "writing" },
      ipad97: { command: "open-shared-disk-ipad97", window: "teachText", profile: "writing" },
      airbattery: { command: "open-shared-disk-airbattery", window: "teachText", profile: "writing" },
      pm17: { command: "open-shared-disk-pm17", window: "teachText", profile: "writing" },
      sympathy: { command: "open-shared-disk-sympathy", window: "teachText", profile: "writing" },
      ceramic: { command: "open-shared-disk-ceramic", window: "teachText", profile: "writing" },
      macpro19: { command: "open-shared-disk-macpro19", window: "teachText", profile: "writing" },
      pocket: { command: "open-shared-disk-pocket", window: "teachText", profile: "writing" },
      iphone6sp: { command: "open-shared-disk-iphone6sp", window: "teachText", profile: "writing" },
      sleeve: { command: "open-shared-disk-sleeve", window: "teachText", profile: "writing" },
      pm12: { command: "open-shared-disk-pm12", window: "teachText", profile: "writing" },
      pm11: { command: "open-shared-disk-pm11", window: "teachText", profile: "writing" },
      m5mba: { command: "open-shared-disk-m5mba", window: "teachText", profile: "writing" },
      mbneo: { command: "open-shared-disk-mbneo", window: "teachText", profile: "writing" },
      mini7: { command: "open-shared-disk-mini7", window: "teachText", profile: "writing" },
      mkb: { command: "open-shared-disk-mkb", window: "teachText", profile: "writing" },
      sd: { command: "open-shared-disk-sd", window: "teachText", profile: "writing" },
      ios19: { command: "open-shared-disk-ios19", window: "teachText", profile: "writing" },
      ipada4: { command: "open-shared-disk-ipada4", window: "teachText", profile: "writing" },
      ip16p: { command: "open-shared-disk-ip16p", window: "teachText", profile: "writing" },
      mgscrap: { command: "open-shared-disk-mgscrap", window: "teachText", profile: "writing" },
      t2nic: { command: "open-shared-disk-t2nic", window: "teachText", profile: "writing" },
      airtrans: { command: "open-shared-disk-airtrans", window: "teachText", profile: "writing" },
      ip4sdemo: { command: "open-shared-disk-ip4sdemo", window: "teachText", profile: "writing" },
      airact: { command: "open-shared-disk-airact", window: "teachText", profile: "writing" },
      touch2: { command: "open-shared-disk-touch2", window: "teachText", profile: "writing" },
      noport: { command: "open-shared-disk-noport", window: "teachText", profile: "writing" },
      cdma4: { command: "open-shared-disk-cdma4", window: "teachText", profile: "writing" },
      iphone17: { command: "open-shared-disk-iphone17", window: "teachText", profile: "writing" },
      windowshade: { command: "open-shared-disk-windowshade", window: "teachText", profile: "writing" },
    };
    const param = (name) => {
      const match = String(search || "").match(new RegExp(`[?&]${name}=([^&#]+)`, "i"));
      return String(match ? match[1] : "").toLowerCase();
    };
    // A challenge code keeps its case: a legacy set id is base64url, so folding
    // it would hand the round authority an id it has never minted. The shape is
    // OMT.<deckVersion>.<setId> with an optional .<questionIndex>, where a set
    // id is either a number (a numbered set anybody can rebuild from the deck)
    // or a legacy random token. Anything else is dropped rather than passed on
    // to be refused later.
    const rawParam = (name) => {
      const match = String(search || "").match(new RegExp(`[?&]${name}=([^&#]+)`));
      try {
        return decodeURIComponent(String(match ? match[1] : ""));
      } catch {
        return "";
      }
    };
    const set = rawParam("set");
    const open = param("open");
    const launch = param("launch");
    const appearance = param("appearance");
    const tour = param("tour");
    const mode = param("mode");
    return {
      open: commands[open] ? { name: open, command: commands[open] } : null,
      launch: launchCommands[launch]
        ? {
          name: launch,
          command: launchCommands[launch].command,
          window: launchCommands[launch].window,
          profile: launchCommands[launch].profile || "desktop",
          fullscreen: mode === "fullscreen",
        }
        : null,
      appearance: appearances.includes(appearance) ? appearance : "",
      tour: tour === "writing" ? "writing" : "",
      set: /^OMT\.\d{1,4}\.(?:\d{1,6}|[A-Za-z0-9_-]{6,22})(\.\d{1,3})?$/.test(set) ? set : "",
    };
  },
};
window.AISystem6LaunchIntentLoaded = true;
