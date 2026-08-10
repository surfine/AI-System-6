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

// Exact 32×32 1-bit resources from the bundled System 6.0.8 image. The
// horizontal/vertical runs below are a lossless currentColor SVG encoding of
// the source pixels — no raster asset is stretched at runtime:
// - startup disk: Startup Device, ICN# -4064
// - hard disk: Apple HD SC Setup, ICN# 16646
// - floppy: Finder, ICN# 129
// - empty/full Trash: Finder, ICN# 130 / 134
// Classic and Classic Plus use these source pixels. Liquid Glass keeps the
// same semantic ids but supplies its own coherent rounded-outline family.
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
  searcher: `
    <circle cx="13" cy="13" r="7" />
    <path d="M18 18l8 8" />
    <path d="M10 13h6M13 10v6" />
    <path d="M5 25c5-4 10-4 16-1" />
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
  docMap: `
    <rect x="12" y="4" width="8" height="8" />
    <rect x="4" y="20" width="8" height="8" />
    <rect x="20" y="20" width="8" height="8" />
    <path d="M16 12v5M8 20l8-8 8 8" />
    <circle cx="16" cy="17" r="2" />
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
  scrapbook: `
    <path d="M8 5h18v22H8z" />
    <path d="M8 5l-3 3v19h3" />
    <path d="M12 10h10M12 15h8M12 21h10" />
    <path d="M9 8v16" />
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
  controlPanel: `
    <path d="M5 8h22M5 16h22M5 24h22" />
    <rect x="9" y="5" width="5" height="6" />
    <rect x="18" y="13" width="5" height="6" />
    <rect x="12" y="21" width="5" height="6" />
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

