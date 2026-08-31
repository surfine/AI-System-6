// Core module: unified 1-bit system icons.

// Loaded before feature modules as a classic script; shares the AI System 6 global scope.



function systemIconEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Transport glyphs are filled 1-bit art on a 32-unit grid using even
// coordinates only, so they stay on the pixel grid when drawn at 16px.
// Both themes share these exact paths; Liquid Glass changes the button
// material around them, never the glyph.
const transportIconPaths = {
  play: `
    <path class="classic-ink" d="M10 6l16 10-16 10z" />
  `,
  pause: `
    <path class="classic-ink" d="M8 6h6v20H8zM18 6h6v20h-6z" />
  `,
  previousTrack: `
    <path class="classic-ink" d="M6 6h4v20H6zM28 6L12 16l16 10z" />
  `,
  nextTrack: `
    <path class="classic-ink" d="M22 6h4v20h-4zM4 6l16 10L4 26z" />
  `,
  shuffleTracks: `
    <path class="classic-ink" d="M2 8h8v2H2zM10 10h2v2h-2zM12 12h2v2h-2zM14 14h2v2h-2zM16 16h2v2h-2zM18 18h2v2h-2zM20 20h4v2h-4z" />
    <path class="classic-ink" d="M2 22h8v2H2zM10 20h2v2h-2zM12 18h2v2h-2zM14 16h2v2h-2zM16 14h2v2h-2zM18 12h2v2h-2zM20 10h4v2h-4z" />
    <path class="classic-ink" d="M24 4l6 5-6 5zM24 18l6 5-6 5z" />
  `,
  repeatTracks: `
    <path class="classic-ink" d="M8 8h14v2H8zM10 22h14v2H10z" />
    <path class="classic-ink" d="M22 4l6 5-6 5zM10 18l-6 5 6 5z" />
  `,
  speaker: `
    <path class="classic-ink" d="M4 12h6v8H4zM10 12l8-8v24l-8-8z" />
    <path class="classic-ink" d="M22 12h2v8h-2zM26 8h2v16h-2z" />
  `,
};

// Exact 32×32 1-bit resources from the bundled System 6.0.8 image, retained as
// historical build evidence and fallback painters. The complete Classic
// runtime family is the smooth external SVG reconstruction loaded below:
// - startup disk: Startup Device, ICN# -4064
// - hard disk: Apple HD SC Setup, ICN# 16646
// - floppy: Finder, ICN# 129
// - empty/full Trash: Finder, ICN# 130 / 134
// Classic Plus can still use these source pixels as fallback evidence. Liquid
// Glass keeps the same semantic ids but supplies its own material family.
const nativeSystem6StartupDiskPath = `
  <path class="classic-ink" d="M1 0h27v1h-27zM28 1h1v1h-1zM17 2h3v1h-3zM29 2h1v1h-1zM30 3h1v1h-1zM16 3h1v5h-1zM20 3h1v5h-1zM17 8h3v1h-3zM7 1h1v9h-1zM23 1h1v9h-1zM8 10h15v1h-15zM5 14h22v1h-22zM13 17h6v1h-6zM12 18h8v1h-8zM12 19h2v2h-2zM18 19h2v2h-2zM17 21h3v1h-3zM16 22h3v1h-3zM15 23h3v1h-3zM15 24h2v2h-2zM15 27h2v2h-2zM0 1h1v30h-1zM31 4h1v27h-1zM4 15h1v16h-1zM27 15h1v16h-1zM0 31h31v1h-31z" />
`;

const nativeSystem6HardDiskPath = `
  <path class="classic-ink" d="M1 18h30v1h-30zM4 25h1v1h-1zM0 19h1v9h-1zM31 19h1v9h-1zM1 28h30v1h-30z" />
`;

const nativeSystem6FinderIconPaths = {
  startupDisk: nativeSystem6StartupDiskPath,
  hardDisk: nativeSystem6HardDiskPath,
  projectDisk: nativeSystem6HardDiskPath,
  fileFloppy: `
    <path class="classic-ink" d="M1 0h28v1h-28zM29 1h1v1h-1zM17 2h3v1h-3zM30 2h1v1h-1zM16 3h1v5h-1zM20 3h1v5h-1zM17 8h3v1h-3zM7 1h1v9h-1zM23 1h1v9h-1zM8 10h15v1h-15zM5 18h22v1h-22zM0 1h1v30h-1zM31 3h1v28h-1zM4 19h1v12h-1zM27 19h1v12h-1zM1 31h30v1h-30z" />
  `,
  trash: `
    <path class="classic-ink" d="M13 0h6v1h-6zM12 1h1v1h-1zM19 1h1v1h-1zM6 2h20v1h-20zM5 3h1v1h-1zM26 3h1v1h-1zM5 4h22v1h-22zM9 7h1v1h-1zM13 7h1v1h-1zM17 7h1v1h-1zM21 7h1v1h-1zM10 8h1v20h-1zM14 8h1v20h-1zM18 8h1v20h-1zM22 8h1v20h-1zM9 28h1v1h-1zM13 28h1v1h-1zM17 28h1v1h-1zM21 28h1v1h-1zM6 5h1v26h-1zM25 5h1v26h-1zM6 31h20v1h-20z" />
  `,
  trashFull: `
    <path class="classic-ink" d="M13 0h6v1h-6zM12 1h1v1h-1zM19 1h1v1h-1zM6 2h20v1h-20zM5 3h1v1h-1zM26 3h1v1h-1zM6 4h20v1h-20zM6 5h1v3h-1zM25 5h1v3h-1zM11 7h1v1h-1zM21 7h1v1h-1zM5 8h1v2h-1zM10 8h1v2h-1zM14 8h1v2h-1zM18 8h1v2h-1zM22 8h1v2h-1zM26 8h1v2h-1zM4 10h1v2h-1zM9 10h1v2h-1zM13 10h1v2h-1zM19 10h1v2h-1zM23 10h1v2h-1zM27 10h1v2h-1zM3 12h1v11h-1zM8 12h1v11h-1zM12 12h1v11h-1zM20 12h1v11h-1zM24 12h1v11h-1zM28 12h1v11h-1zM4 23h1v2h-1zM9 23h1v2h-1zM13 23h1v2h-1zM19 23h1v2h-1zM23 23h1v2h-1zM27 23h1v2h-1zM5 25h1v3h-1zM10 25h1v3h-1zM14 25h1v3h-1zM18 25h1v3h-1zM22 25h1v3h-1zM26 25h1v3h-1zM11 28h1v1h-1zM6 28h1v3h-1zM25 28h1v3h-1zM7 31h18v1h-18z" />
  `,
};

