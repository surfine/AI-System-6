window.AISystem6LaunchIntent = {
  parse(search) {
    const appearances = "classic platinum aqua snow-leopard yosemite liquid-glass".split(" ");
    const commands = {
      micropolis: "open-micropolis",
      teachtext: "open-teachtext",
      reader: "open-reader",
      scrapbook: "open-scrapbook",
      soundscape: "open-soundscape",
    };
    const param = (name) => {
      const match = String(search || "").match(new RegExp(`[?&]${name}=([^&#]+)`, "i"));
      return String(match ? match[1] : "").toLowerCase();
    };
    const open = param("open");
    const appearance = param("appearance");
    const tour = param("tour");
    return {
      open: commands[open] ? { name: open, command: commands[open] } : null,
      appearance: appearances.includes(appearance) ? appearance : "",
      tour: tour === "writing" ? "writing" : "",
    };
  },
};
window.AISystem6LaunchIntentLoaded = true;