const liquidSystemIconPaths = {
  ...transportIconPaths,
  startupDisk: `
    <path class="icon-fill" d="M6.5 4.5h17L27.5 8v19.5h-21z" />
    <path d="M10.5 5v8h12V5M20 7v4M10 16.5h14v10H10z" />
    <path d="M13.2 20c.4-1.5 1.8-2.5 3.6-2.5 2.1 0 3.5 1.2 3.5 2.8 0 2.1-3.2 2.3-3.2 4.1M17.1 25.8h.1" />
  `,
  projectDisk: `
    <path class="icon-fill" d="M5 11.5h22v13a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" />
    <path d="M5.5 16h21M9 20h10M9 23.5h7" />
    <circle class="icon-accent" cx="23" cy="22" r="1.5" />
  `,
  fileFloppy: `
    <path class="icon-fill" d="M7 5.5h16.5L27 9v17.5H7z" />
    <path d="M11 6v7h10V6M11 21h10M21 7.5v4" />
  `,
  cloudModel: `
    <path class="icon-fill" d="M8 22.5h16.5a4.2 4.2 0 0 0 .4-8.4 6.2 6.2 0 0 0-11.7-1.9A5.3 5.3 0 0 0 8 22.5z" />
    <path d="M12 18.5h8M16 14.5v8" />
  `,
  cloudModelOff: `
    <path class="icon-fill" d="M8 22.5h16.5a4.2 4.2 0 0 0 .4-8.4 6.2 6.2 0 0 0-11.7-1.9A5.3 5.3 0 0 0 8 22.5z" />
    <path d="M8 26L26 8" />
  `,
  questionSheet: `
    <path class="icon-fill" d="M8 5.5h13.5L25.5 10v17H8z" />
    <path d="M21.5 6v5h4M13 14.5c.8-1.6 2.4-2.5 4.2-2.2 1.7.2 2.9 1.3 2.9 2.8 0 2.7-4 2.8-4 5.4M16.1 24h.1" />
  `,
  outline: `
    <rect class="icon-fill" x="8" y="5.5" width="16" height="21" rx="3" />
    <path d="M13 11h7M13 16h7M13 21h7M11 11h.1M11 16h.1M11 21h.1" />
  `,
  sectionDrafts: `
    <rect class="icon-fill" x="7" y="8" width="15" height="18" rx="3" />
    <path d="M11 5.5h12.5v16M11 13h7M11 18h6" />
    <path class="icon-accent" d="M18 25l6.5-6.5 2.5 2.5-6.5 6.5-3 .5z" />
  `,
  manuscript: `
    <rect class="icon-fill" x="7.5" y="5.5" width="17" height="21" rx="3" />
    <path d="M12 10h8M12 15h8M12 20h6M16 9v14" />
  `,
  reviewDesk: `
    <path class="icon-fill" d="M7.5 5.5h14L26 10v17H7.5z" />
    <path d="M21.5 6v5h4M11 13.5h8M11 18h5" />
    <circle class="icon-fill-soft" cx="21" cy="21.5" r="5.5" />
    <path class="icon-accent" d="M18.5 21.5l2 2 4-5" />
  `,
  projectDisc: `
    <circle class="icon-fill" cx="16" cy="14.5" r="10" />
    <circle cx="16" cy="14.5" r="3" />
    <path d="M12 24.5h8v3.5h-8zM14 26.5h4" />
  `,
  searcher: `
    <circle class="icon-fill" cx="13" cy="13" r="7.2" />
    <path d="M18.5 18.5L26 26M10 13h6M13 10v6" />
    <path class="icon-accent" d="M7 24c4.5-2.7 9.2-2.8 14 0" />
  `,
  bureaucracyMeme: `
    <path class="icon-fill" d="M5.5 7.5h21v15h-21z" />
    <path class="icon-fill-soft" d="M8.5 10.5h15v9h-15z" />
    <path d="M10 22.5l-2 4.5M22 22.5l2 4.5M11 17h10M12 20h8" />
    <circle cx="13" cy="14" r="1.8" />
    <circle cx="19" cy="14" r="1.8" />
    <path class="icon-accent" d="M14 5h4M16 3v4" />
  `,
  endfieldTerminal: `
    <rect class="icon-fill" x="5.5" y="6.5" width="21" height="19" rx="4" />
    <path d="M9 11h14M9 15h8M9 19h11" />
    <path class="icon-accent" d="M20 21.5h4M22 19.5v4" />
  `,
  reader: `
    <path class="icon-fill" d="M5.5 7.5h8.5c1 0 2 1 2 2v17c0-1-1-2-2-2H5.5z" />
    <path class="icon-fill-soft" d="M26.5 7.5H18c-1 0-2 1-2 2v17c0-1 1-2 2-2h8.5z" />
    <path d="M9 13h4M9 18h4M19 13h4M19 18h4" />
  `,
  timeMachine: `
    <rect class="icon-fill" x="4.5" y="7" width="23" height="20" rx="4" />
    <path d="M5 12h22M9 9.5h.1M13 9.5h.1" />
    <circle class="icon-fill-soft" cx="17" cy="19" r="6" />
    <path class="icon-accent" d="M17 15v4l3 2M9 19l-3 3 3 3" />
  `,
  docMap: `
    <rect class="icon-fill" x="12" y="4.5" width="8" height="8" rx="2" />
    <rect class="icon-fill-soft" x="4.5" y="20" width="8" height="8" rx="2" />
    <rect class="icon-fill-soft" x="19.5" y="20" width="8" height="8" rx="2" />
    <path d="M16 12.5v4.5M8.5 20l7.5-7.5 7.5 7.5" />
  `,
  clioStage: `
    <rect class="icon-fill" x="5.5" y="7" width="21" height="14" rx="3" />
    <path d="M10 12h12M10 16.5h8M16 21v6M11 27h10" />
    <path class="icon-accent" d="M23 12l3 2.5-3 2.5" />
  `,
  clioChart: `
    <rect class="icon-fill" x="3.5" y="4.5" width="25" height="23" rx="4" />
    <path d="M10 8v16" />
    <path class="icon-fill-soft" d="M10 9.5h14v4H10zM10 20.5h7v4H10z" />
    <path class="icon-accent" d="M10 15h11v4H10z" />
  `,
  liquidCover: `
    <rect class="icon-fill" x="4.5" y="6" width="23" height="20" rx="3" />
    <path class="icon-fill-soft" d="M9 21a5 5 0 0 1 10 0z" />
    <path class="icon-accent" d="M21 9l1.3 2.7 2.7 1.3-2.7 1.3L21 17l-1.3-2.7-2.7-1.3 2.7-1.3z" />
  `,
  cmfStudio: `
    <rect class="icon-fill" x="9" y="5.5" width="14" height="21" rx="3" />
    <path d="M12 9h8M12 23h8" />
    <path class="icon-fill-soft" d="M6 10h3v3H6zM6 17h3v3H6zM23 13h3v5h-3z" />
    <circle class="icon-accent" cx="14" cy="13" r="2" />
    <circle class="icon-accent" cx="18" cy="18" r="2" />
  `,
  soundscape: `
    <rect class="icon-fill" x="5" y="6" width="22" height="20" rx="3" />
    <path class="icon-fill-soft" d="M8 23h16v2H8z" />
    <path d="M8 16h3l2-6 3 12 3-10 2 7h3" />
    <path class="icon-accent" d="M8 24c3-3 5-3 8 0s5 3 8 0" />
  `,
  scrapbook: `
    <path class="icon-fill" d="M8 5.5h17.5v21H8z" />
    <path class="icon-fill-soft" d="M5.5 8.5h4v18h-4z" />
    <path d="M12 11h9M12 16h7M12 21h9" />
  `,
  applications: `
    <rect class="icon-fill" x="6" y="6" width="20" height="20" rx="4" />
    <path d="M16 6v20M6 16h20" />
    <circle class="icon-fill-soft" cx="11" cy="11" r="1.8" />
    <circle class="icon-fill-soft" cx="21" cy="11" r="1.8" />
    <circle class="icon-fill-soft" cx="11" cy="21" r="1.8" />
    <circle class="icon-fill-soft" cx="21" cy="21" r="1.8" />
  `,
  systemFile: `
    <rect class="icon-fill" x="5.5" y="10" width="21" height="16.5" rx="3" />
    <path d="M11 10V6.5h10V10M10 14h12v9H10zM13 18h6" />
    <path class="icon-accent" d="M15 23h2v3.5h-2z" />
  `,
  finderApp: `
    <rect class="icon-fill" x="7" y="5.5" width="18" height="20.5" rx="4" />
    <rect class="icon-fill-soft" x="10" y="9" width="12" height="11" rx="2" />
    <path d="M13 13h.1M19 13h.1M13 17c2 2 4 2 6 0M12 23h8" />
  `,
  multiFinderApp: `
    <rect class="icon-fill-soft" x="4.5" y="6" width="16.5" height="15" rx="3" />
    <rect class="icon-fill" x="9" y="11" width="19" height="16" rx="3" />
    <path d="M5 10h16M9 15h19M13 19h11M13 23h7" />
    <path class="icon-accent" d="M12 13h.1M16 13h.1" />
  `,
  daHandler: `
    <rect class="icon-fill" x="7" y="9" width="18" height="18" rx="3" />
    <path d="M11 9V6.5h10V9M11 14v8h3c3 0 3-8 0-8zM18 22l3-8 3 8M19 19h4" />
    <path class="icon-accent" d="M9 25h14" />
  `,
  systemFolder: `
    <path class="icon-fill" d="M4.5 11h23v15.5a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2z" />
    <path class="icon-fill-soft" d="M7 7.5h8l3 3.5H7z" />
    <path class="icon-accent" d="M11 17h2M19 17h2M12 21c3 2 5 2 8 0" />
  `,
  helpFolder: `
    <path class="icon-fill" d="M4.5 11h23v15.5a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2z" />
    <path class="icon-fill-soft" d="M7 7.5h8l3 3.5H7z" />
    <path class="icon-accent" d="M13 16c1-2 6-2 6 1 0 2.5-3 2.5-3 4.5M16 24h.1" />
  `,
  writingStudio: `
    <rect class="icon-fill-soft" x="9" y="4.5" width="14" height="10" rx="2" />
    <rect class="icon-fill" x="5" y="13" width="22" height="12" rx="3" />
    <path d="M12 8h8M12 11h8" />
    <path d="M9 17h3M15 17h3M21 17h2M9 21h3M15 21h3M21 21h2" />
    <path class="icon-accent" d="M4 24h24v4H4z" />
  `,
  folder: `
    <path class="icon-fill" d="M4.5 11h23v15.5a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2z" />
    <path class="icon-fill-soft" d="M7 7.5h8l3 3.5H7z" />
  `,
  documents: `
    <path class="icon-fill" d="M5.5 11h21v15.5a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2z" />
    <path class="icon-fill-soft" d="M8.5 7.5H15l3 3.5H8.5z" />
    <path d="M12 16h9M12 21h7" />
  `,
  importUtility: `
    <path class="icon-fill" d="M5.5 11h21v15H5.5z" />
    <path class="icon-accent" d="M12 5.5h8v9h4L16 22l-8-7.5h4z" />
  `,
  trash: `
    <path class="icon-fill" d="M8.5 10.5h15l-1 16.5h-13z" />
    <path d="M6.5 10.5h19M12 7h8M14 7V5h4v2M13 14v9M16 14v9M19 14v9" />
  `,
  trashFull: `
    <path class="icon-fill" d="M8.5 11h15l-1 16h-13z" />
    <path class="icon-fill-soft" d="M9 10l3-4 4 2 4-3 4 5z" />
    <path d="M6.5 11h19M12 7h8M14 7V5h4v2M13 15v8M16 15v8M19 15v8" />
  `,
  controlPanel: `
    <path d="M6 9h20M6 16h20M6 23h20" />
    <rect class="icon-fill" x="9" y="6" width="5.5" height="6" rx="2" />
    <rect class="icon-fill-soft" x="18" y="13" width="5.5" height="6" rx="2" />
    <rect class="icon-fill" x="12.5" y="20" width="5.5" height="6" rx="2" />
  `,
  chooser: `
    <rect class="icon-fill" x="5.5" y="7" width="21" height="18" rx="3" />
    <path d="M10 12h12M10 17h12M10 22h12" />
    <path class="icon-accent" d="M13 9v16M19 9v16" />
  `,
  systemHelp: `
    <rect class="icon-fill" x="8" y="5.5" width="16" height="21" rx="3" />
    <path d="M13 13c.6-1.6 2-2.4 3.8-2.2 1.7.2 2.8 1.2 2.8 2.6 0 2.7-4 2.8-4 5.2M15.8 22.5h.1" />
  `,
  dictionary: `
    <rect class="icon-fill" x="7.5" y="5.5" width="17" height="21" rx="3" />
    <path d="M11 6v20M14 11h7M14 16h6M14 21h7" />
  `,
  assistant: `
    <path class="icon-accent" d="M4.5 5.5h12v8.5H9.5l-4 3.5 1.5-3.5H4.5z" />
    <path class="icon-fill" d="M13.5 17.5h15v10h-5l3 3-7-3h-6z" stroke-dasharray="3 2" />
  `,
  teachText: `
    <rect class="icon-fill" x="8" y="5.5" width="16" height="21" rx="3" />
    <path d="M12 10h8M12 15h8M12 20h6M16 9v15" />
  `,
  quickDraft: `
    <rect class="icon-fill" x="8" y="5.5" width="16" height="21" rx="3" />
    <path d="M12 10.5h8M12 15h6" />
    <path class="icon-accent" d="M20 11L13 19h5L16 26l7-8h-5l2-7z" />
  `,
  writingDemo: `
    <rect class="icon-fill" x="8" y="5.5" width="16" height="21" rx="3" />
    <path d="M12 10h8M12 13.5h6" />
    <path class="classic-ink" d="M13 16l7.5 4.5-7.5 4.5z" />
  `,
  document: `
    <path class="icon-fill" d="M8 5h13.5L26 9.5V27H8z" />
    <path d="M21.5 5v5h4.5M12 14h10M12 19h10M12 24h7" />
  `,
  chatFile: `
    <path class="icon-fill" d="M6 8h20v13H14l-6.5 5 2.5-5H6z" />
    <path d="M10 13h12M10 17h8" />
  `,
  chatImport: `
    <path class="icon-fill" d="M6 8h17v12H12l-5 5 2-5H6z" />
    <path d="M10 12.5h9M10 16.5h6" />
    <rect class="icon-fill-soft" x="20" y="18" width="7" height="9" rx="1.5" />
    <path d="M22 21h3M22 24h3" />
  `,
  scrap: `
    <rect class="icon-fill" x="9" y="7" width="16" height="20" rx="3" />
    <path d="M6 11h3M6 16h3M6 21h3M13 12h8M13 17h7M13 22h8" />
  `,
  alias: `
    <rect class="icon-fill" x="6" y="4" width="16" height="24" rx="2.5" />
    <path d="M10 9h8M10 14h8M10 19h6" />
    <path class="icon-accent" d="M24 10l5 6-5 6" />
  `,
  systemStatus: `
    <rect class="icon-fill" x="6" y="7" width="20" height="18" rx="3" />
    <path class="icon-accent" d="M10 20l4-6 4 4.5 4-8.5" />
    <path d="M10 28h12" />
  `,
  contextPanel: `
    <rect class="icon-fill" x="6" y="6" width="20" height="20" rx="4" />
    <path d="M10 11h12M10 16h8M10 21h10M23 9v14" />
  `,
  rebuildArticle: `
    <rect class="icon-fill" x="8" y="5.5" width="16" height="21" rx="3" />
    <path d="M12 11h8M12 16h6M12 21h8" />
    <path class="icon-accent" d="M24 11l4 4-4 4M8 21l-4-4 4-4" />
  `,
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

function normalizeSystemIconId(iconId) {
  const raw = String(iconId || "").trim();
  return systemIconPaths[raw] ? raw : "document";
}

const classicCoreSystemIconIds = new Set([
  "finderApp", "folder", "hardDisk", "trash", "document", "daHandler",
  "fileFloppy", "projectDisk", "searcher", "teachText", "scrapbook", "assistant",
]);

const platinumCoreSystemIconIds = new Set([
  "finderApp", "folder", "hardDisk", "trash", "document", "daHandler",
  "fileFloppy", "projectDisc", "controlPanel", "systemFile", "scrapbook", "clipboard",
]);

function classicCoreSystemIconArt(iconId, sourceSize) {
  if (!classicCoreSystemIconIds.has(iconId)) return "";
  return `<image href="assets/themes/classic/icons/${systemIconEscape(iconId)}-${sourceSize}.svg" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`;
}

function platinumCoreSystemIconArt(iconId, sourceSize) {
  if (!platinumCoreSystemIconIds.has(iconId)) return "";
  return `<image href="assets/themes/platinum/icons/${systemIconEscape(iconId)}-${sourceSize}.png" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`;
}

function liquidGlassSystemIconArt(iconId, sourceSize = 32) {
  if (transportIconPaths[iconId]) return transportIconPaths[iconId];
  // `scrap` is a retired pre-Theme-Lab id kept for old saved workspaces. The
  // current 54-object contract calls the same object `scrapbook`.
  const assetId = iconId === "scrap" ? "scrapbook" : iconId;
  const assetSize = sourceSize === 16 ? 16 : 32;
  return `<image href="assets/themes/liquid-glass/${systemIconEscape(assetId)}-${assetSize}.svg" x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" />`;
}

function systemIconUsesSmallSource(options = {}) {
  if (Number(options.sourceSize) === 16) return true;
  if (typeof options.size === "number") return options.size <= 22;
  return ["mini", "small", "tiny", "menu"].includes(String(options.size || ""));
}

function systemIconSvg(iconId, options = {}) {
  const id = normalizeSystemIconId(iconId);
  const sourceSize = systemIconUsesSmallSource(options) ? 16 : 32;
  const coreArt = classicCoreSystemIconArt(id, sourceSize);
  const platinumArt = platinumCoreSystemIconArt(id, sourceSize);
  const paths = coreArt || classicPlusSystemIconPaths[id] || systemIconPaths[id] || systemIconPaths.document;
  const liquidPaths = liquidGlassSystemIconArt(id, sourceSize);
  const maskClass = coreArt ? " has-classic-mask" : "";
  const platinumClass = platinumArt ? " has-platinum-core" : "";
  return `<svg class="sys-icon-svg${maskClass}${platinumClass}" data-classic-source-size="${sourceSize}" viewBox="0 0 32 32" focusable="false" aria-hidden="true"><g class="sys-icon-classic">${paths}</g><g class="sys-icon-platinum-core">${platinumArt}</g><g class="sys-icon-liquid">${liquidPaths}</g></svg>`;
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
    item.innerHTML = systemIconSvg(item.dataset.systemIcon, {
      sourceSize: useSmallSource ? 16 : 32,
    });
  });
}