const systemIconPaths = {
  ...transportIconPaths,
  ...nativeSystem6FinderIconPaths,
  cloudModel: `
    <path d="M6 22h20v-4h-3v-4h-4v-2h-6v2h-4v4h-3z" />
  `,
  cloudModelOff: `
    <path d="M6 22h20v-4h-3v-4h-4v-2h-6v2h-4v4h-3z" />
    <path d="M7 27L27 7" />
  `,
  /* Local model: a processor chip — compute that lives on this machine, as
     opposed to the cloudModel server shape. */
  localModel: `
    <path d="M10 10h12v12H10z" />
    <path d="M13 10V5M16 10V5M19 10V5M13 27v-5M16 27v-5M19 27v-5" />
    <path d="M10 13H5M10 16H5M10 19H5M27 13h-5M27 16h-5M27 19h-5" />
    <path d="M14 14h4v4h-4z" />
  `,
  /* Control Strip: the strip object itself — flat anchored end, rounded tab
     end, module dividers, grip tick. */
  controlStrip: `
    <path d="M4 12h20c3 0 4 2 4 4s-1 4-4 4H4z" />
    <path d="M9 12v8M14 12v8M19 12v8" />
    <path d="M24 14v4" />
  `,
  questionSheet: `
    <path d="M8 4h14l4 4v20H8z" />
    <path d="M22 4v6h4" />
    <path d="M15 18c0-3 4-3 4-6 0-2-2-4-5-4-2 0-4 1-5 3" />
    <path d="M15 22v2" />
  `,
  outline: `
    <path d="M8 5h16v22H8z" />
    <path d="M13 10h8M13 16h8M13 22h8" />
    <path d="M11 10h1M11 16h1M11 22h1" />
    <path d="M11 10v12" />
  `,
  sectionDrafts: `
    <path d="M7 8h14v19H7z" />
    <path d="M11 5h14v19" />
    <path d="M11 13h8M11 18h7M11 23h5" />
    <path d="M18 24l7-5 2 3-7 5-4 1z" />
  `,
  manuscript: `
    <path d="M7 5h18v22H7z" />
    <path d="M12 9v15M9 10h14M9 15h14M9 20h10" />
    <path d="M20 23h4v3h-4z" />
  `,
  reviewDesk: `
    <path d="M7 5h16l3 3v20H7z" />
    <path d="M23 5v6h3" />
    <path d="M11 13h9M11 18h7M11 23h5" />
    <path d="M18 24l3 3 7-9" />
    <circle cx="21" cy="21" r="7" />
  `,
  projectDisc: `
    <circle cx="16" cy="15" r="11" />
    <circle cx="16" cy="15" r="3" />
    <path d="M13 25h8v4h-8z" />
    <path d="M11 22h10v7H11zM14 27h4" />
  `,
  // Searcher reads the same object in all six appearances: a lens held over a
  // page. The lone magnifier lost that page and drifted toward a modern
  // "zoom" glyph, so the page carries the identity and the lens stays empty
  // (the check mark belongs to Review Desk).
  searcher: `
    <path d="M4 3h13l5 5v21H4z" />
    <path d="M17 3v6h5" />
    <path class="sys-icon-detail" d="M8 12h6M8 16h4" />
    <circle cx="18" cy="18" r="6.5" />
    <path d="M23 23l6 6" />
  `,
  bureaucracyMeme: `
    <path d="M5 7h22v16H5z" />
    <path d="M8 10h16v10H8z" />
    <path d="M10 22l-2 5M22 22l2 5" />
    <path d="M11 17h10M12 20h8" />
    <circle cx="13" cy="14" r="2" />
    <circle cx="19" cy="14" r="2" />
    <path d="M14 5h4M16 3v4" />
  `,
  endfieldTerminal: `
    <path d="M5 6h22v20H5z" />
    <path d="M8 10h16M8 14h9M8 18h13" />
    <path d="M20 21h4M22 19v4" />
    <path d="M9 22c4-3 9-3 14 0" />
  `,
  reader: `
    <path d="M5 7h10c2 0 3 1 3 3v17c0-2-1-3-3-3H5z" />
    <path d="M27 7H17c-2 0-3 1-3 3v17c0-2 1-3 3-3h10z" />
    <path d="M9 12h5M9 17h5M19 12h5M19 17h5" />
  `,
  timeMachine: `
    <path d="M4 7h24v20H4zM4 12h24" />
    <circle cx="17" cy="19" r="6" />
    <path d="M17 15v4l3 2M9 9h2M14 9h2" />
    <path d="M8 19l-3 3 3 3" />
  `,
  /* DocMap: the document's own headings drawn as a branching map, which is what
     the tool renders — not a geographic map and not a node graph. */
  docMap: `
    <path d="M4 5h13v22H4z" />
    <path d="M7 10h7M7 14h5" />
    <path d="M17 16h5M22 8v16M22 8h4M22 16h4M22 24h4" />
    <rect x="26" y="6" width="4" height="4" />
    <rect x="26" y="14" width="4" height="4" />
    <rect x="26" y="22" width="4" height="4" />
  `,
  clioStage: `
    <path d="M5 7h22v14H5z" />
    <path d="M9 11h14M9 16h10" />
    <path d="M16 21v6M10 27h12" />
    <path d="M22 25l4 3M10 25l-4 3" />
    <path d="M24 10l3 3-3 3" />
  `,
  clioChart: `
    <path d="M9 4v24" />
    <path d="M9 6h17v5H9zM9 22h8v5H9z" />
    <path d="M9 14h12v5H9z" />
    <path d="M3 14l5 2.5L3 19z" />
  `,
  clioProject: `
    <path d="M3 5h10v6H3z" />
    <path d="M3 21h10v6H3z" />
    <path d="M19 13h10v6H19z" />
    <path d="M13 8h3v8M13 24h3v-8M16 16h3" />
    <path d="M16 14l3 2-3 2z" />
  `,
  liquidCover: `
    <path d="M4 6h24v20H4z" />
    <path d="M9 21a5 5 0 0 1 10 0" />
    <path d="M21 9l1.3 2.7 2.7 1.3-2.7 1.3L21 17l-1.3-2.7-2.7-1.3 2.7-1.3z" />
  `,
  cmfStudio: `
    <path d="M9 5h14v22H9z" />
    <path class="sys-icon-detail" d="M11 8h10M11 24h10" />
    <path class="sys-icon-detail" d="M6 10h3M6 15h3M6 20h3M23 12h3M23 18h3" />
    <circle cx="14" cy="13" r="2" />
    <circle cx="18" cy="18" r="2" />
    <path d="M5 27l22-22" />
  `,
  soundscape: `
    <path d="M5 6h22v20H5z" />
    <path d="M8 16h3l2-6 3 12 3-10 2 7h3" />
    <path d="M8 24c3-3 5-3 8 0s5 3 8 0" />
  `,
  // Scrapbook holds curated material, never a notepad. Ruled lines alone read
  // as Note Pad, so the album carries a mounted print like the other five
  // appearances do.
  scrapbook: `
    <path d="M8 5h18v22H8z" />
    <path d="M8 5l-3 3v19h3" />
    <path d="M9 8v16" />
    <path d="M12 9h11v10H12z" />
    <path class="sys-icon-detail" d="M12 19l4-5 3 3 2-3 2 5" />
    <path class="sys-icon-detail" d="M12 23h11" />
  `,
  clipboard: `
    <path d="M8 7h16v21H8zM12 4h8v5h-8z" />
    <path d="M11 13h10M11 18h10M11 23h7" />
  `,
  applications: `
    <path d="M6 6h20v20H6z" />
    <path d="M6 16h20M16 6v20" />
    <rect x="10" y="10" width="3" height="3" />
    <rect x="19" y="10" width="3" height="3" />
    <rect x="10" y="19" width="3" height="3" />
    <rect x="19" y="19" width="3" height="3" />
  `,
  systemFile: `
    <path d="M5 10h22v17H5z" />
    <path d="M11 6h10v4H11zM9 14h14v9H9z" />
    <path d="M12 17h8M12 20h8M15 24h2v3" />
  `,
  finderApp: `
    <path d="M7 5h18v21H7z" />
    <path d="M10 9h12v11H10zM12 23h8M14 26h4" />
    <path d="M13 13h1M18 13h1M13 17c2 2 4 2 6 0" />
  `,
  multiFinderApp: `
    <path d="M4 6h17v15H4zM9 11h19v16H9z" />
    <path d="M4 10h17M9 15h19M13 19h11M13 23h7" />
    <path d="M7 8h1M11 13h1M15 13h1" />
  `,
  daHandler: `
    <path d="M7 9h18v18H7zM11 6h10v3" />
    <path d="M11 14v8h3c3 0 3-8 0-8zM18 22l3-8 3 8M19 19h4" />
  `,
  systemFolder: `
    <path d="M4 11h24v16H4zM7 7h8l3 4H7z" />
    <path d="M11 17h2M19 17h2M12 21c3 2 5 2 8 0" />
  `,
  helpFolder: `
    <path d="M4 11h24v16H4zM7 7h8l3 4H7z" />
    <path d="M14 15c1-2 5-2 5 1 0 2-3 2-3 4M16 23h1" />
  `,
  writingStudio: `
    <path d="M9 4h14v10H9z" />
    <path d="M5 13h22v12H5z" />
    <path d="M4 25h24v3H4z" />
    <path d="M12 8h8M12 11h8" />
    <path d="M9 17h3M15 17h3M21 17h2M9 21h3M15 21h3M21 21h2" />
  `,
  folder: `
    <path d="M4 11h24v16H4z" />
    <path d="M7 7h8l3 4H7z" />
  `,
  documents: `
    <path d="M5 11h22v16H5z" />
    <path d="M8 7h7l3 4H8z" />
    <path d="M12 15h9M12 20h8" />
  `,
  importUtility: `
    <path d="M5 11h22v15H5z" />
    <path d="M12 5h8v10h4l-8 7-8-7h4z" />
  `,
  // System 6 control panels are framed boxes carrying one symbol (see the
  // native cdev resources in the classic evidence sheet). Free-floating
  // sliders are a modern flat-icon idiom. Two square slider handles keep this
  // distinct from \`control\`, which owns three round knobs.
  controlPanel: `
    <path d="M4 5h24v22H4z" />
    <path d="M8 12h16M8 20h16" />
    <rect x="10" y="9" width="4" height="6" />
    <rect x="19" y="17" width="4" height="6" />
  `,
  control: `
    <path d="M5 6h22v21H5z" />
    <path d="M9 10h14M9 16h14M9 22h14" />
    <circle class="classic-ink" cx="12" cy="10" r="2" />
    <circle class="classic-ink" cx="20" cy="16" r="2" />
    <circle class="classic-ink" cx="15" cy="22" r="2" />
  `,
  chooser: `
    <path d="M5 7h22v18H5z" />
    <path d="M9 12h14M9 17h14M9 22h14" />
    <path d="M13 9v16M19 9v16" />
    <rect x="7" y="10" width="5" height="5" />
    <rect x="17" y="15" width="5" height="5" />
  `,
  systemHelp: `
    <path d="M8 5h16v22H8z" />
    <path d="M14 14c0-2 4-2 4-5 0-2-1-3-4-3-2 0-3 1-4 2" />
    <path d="M15 19v2M11 25h10" />
  `,
  dictionary: `
    <path d="M7 5h18v22H7z" />
    <path d="M10 5v22M13 11h8M13 16h7M13 21h8" />
    <path d="M21 5v5h4" />
  `,
  assistant: `
    <path d="M4 5h13v9H4z" />
    <path d="M7 14l-2 4 5-4" />
    <path d="M13 17h16v11H13z" stroke-dasharray="3 2" />
    <path d="M25 28l2 3-6-3" stroke-dasharray="3 2" />
  `,
  teachText: `
    <path d="M8 5h16v22H8z" />
    <path d="M12 9h8M12 14h8M12 19h6" />
    <path d="M16 8v17" />
  `,
  /* 文字亮室 is a proof set up to be looked at closely: a sheet standing on an
     easel with a proof mark on it. It must not read as another page — Quick
     Draft is a page with a bolt and TeachText is a plain ruled page — so the
     stand is the thing that carries the meaning. */
  lightroom: `
    <path d="M4 6h19v14H4z" />
    <path class="sys-icon-detail classic-ink" d="M6 8h2v2H6zM6 12h2v2H6zM6 16h2v2H6z" />
    <path class="sys-icon-detail" d="M10 6v14" />
    <circle class="classic-paper" cx="20" cy="20" r="6.6" />
    <circle cx="20" cy="20" r="6" />
    <path d="M24.3 24.3L28 28" />
  `,
  quickDraft: `
    <path d="M8 5h16v22H8z" />
    <path d="M12 10h8M12 14h6" />
    <!-- Quick Draft reads as a page with a lightning bolt: "quick", and a
         shape that cannot be confused with TeachText's plain ruled page. -->
    <path d="M20 11L13 19h5L16 26l7-8h-5l2-7z" />
  `,
  /* The demo plays the writing route back to the user, so the object is a
     page with the shared transport play glyph on it — solid 1-bit fill, the
     same triangle the music transport uses. */
  writingDemo: `
    <path d="M8 5h16v22H8z" />
    <path d="M12 9h8M12 12h6" />
    <path class="classic-ink" d="M13 15l8 5-8 5z" />
  `,
  document: `
    <path d="M8 4h14l4 4v20H8z" />
    <path d="M22 4v6h4M12 14h10M12 19h10M12 24h7" />
  `,
  chatFile: `
    <path d="M6 8h20v13H6z" />
    <path d="M10 21l-3 5 7-5" />
    <path d="M10 13h12M10 17h8" />
  `,
  chatImport: `
    <path d="M6 8h17v12H12l-5 5 2-5H6z" />
    <path d="M10 12h9M10 16h6" />
    <path d="M20 18h7v9h-7z" />
    <path d="M22 21h3M22 24h3" />
  `,
  scrap: `
    <path d="M9 7h16v20H9z" />
    <path d="M6 10h3M6 15h3M6 20h3" />
    <path d="M13 12h8M13 17h7M13 22h8" />
  `,
  alias: `
    <path d="M6 4h16v24H6z" />
    <path d="M10 9h8M10 14h8M10 19h6" />
    <path d="M24 10l5 6-5 6" />
  `,
  systemStatus: `
    <path d="M6 7h20v18H6z" />
    <path d="M10 21l4-7 4 5 4-9" />
    <path d="M9 28h14" />
  `,
  contextPanel: `
    <path d="M6 6h20v20H6z" />
    <path d="M10 11h12M10 16h8M10 21h11" />
    <path d="M23 8v16" />
  `,
  rebuildArticle: `
    <path d="M8 5h16v22H8z" />
    <path d="M12 11h8M12 16h6M12 21h8" />
    <path d="M24 10l4 4-4 4M8 22l-4-4 4-4" />
  `,
  /* Writing Bell: Alarm Clock DA PICT -16000, third glyph, native pixels
     x=79..92, y=7..23 (14×17) — kept at its native smaller-than-others size
     relationship, never enlarged to fill the 32-grid. */
  writingBell: `
    <path class="classic-ink" d="M14 7h3v1h-3zM13 8h1v1h-1zM17 8h1v1h-1zM12 9h1v1h-1zM18 9h1v1h-1zM12 10h7v1h-7zM11 11h2v1h-2zM18 11h2v1h-2zM10 12h2v1h-2zM15 12h1v1h-1zM19 12h2v1h-2zM10 13h1v1h-1zM15 13h1v1h-1zM20 13h1v1h-1zM9 14h1v1h-1zM15 14h1v1h-1zM21 14h1v1h-1zM9 15h1v1h-1zM15 15h1v1h-1zM21 15h1v1h-1zM9 16h1v1h-1zM15 16h1v1h-1zM21 16h1v1h-1zM9 17h1v1h-1zM16 17h1v1h-1zM21 17h1v1h-1zM9 18h1v1h-1zM17 18h1v1h-1zM21 18h1v1h-1zM10 19h1v1h-1zM20 19h1v1h-1zM10 20h2v1h-2zM19 20h2v1h-2zM11 21h2v1h-2zM18 21h3v1h-3zM10 22h2v1h-2zM13 22h5v1h-5zM20 22h2v1h-2zM9 23h2v1h-2zM21 23h2v1h-2z" />
  `,
};

const classicPlusSystemIconPaths = {
  ...nativeSystem6FinderIconPaths,
  /* Custom route/application objects use one Classic drawing grammar:
     a 32×32 vector grid, a 2-unit safe edge, and one-unit outline strokes.
     Known Finder objects above keep their native 1-bit silhouettes; these
     newer objects are purpose-drawn companions rather than false replicas. */
  questionSheet: `
    <path d="M4 2h19l5 5v23H4z" />
    <path d="M23 2v5h5" />
    <path d="M10 13c1-3 3-5 7-5 4 0 7 2 7 5 0 5-7 5-7 9" />
    <path class="classic-ink" d="M16 26h2v2h-2z" />
  `,
  outline: `
    <path d="M4 2h24v28H4z" />
    <path d="M11 9h13M11 16h13M11 23h13" />
    <path class="classic-ink" d="M7 8h2v2H7zM7 15h2v2H7zM7 22h2v2H7z" />
  `,
  sectionDrafts: `
    <path d="M9 2h20v24H9z" />
    <path d="M3 6h21v24H3z" />
    <path d="M8 12h11M8 17h10M8 22h8" />
    <path d="M17 25l8-8 4 4-8 8-5 1z" />
  `,
  manuscript: `
    <path d="M4 2h24v28H4z" />
    <path d="M9 8h14M9 14h14M9 20h11M16 6v20" />
    <path class="classic-ink" d="M22 25h4v3h-4z" />
  `,
  reviewDesk: `
    <path d="M3 2h18l5 5v23H3z" />
    <path d="M21 2v7h5M8 13h11M8 18h8" />
    <circle cx="22" cy="22" r="8" />
    <path d="M18 22l3 3 6-8" />
  `,
  projectDisc: `
    <circle cx="16" cy="14" r="12" />
    <circle cx="16" cy="14" r="4" />
    <path d="M10 26h12v4H10zM13 28h6" />
  `,
  searcher: `
    <circle cx="13" cy="13" r="7" />
    <path d="M18 18l8 8M10 13h6M13 10v6" />
    <path d="M6 25c5-3 10-3 15 0" />
  `,
  bureaucracyMeme: `
    <path d="M5 7h22v16H5zM8 10h16v10H8z" />
    <path d="M10 22l-2 5M22 22l2 5M11 17h10M12 20h8" />
    <circle cx="13" cy="14" r="2" />
    <circle cx="19" cy="14" r="2" />
    <path d="M14 5h4M16 3v4" />
  `,
  /* The two pages meet on one spine at x=16. The earlier drawing let the left
     page run to 18 and the right page back to 14 and then added a third line
     at 16: three verticals two units apart, which at icon scale is one solid
     black bar, not a book. */
  reader: `
    <path d="M5 8h9c1 0 2 1 2 2v16c0-1-1-2-2-2H5z" />
    <path d="M27 8h-9c-1 0-2 1-2 2v16c0-1 1-2 2-2h9z" />
    <path d="M8 13h4M8 18h4M20 13h4M20 18h4" />
  `,
  timeMachine: `
    <path d="M4 7h24v20H4zM4 12h24" />
    <path class="classic-ink" d="M7 9h3v2H7zM12 9h3v2h-3z" />
    <circle cx="17" cy="19" r="6" />
    <path d="M17 15v4l3 2M9 19l-3 3 3 3" />
  `,
  docMap: `
    <rect x="12" y="4" width="8" height="8" />
    <rect x="4" y="20" width="8" height="8" />
    <rect x="20" y="20" width="8" height="8" />
    <path d="M16 12v5M8 20l8-8 8 8" />
    <path class="classic-ink" d="M15 16h2v2h-2z" />
  `,
  clioStage: `
    <path d="M5 7h22v14H5z" />
    <path d="M10 12h12M10 16h8M16 21v6M11 27h10" />
    <path d="M23 12l3 2-3 2" />
  `,
  clioChart: `
    <path d="M9 4v24" />
    <path d="M9 6h17v5H9zM9 22h8v5H9z" />
    <path class="classic-ink" d="M9 14h12v5H9z" />
    <path class="classic-ink" d="M3 14l5 2.5L3 19z" />
  `,
  clioProject: `
    <path d="M3 5h10v6H3z" />
    <path d="M3 21h10v6H3z" />
    <path class="classic-ink" d="M19 13h10v6H19z" />
    <path d="M13 8h3v8M13 24h3v-8M16 16h3" />
    <path class="classic-ink" d="M16 14l3 2-3 2z" />
  `,
  liquidCover: `
    <path d="M4 6h24v20H4z" />
    <path d="M9 21a5 5 0 0 1 10 0" />
    <path d="M21 10l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
  `,
  soundscape: `
    <path d="M5 6h22v20H5z" />
    <path class="classic-ink" d="M7 23h18v2H7z" />
    <path d="M8 16h3l2-6 3 12 3-10 2 7h3" />
    <path d="M8 24c3-3 5-3 8 0s5 3 8 0" />
  `,
  scrapbook: `
    <path d="M8 5h18v22H8zM5 8h3v19H5z" />
    <path d="M12 11h10M12 16h8M12 21h10" />
    <path class="classic-ink" d="M5 11h3v2H5zM5 17h3v2H5z" />
  `,
  applications: `
    <path d="M3 3h26v26H3zM16 3v26M3 16h26" />
    <path class="classic-ink" d="M7 7h5v5H7zM20 7h5v5h-5zM7 20h5v5H7zM20 20h5v5h-5z" />
  `,
  systemFile: `
    <path d="M5 10h22v17H5zM11 6h10v4H11zM9 14h14v9H9z" />
    <path d="M12 17h8M12 20h8" />
    <path class="classic-ink" d="M15 23h3v4h-3z" />
  `,
  finderApp: `
    <path d="M7 5h18v21H7zM10 9h12v11H10zM12 23h8M14 26h4" />
    <path class="classic-ink" d="M12 12h3v3h-3zM18 12h3v3h-3z" />
    <path d="M13 17c2 2 4 2 6 0" />
  `,
  multiFinderApp: `
    <path d="M4 6h17v15H4zM9 11h19v16H9zM4 10h17M9 15h19M13 19h11M13 23h7" />
    <path class="classic-ink" d="M6 7h3v2H6zM11 12h3v2h-3zM16 12h3v2h-3z" />
  `,
  daHandler: `
    <path d="M7 9h18v18H7zM11 6h10v3M11 14v8h3c3 0 3-8 0-8zM18 22l3-8 3 8M19 19h4" />
    <path class="classic-ink" d="M9 24h14v3H9z" />
  `,
  systemFolder: `
    <path d="M4 11h24v16H4zM7 7h8l3 4H7zM4 14h24" />
    <path class="classic-ink" d="M10 17h4v3h-4zM19 17h4v3h-4z" />
    <path d="M12 22c3 2 5 2 8 0" />
  `,
  helpFolder: `
    <path d="M4 11h24v16H4zM7 7h8l3 4H7zM4 14h24" />
    <path d="M13 17c1-2 6-2 6 1 0 2-3 2-3 4" />
    <path class="classic-ink" d="M15 24h3v2h-3z" />
  `,
  writingStudio: `
    <path d="M7 2h18v10H7zM3 11h26v15H3zM2 26h28v4H2z" />
    <path d="M10 6h12M10 9h12" />
    <path class="classic-ink" d="M7 15h4v3H7zM14 15h4v3h-4zM21 15h4v3h-4zM7 21h4v3H7zM14 21h4v3h-4zM21 21h4v3h-4z" />
  `,
  folder: `
    <path d="M4 11h24v16H4z" />
    <path d="M7 7h8l3 4H7z" />
    <path d="M4 14h24" />
  `,
  documents: `
    <path d="M5 11h22v16H5z" />
    <path d="M8 7h7l3 4H8z" />
    <path d="M12 16h9M12 21h7" />
  `,
  importUtility: `
    <path d="M5 11h22v15H5z" />
    <path d="M12 5h8v9h4l-8 8-8-8h4z" />
  `,
  controlPanel: `
    <path d="M5 8h22M5 16h22M5 24h22" />
    <path class="classic-ink" d="M9 5h5v6H9zM18 13h5v6h-5zM12 21h5v6h-5z" />
  `,
  control: `
    <path d="M5 6h22v21H5z" />
    <path d="M9 10h14M9 16h14M9 22h14" />
    <circle class="classic-ink" cx="12" cy="10" r="2" />
    <circle class="classic-ink" cx="20" cy="16" r="2" />
    <circle class="classic-ink" cx="15" cy="22" r="2" />
  `,
  chooser: `
    <path d="M5 7h22v18H5z" />
    <path d="M9 12h14M9 17h14M9 22h14M13 9v16M19 9v16" />
    <path class="classic-ink" d="M7 10h5v5H7zM17 15h5v5h-5z" />
  `,
  assistant: `
    <path class="classic-ink" d="M4 5h13v9H9l-4 4 1.5-4H4z" />
    <path d="M13 17h16v11h-5l2 3-6-3h-7z" stroke-dasharray="3 2" />
  `,
  teachText: `
    <path d="M8 5h16v22H8z" />
    <path d="M12 10h8M12 15h8M12 20h6M16 8v17" />
  `,
  contextPanel: `
    <path d="M6 6h20v20H6z" />
    <path d="M10 11h12M10 16h8M10 21h10M23 8v16" />
  `,
  writingBell: `
    <path class="classic-ink" d="M14 7h3v1h-3zM13 8h1v1h-1zM17 8h1v1h-1zM12 9h1v1h-1zM18 9h1v1h-1zM12 10h7v1h-7zM11 11h2v1h-2zM18 11h2v1h-2zM10 12h2v1h-2zM15 12h1v1h-1zM19 12h2v1h-2zM10 13h1v1h-1zM15 13h1v1h-1zM20 13h1v1h-1zM9 14h1v1h-1zM15 14h1v1h-1zM21 14h1v1h-1zM9 15h1v1h-1zM15 15h1v1h-1zM21 15h1v1h-1zM9 16h1v1h-1zM15 16h1v1h-1zM21 16h1v1h-1zM9 17h1v1h-1zM16 17h1v1h-1zM21 17h1v1h-1zM9 18h1v1h-1zM17 18h1v1h-1zM21 18h1v1h-1zM10 19h1v1h-1zM20 19h1v1h-1zM10 20h2v1h-2zM19 20h2v1h-2zM11 21h2v1h-2zM18 21h3v1h-3zM10 22h2v1h-2zM13 22h5v1h-5zM20 22h2v1h-2zM9 23h2v1h-2zM21 23h2v1h-2z" />
  `,
};

const classicOnlyModernFallbackIconId = {
  // ClioProject is new object art with no reviewed era family yet. It shows
  // its Classic line art in every appearance rather than joining the 56-object
  // era vocabulary unreviewed; promoting it later means real per-era assets.
  clioProject: true,
};

// Opt-in "line-art everywhere": when enabled, every non-Classic appearance
// reuses the Classic one-bit SVG family instead of its own era painter. The
// The compatibility table above is reserved for deliberate exceptions; this
// flag extends the behavior to the whole semantic vocabulary so a user can
// read the desk in a consistent 1-bit glyph language across appearances.
let classicLineArtEverywhereEnabled = false;

function setClassicLineArtEverywhere(enabled) {
  classicLineArtEverywhereEnabled = Boolean(enabled);
}

function classicLineArtEverywhere() {
  return classicLineArtEverywhereEnabled;
}

function normalizeSystemIconId(iconId) {
  const raw = String(iconId || "").trim();
  return systemIconPaths[raw] || completeEraSystemIconIds.has(raw) ? raw : "document";
}

// Complete renderer vocabulary: the canonical 56 objects plus six extended
// application ids. Kept as one split string because this module is eager and
// every extra array token spends the two-floppy startup budget.
const completeEraSystemIconIds = new Set(("startupDisk hardDisk folder document applications trash finderApp fileFloppy "
  + "assistant quickDraft writingStudio projectDisk projectDisc cloudModel cloudModelOff questionSheet outline "
  + "sectionDrafts manuscript reviewDesk searcher reader timeMachine docMap clioStage clioChart liquidCover "
  + "cmfStudio soundscape scrapbook systemFolder helpFolder importUtility controlPanel chooser systemHelp dictionary "
  + "teachText writingDemo chatFile chatImport systemStatus contextPanel rebuildArticle bureaucracyMeme "
  + "endfieldTerminal documents alias systemFile multiFinderApp daHandler writingBell trashFull control localModel "
  + "controlStrip imagePromptStudio micropolis openttd doom lightroom bonsaiCity").split(" "));

// Theme Lab and other read-only inspection surfaces consume the vocabulary
// from the painter itself. Keep a frozen array at the boundary: exposing the
// mutable Set would let an inspector accidentally change which ids render.
// Any future classic-only compatibility id stays a valid renderer input but
// is intentionally omitted from the appearance atlas.
const appearanceSystemIconIds = Object.freeze(
  [...completeEraSystemIconIds].filter((id) => !classicOnlyModernFallbackIconId[id])
);
window.AISystem6SystemIcons = Object.freeze({
  ids: appearanceSystemIconIds,
});

const platinumCoreSystemIconIds = new Set([
  "startupDisk", "hardDisk", "folder", "document", "applications", "trash", "finderApp", "fileFloppy",
  "assistant", "quickDraft", "writingStudio", "projectDisk", "projectDisc", "cloudModel", "cloudModelOff", "questionSheet",
  "outline", "sectionDrafts", "manuscript", "reviewDesk", "searcher", "reader", "timeMachine", "docMap", "clioStage",
  "clioChart", "liquidCover", "cmfStudio", "soundscape", "scrapbook", "systemFolder", "helpFolder", "importUtility",
  "controlPanel", "chooser", "systemHelp", "dictionary", "teachText", "writingDemo", "chatFile", "chatImport",
  "systemStatus", "contextPanel", "rebuildArticle", "bureaucracyMeme", "endfieldTerminal", "documents", "alias",
  "systemFile", "multiFinderApp", "daHandler", "writingBell", "trashFull", "control", "localModel", "controlStrip",
  "micropolis", "openttd", "doom", "bonsaiCity", "lightroom", "imagePromptStudio", "clipboard",
]);

// Icon files are served with a long cache lifetime, and these hrefs sit inside
// inline SVG rather than in the CSS bundle the build stamps. Without the build
// stamp a release that redraws an icon leaves returning visitors on the old
// bytes for as long as the asset cache lives.
function systemIconAssetUrl(path) {
  const build = window.AISystem6Config?.getAppBuildInfo?.().build;
  return build ? `${path}?v=${encodeURIComponent(build)}` : path;
}

function classicOnlyModernIconArt(iconId) {
  if (!classicOnlyModernFallbackIconId[iconId]) return "";
  const stem = systemIconEscape(iconId);
  const art = systemIconAssetUrl(`assets/themes/classic/icons/${stem}-32.svg`);
  return `<image class="sys-icon-era-raster" href="${art}" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`;
}

// Reusable Classic line-art image for the "line-art everywhere" preference.
// Unlike classicOnlyModernIconArt it covers the full semantic vocabulary, but
// it still skips transport glyphs and other non-family ids that own no
// classic SVG file.
function classicLineArtImage(iconId) {
  if (!completeEraSystemIconIds.has(iconId)) return "";
  const stem = systemIconEscape(iconId);
  const art = systemIconAssetUrl(`assets/themes/classic/icons/${stem}-32.svg`);
  return `<image class="sys-icon-era-raster" href="${art}" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`;
}

function classicSystemIconArt(iconId, sourceSize) {
  if (!completeEraSystemIconIds.has(iconId)) return "";
  const stem = systemIconEscape(iconId);
  const mask = systemIconAssetUrl(`assets/themes/classic/icons/${stem}-mask-${sourceSize}.svg`);
  const art = systemIconAssetUrl(`assets/themes/classic/icons/${stem}-${sourceSize}.svg`);
  return `<image class="sys-icon-classic-mask" href="${mask}" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" /><image class="sys-icon-classic-art" href="${art}" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`;
}

function platinumCoreSystemIconArt(iconId, sourceSize) {
  if (classicLineArtEverywhere()) {
    const lineArt = classicLineArtImage(iconId);
    if (lineArt) return lineArt;
  }
  const classicOnlyArt = classicOnlyModernIconArt(iconId);
  if (classicOnlyArt) return classicOnlyArt;
  if (!completeEraSystemIconIds.has(iconId) && !platinumCoreSystemIconIds.has(iconId)) return "";
  const fallbackStem = iconId === "startupDisk" ? "startup-disk"
    : iconId === "finderApp" ? "finder-app"
      : iconId === "fileFloppy" ? "floppy" : iconId;
  const usesNativeRaster = platinumCoreSystemIconIds.has(iconId);
  const file = usesNativeRaster
    ? `icons/${systemIconEscape(iconId)}-${sourceSize}.png`
    : `${systemIconEscape(fallbackStem)}-${sourceSize}.svg`;
  const rasterClass = usesNativeRaster ? ' class="sys-icon-platinum-raster"' : "";
  return `<image${rasterClass} href="${systemIconAssetUrl(`assets/themes/platinum/${file}`)}" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`;
}

function completeEraRasterSystemIconArt(era, iconId, sourceSize) {
  // Transport controls are shared 1-bit UI glyphs rather than members of the
  // 56-object application family. Keep them present in every modern theme
  // group so the theme CSS can select one group without blanking playback.
  if (transportIconPaths[iconId]) return transportIconPaths[iconId];
  if (classicLineArtEverywhere()) {
    const lineArt = classicLineArtImage(iconId);
    if (lineArt) return lineArt;
  }
  const classicOnlyArt = classicOnlyModernIconArt(iconId);
  if (classicOnlyArt) return classicOnlyArt;
  if (!completeEraSystemIconIds.has(iconId)) return "";
  const stem = systemIconEscape(iconId);
  const suffix = era === "liquid-glass" ? "-default" : "";
  const file = `assets/themes/${era}/icons/${stem}-${sourceSize}${suffix}.png`;
  return `<image class="sys-icon-era-raster" href="${systemIconAssetUrl(file)}" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`;
}

function liquidGlassSystemIconArt(iconId, sourceSize = 32) {
  if (transportIconPaths[iconId]) return transportIconPaths[iconId];
  if (classicLineArtEverywhere()) {
    const lineArt = classicLineArtImage(iconId);
    if (lineArt) return lineArt;
  }
  const classicOnlyArt = classicOnlyModernIconArt(iconId);
  if (classicOnlyArt) return classicOnlyArt;
  // `scrap` is a retired pre-Theme-Lab id kept for old saved workspaces. The
  // current 56-object contract calls the same object `scrapbook`.
  const assetId = iconId === "scrap" ? "scrapbook" : iconId;
  const assetSize = [16, 32, 64, 128].includes(Number(sourceSize)) ? Number(sourceSize) : 32;
  const stem = systemIconEscape(assetId);
  // The asset-backed Liquid Glass vocabulary owns independent Image Gen raster
  // artwork. Clipboard remains a legacy inline object and keeps the old SVG
  // fallback because it is not part of the canonical family.
  const usesEraRaster = completeEraSystemIconIds.has(assetId);
  const file = usesEraRaster ? `icons/${stem}-${assetSize}-default.png` : `${stem}-${assetSize}.svg`;
  const rasterClass = usesEraRaster ? ' class="sys-icon-era-raster"' : "";
  return `<image${rasterClass} href="${systemIconAssetUrl(`assets/themes/liquid-glass/${file}`)}" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`;
}

function systemIconUsesSmallSource(options = {}) {
  if (Number(options.sourceSize) === 16) return true;
  if (typeof options.size === "number") return options.size <= 22;
  return ["mini", "small", "tiny", "menu"].includes(String(options.size || ""));
}

function systemIconDevicePixelRatio() {
  const ratio = typeof window !== "undefined" ? Number(window.devicePixelRatio) : 1;
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, 3) : 1;
}

function systemIconDisplaySize(options = {}, compactSourceSize = 32) {
  const requested = Number(options.displaySize);
  if (Number.isFinite(requested) && requested > 0) return requested;
  if (typeof options.size === "number" && Number.isFinite(options.size)) return options.size;
  const semanticSize = String(options.size || "");
  if (["tiny", "small", "mini", "menu"].includes(semanticSize)) return 17;
  if (["list", "help-row"].includes(semanticSize)) return 22;
  if (semanticSize === "finder") return 44;
  if (semanticSize === "desktop") return 42;
  if (semanticSize === "large") return 48;
  if (semanticSize === "help-object") return 32;
  return Number(compactSourceSize) === 16 ? 17 : 34;
}

function systemIconModernSourceSize(options = {}, compactSourceSize = 32) {
  const requested = Number(options.modernSourceSize);
  if ([16, 32, 64, 128].includes(requested)) return requested;
  const requiredPixels = systemIconDisplaySize(options, compactSourceSize) * systemIconDevicePixelRatio();
  // Aqua and Snow Leopard do not have a 64 px tier, so all four modern
  // painters share the complete 16/32/128 ladder. A 10% optical tolerance
  // keeps a 17 px menu icon on the authored 16/32 compact artwork while
  // preventing Finder, list and welcome icons from being enlarged past their
  // physical source pixels on Retina displays.
  return [16, 32, 128].find((size) => size >= requiredPixels * 0.9) || 128;
}

function systemIconSvg(iconId, options = {}) {
  const id = normalizeSystemIconId(iconId);
  const sourceSize = systemIconUsesSmallSource(options) ? 16 : 32;
  const requestedPlatinumSize = Number(options.platinumSourceSize);
  const platinumSourceSize = [16, 32, 42].includes(requestedPlatinumSize)
    ? requestedPlatinumSize
    : String(options.size || "") === "desktop" ? 42 : sourceSize;
  const coreArt = classicSystemIconArt(id, sourceSize);
  const platinumArt = platinumCoreSystemIconArt(id, platinumSourceSize);
  const modernDisplaySize = systemIconDisplaySize(options, sourceSize);
  const modernSourceSize = systemIconModernSourceSize(options, sourceSize);
  const aquaArt = completeEraRasterSystemIconArt("aqua", id, modernSourceSize);
  const snowArt = completeEraRasterSystemIconArt("snow-leopard", id, modernSourceSize);
  const yosemiteArt = completeEraRasterSystemIconArt("yosemite", id, modernSourceSize);
  const paths = coreArt || classicPlusSystemIconPaths[id] || systemIconPaths[id] || systemIconPaths.document;
  const liquidPaths = liquidGlassSystemIconArt(id, modernSourceSize);
  const maskClass = coreArt ? " has-classic-mask" : "";
  const platinumClass = platinumArt ? " has-platinum-core" : "";
  return `<svg class="sys-icon-svg${maskClass}${platinumClass}" data-classic-source-size="${sourceSize}" data-platinum-source-size="${platinumSourceSize}" data-modern-display-size="${modernDisplaySize}" data-modern-source-size="${modernSourceSize}" viewBox="0 0 32 32" focusable="false" aria-hidden="true"><g class="sys-icon-classic">${paths}</g><g class="sys-icon-platinum-core">${platinumArt}</g><g class="sys-icon-aqua">${aquaArt}</g><g class="sys-icon-snow-leopard">${snowArt}</g><g class="sys-icon-yosemite">${yosemiteArt}</g><g class="sys-icon-liquid">${liquidPaths}</g></svg>`;
}

function renderSystemIcon(iconId, options = {}) {
  const id = normalizeSystemIconId(iconId);
  const size = options.size || "mini";
  const extraClass = options.className ? ` ${systemIconEscape(options.className)}` : "";
  return `<span class="sys-icon sys-icon-${systemIconEscape(size)}${extraClass}" data-system-icon="${systemIconEscape(id)}" aria-hidden="true">${systemIconSvg(id, options)}</span>`;
}

function hydrateSystemIcons(root = document) {
  root.querySelectorAll("[data-system-icon]").forEach((item) => {
    item.classList.add("sys-icon");
    const useSmallSource = item.matches([
      ".sys-icon-mini",
      ".menu-bar .sys-icon",
      ".cloud-icon",
      ".project-switcher-icon",
      ".control-strip .sys-icon",
      ".finder-list-name-cell .sys-icon",
      ".finder-list-row .sys-icon",
    ].join(", "));
    const useListSource = item.matches([
      ".finder-list-name-cell .sys-icon",
      ".finder-list-row .sys-icon",
      ".finder-operation-item .sys-icon",
      ".sys-icon-help-row",
    ].join(", "));
    const useFinderSource = item.matches(".finder-item .sys-icon");
    const usePlatinumDesktopSource = !useSmallSource && item.classList.contains("sys-icon-desktop");
    item.innerHTML = systemIconSvg(item.dataset.systemIcon, {
      sourceSize: useSmallSource ? 16 : 32,
      platinumSourceSize: useSmallSource ? 16 : usePlatinumDesktopSource ? 42 : 32,
      // Finder icon view owns the actual 44 px display contract even when
      // legacy markup still carries the compact `sys-icon-mini` class.  The
      // rendered context must win over that historical source-size hint or a
      // Retina browser will upscale the 16/32 px raster and blur it.
      displaySize: useListSource ? 22 : useFinderSource ? 44 : useSmallSource ? 17 : usePlatinumDesktopSource ? 42 : 34,
    });
  });
}
