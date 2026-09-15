// Feature module: CMF Studio.
// Loaded lazily as a classic script; shares the AI System 6 global scope.

(() => {
  const STORAGE_KEY = "ai-system-6-cmf-studio-recipe";
  // How much dielectric specular a lit display keeps (see prepareLiveMaterials).
  const SCREEN_SPECULAR_INTENSITY = 0.15;
  // Clearcoat is a second, independent specular layer: specularIntensity
  // does not reach it, so a lit display kept a full-strength varnish that
  // mirrored the neutral studio environment as an even grey veil.
  const SCREEN_CLEARCOAT = 0.04;
  const RENDERER_VENDOR_URL = "/app/vendor/cmf-renderer.js?v=three-0.184.0-uv-channel-cache-exr-rotate-pivot";
  // Only finishes Apple actually shipped on the part. Hexes are sampled from
  // Apple's own store swatches; the server keeps the same ids and values.
  const IPHONE_17_COLORS = [
    { id: "black17", hex: "#353839", labelKey: "cmf_color_black17" },
    { id: "lavender17", hex: "#dfceea", labelKey: "cmf_color_lavender17" },
    { id: "mistBlue17", hex: "#96aed1", labelKey: "cmf_color_mist_blue17" },
    { id: "sage17", hex: "#a9b689", labelKey: "cmf_color_sage17" },
    { id: "white17", hex: "#f5f5f5", labelKey: "cmf_color_white17" },
  ];
  const IPHONE_17_PRO_COLORS = [
    { id: "cosmicOrange17Pro", hex: "#f78039", labelKey: "cmf_color_cosmic_orange17pro" },
    { id: "deepBlue17Pro", hex: "#47547e", labelKey: "cmf_color_deep_blue17pro" },
    { id: "silver17Pro", hex: "#e7e7e7", labelKey: "cmf_color_silver17pro" },
  ];
  const IPHONE_18_PRO_COLORS = [
    { id: "silver18Pro", hex: "#c4c4c4", labelKey: "cmf_color_silver18pro" },
    { id: "burgundy18Pro", hex: "#2e0f14", labelKey: "cmf_color_burgundy18pro" },
    { id: "glacier18Pro", hex: "#a3b1c4", labelKey: "cmf_color_glacier18pro" },
    { id: "black18Pro", hex: "#242424", labelKey: "cmf_color_black18pro" },
  ];
  const IPHONE_DUO_COLORS = [
    { id: "starWhiteDuo", hex: "#f7f6f5", labelKey: "cmf_color_star_white_duo" },
    { id: "nightSkyDuo", hex: "#394452", labelKey: "cmf_color_night_sky_duo" },
  ];
  const IPHONE_18_PRO_MESH_PARTS = Object.freeze({
    tGmDwIVAJzsXtCr: "actionButton", IhutpDtXiHOXZQQ: "volumeUp",
    MLXiLvzAcyadwsO: "volumeDown", PiNlHXRokKeMMue: "sideButton",
    BBOLhsUzCqVnqIr: "cameraControl", RkmKFSzCSaemljP: "cameraControl",
    uzPNjLhCsKQHKkA: "cameraControl", tSzbeyqDWPqajtE: "backGlass",
    lHgsWfYosJjEHHx: "backGlass",
  });
  const IPHONE_17E_COLORS = [
    { id: "black17e", hex: "#4a4e51", labelKey: "cmf_color_black17e" },
    { id: "white17e", hex: "#fafafa", labelKey: "cmf_color_white17e" },
    { id: "softPink17e", hex: "#fce7e6", labelKey: "cmf_color_soft_pink17e" },
  ];
  const IPHONE_AIR_COLORS = [
    { id: "spaceBlackAir", hex: "#131313", labelKey: "cmf_color_space_black_air" },
    { id: "cloudWhiteAir", hex: "#fcfcfc", labelKey: "cmf_color_cloud_white_air" },
    { id: "lightGoldAir", hex: "#faf3e5", labelKey: "cmf_color_light_gold_air" },
    { id: "skyBlueAir", hex: "#e5f2fa", labelKey: "cmf_color_sky_blue_air" },
  ];
  // MacBook Neo official finishes (sampled from apple.com.cn store swatches).
  const MACBOOK_NEO_COLORS = [
    { id: "silverNeo", hex: "#e5e6e7", labelKey: "cmf_color_silver_neo" },
    { id: "blushNeo", hex: "#ead5d4", labelKey: "cmf_color_blush_neo" },
    { id: "citrusNeo", hex: "#dddc8c", labelKey: "cmf_color_citrus_neo" },
    { id: "indigoNeo", hex: "#67738b", labelKey: "cmf_color_indigo_neo" },
  ];
  const IPHONE_17_PARTS = [
    { id: "frame", labelKey: "cmf_part_frame" },
    { id: "backGlass", labelKey: "cmf_part_back_glass" },
    { id: "volumeUp", labelKey: "cmf_part_volume_up" },
    { id: "volumeDown", labelKey: "cmf_part_volume_down" },
    { id: "actionButton", labelKey: "cmf_part_action_button" },
    { id: "cameraControl", labelKey: "cmf_part_camera_control" },
    { id: "sideButton", labelKey: "cmf_part_side_button" },
    { id: "simTray", labelKey: "cmf_part_sim_tray" },
    { id: "usbC", labelKey: "cmf_part_usb_c" },
    // No camera-area part: on every one of these phones the plateau and the
    // lens rings are the same anodised body, and Apple sells no contrasting
    // ring. Those meshes follow the frame finish through the shared pass.
  ];
  // The Pro line and the Air ship as Apple's eSIM AR build: no SIM tray.
  const IPHONE_17_PRO_PARTS = IPHONE_17_PARTS.filter((part) => part.id !== "simTray");
  const IPHONE_AIR_PARTS = IPHONE_17_PARTS.filter((part) => part.id !== "simTray");
  // The 17e has neither a SIM tray nor Camera Control.
  const IPHONE_17E_PARTS = IPHONE_17_PARTS
    .filter((part) => part.id !== "simTray" && part.id !== "cameraControl");
  // The folding phone splits differently from the slabs, because it has parts
  // they do not: a hinge spine down the centre and a camera plateau raised off
  // the back. Both are separately painted in the scene, so both are separately
  // paintable here. The material-to-part mapping and the measurements behind
  // it live in assets/cmf/iphone-duo/viewer.js.
  const IPHONE_DUO_PARTS = [
    { id: "frame", labelKey: "cmf_part_frame" },
    { id: "hinge", labelKey: "cmf_part_hinge" },
    { id: "backGlass", labelKey: "cmf_part_back_glass" },
    { id: "cameraPlateau", labelKey: "cmf_part_camera_plateau" },
    { id: "sideButton", labelKey: "cmf_part_side_button" },
  ];
  // Names match the scene's own InteractiveCamera angles; the viewer asks for
  // them by name. Order is the order a finish reads in: front, back, sides.
  const IPHONE_DUO_VIEWS = [
    { name: "front", labelKey: "cmf_view_front" },
    { name: "back", labelKey: "cmf_view_back" },
    { name: "left", labelKey: "cmf_view_side_left" },
    { name: "right", labelKey: "cmf_view_side_right" },
  ];

  // Apple self-service parts that ship in every finish: lid (display
  // assembly), keyboard deck (top case), bottom case, keycaps, USB-C boards.
  const MACBOOK_NEO_PARTS = [
    { id: "lid", labelKey: "cmf_part_lid" },
    { id: "topCase", labelKey: "cmf_part_top_case" },
    { id: "bottomCase", labelKey: "cmf_part_bottom_case" },
    { id: "keycaps", labelKey: "cmf_part_keycaps" },
    { id: "trackpad", labelKey: "cmf_part_trackpad" },
    { id: "usbC", labelKey: "cmf_part_usb_c" },
  ];
  const MATERIAL_PART_ALIASES = Object.freeze({
    frame: "frame",
    frameSide: "frame",
    backGlass: "backGlass",
    volumeUp: "volumeUp",
    volumeDown: "volumeDown",
    actionOrSim: "actionButton",
    cameraControl: "cameraControl",
    sideButton: "sideButton",
    simTray: "simTray",
    usbC: "usbC",
    screwOrSpeaker: "usbC",
    trackpad: "trackpad",
  });
  // Fallback only: the served model already carries the part in its material
  // name. These keep the live view honest if a material name ever goes missing.
  const IPHONE_17_MESH_PARTS = Object.freeze({
    psstnNZmWlkGpGJ: "actionButton",
    aabQdFuOayXiOAy: "volumeUp",
    fQDGdPVinVFkDgA: "volumeDown",
    DRSYKrXjlbGZrGD: "sideButton",
    SdLaeCAiKFeDCSz: "cameraControl",
    ohRsmdOpfcWOasQ: "cameraControl",
    kQtKvBruXjVcFqZ: "cameraControl",
    tXyqmuCYyFmMJhw: "simTray",
  });
  const IPHONE_17_PRO_MESH_PARTS = Object.freeze({
    MurNHnRHsVHWaxp: "actionButton",
    YMhcZuJreIkCuNy: "volumeUp",
    VOwOyTIgUdFOGSH: "volumeDown",
    oKryyXghVaYcnxt: "sideButton",
    LXcFmsoszzDyTrR: "cameraControl",
    VAAxcOWnKYsQZew: "cameraControl",
    AepdVkPZeAmapGK: "cameraControl",
    gCMlCSdRJrizepS: "backGlass",
    vDwikmBvgqpSImF: "backGlass",
  });
  const IPHONE_17E_MESH_PARTS = Object.freeze({
    MNFvcyIPvJHZGho: "actionButton",
    wvehvZgKSiHShKe: "volumeUp",
    grjpZqMAFshUbYL: "volumeDown",
    bAdaiwDyPNSIOTz: "sideButton",
  });
  const IPHONE_AIR_MESH_PARTS = Object.freeze({
    YkCTFFnfNRTcvhu: "actionButton",
    gxvVEZnHDLTMeDu: "volumeUp",
    ZozkCecQqsHKRdW: "volumeDown",
    eFAjqNXqlosYdcs: "sideButton",
    zvTKDcDzjwBqPXl: "cameraControl",
    oeeuEHMiwxuyjiE: "cameraControl",
    mKggmceRYtWVyLb: "cameraControl",
  });
  const MACBOOK_NEO_MESH_PARTS = Object.freeze({
    // lid (display assembly)
    LTxTFlhLWoHyhvo: "lid",
    sGDniMbgLiwHqFw: "lid",
    ZMGnWkiZEPXzRiw: "lid",
    iGKSuTNlIlEGpLp: "lid",
    LUMtYvTEVNmTHoQ: "lid",
    // The display panel stays unmapped so its emissive wallpaper survives.
    // top case (keyboard deck)
    RtqozqWvXTJHuDi: "topCase",
    RGLDQJKTekftnoB: "topCase",
    fylMvyMYpOJcbku: "topCase",
    KMIKFolgYmmmahm: "topCase",
    // Trackpad surface: a separate component that carries its own finish
    // (mirrors the server's exactMeshParts map — the client must agree or the
    // live view can never paint the trackpad color the export honors).
    TJrncXRMBNoKueV: "trackpad",
    RBmsNybhFEScfui: "topCase",
    LhZMVgrGkfDhZnJ: "topCase",
    TaNFpMmKHqePKML: "topCase",
    EXRYTxHqZCxcjZx: "topCase",
    // bottom case
    // Unibody base: the outer shells are the top case (palm rest + sides);
    // only the separate lower panel is the bottom case.
    IYjUsjnVPLevabB: "topCase",
    ubZKAAJmPSUZVHj: "topCase",
    AHewMMzHKsIFykK: "bottomCase",
    JcBLefbhAcSFtfV: "bottomCase",
    // Keycaps: the raised key field only. The bed below and the legend plane
    // above stay with the deck; the hinge-edge strips are never visible.
    AqcQCwqkepkmIxJ: "keycaps",
    ldFDBmejSXToUkP: "topCase",
    qQGZuUUMeRVQGEY: "topCase",
    ymYLIOEGFuqNeyB: "topCase",
    // USB-C boards (right cluster + left cluster)
    // Touch ID is a key, not a port: it takes the keycap finish.
    UDjFocEFPMTxxzE: "keycaps",
    bkNkMexbhfuRgXd: "keycaps",
    uMvgvtrefotcxLA: "keycaps",
    vpFYGndskQCpAiL: "keycaps",
    KwFQtiwiPZcwELa: "usbC",
    MdEwZxJYnatsNEo: "usbC",
    cMzncBRnxGSiixF: "usbC",
    RxQwEeRZjARFsvN: "usbC",
    WWvgVRnfZBeNwpP: "usbC",
    jXEhAmPcGAkgmPq: "usbC",
    WJWxyVsmuaogzKH: "usbC",
    UdgYVXrcknzsfzU: "usbC",
    UgnigMDmuhQEbNc: "usbC",
    GDzFfJLYgiBMTFB: "usbC",
    DrJauNLaRtCxyAy: "usbC",
    bqcaMJZxVDeevNs: "usbC",
    MHkxrMAWDVbaaeW: "usbC",
    hgRUNThRBKzoawn: "usbC",
    ckddmGzikslSSZi: "usbC",
    VFFQHFXIwreyxOW: "usbC",
    BNEVCQcWteGdere: "usbC",
    gOxaRXQOCdmPKSH: "usbC",
  });
  const VIEW_DEFINITIONS = [
    { name: "01-front", labelKey: "cmf_view_front", direction: [0, 0.04, 1], up: [0, 1, 0], frame: 1.08 },
    { name: "02-back", labelKey: "cmf_view_back", direction: [0, 0.04, -1], up: [0, 1, 0], frame: 1.08 },
    { name: "03-rear-hero", labelKey: "cmf_view_rear_hero", direction: [-0.72, 0.42, -1], up: [0, 1, 0], frame: 0.92 },
    { name: "04-front-hero", labelKey: "cmf_view_front_hero", direction: [-0.72, 0.32, 1], up: [0, 1, 0], frame: 0.92 },
    { name: "05-buttons-side", labelKey: "cmf_view_buttons", direction: [-1, 0.02, 0.12], up: [0, 1, 0], frame: 1.02 },
    { name: "06-control-side", labelKey: "cmf_view_control", direction: [1, 0.06, 0.22], up: [0, 1, 0], frame: 1.02 },
    {
      name: "07-camera-close",
      labelKey: "cmf_view_camera",
      direction: [-0.58, 0.38, -1],
      up: [0, 1, 0],
      targetOffset: [0.22, 0.3, -0.28],
      frame: 0.46,
    },
    {
      name: "08-bottom-usb",
      labelKey: "cmf_view_bottom_usb",
      direction: [0.08, -1, -0.35],
      up: [0, 0, 1],
      targetOffset: [0, -0.46, -0.08],
      frame: 0.36,
    },
    {
      name: "09-top-edge",
      labelKey: "cmf_view_top_edge",
      direction: [0.14, 1, -0.38],
      up: [0, 0, -1],
      targetOffset: [0, 0.46, -0.08],
      frame: 0.38,
    },
  ];

  // MacBook Neo has two poses, each with its own camera set. The closed slab
  // shows the lid/bottom/edges; the open L shows the screen and keyboard deck.
  // Close-up targets are fractions of the loaded model's own bounds.
  const MACBOOK_NEO_VIEWS = {
    closed: [
      { name: "01-lid-top", labelKey: "cmf_view_lid_top", direction: [0, 1, 0], up: [0, 0, -1], frame: 1.05 },
      { name: "02-bottom", labelKey: "cmf_view_bottom", direction: [0, -1, 0], up: [0, 0, -1], frame: 1.05 },
      { name: "03-hero-front", labelKey: "cmf_view_hero_front", direction: [-0.55, 0.62, 0.56], up: [0, 1, 0], frame: 1.12 },
      { name: "04-hero-back", labelKey: "cmf_view_hero_back", direction: [0.55, 0.62, -0.56], up: [0, 1, 0], frame: 1.12 },
      { name: "05-side-left", labelKey: "cmf_view_side_left", direction: [-1, 0.08, 0.1], up: [0, 1, 0], frame: 1.34 },
      { name: "06-side-right", labelKey: "cmf_view_side_right", direction: [1, 0.08, 0.1], up: [0, 1, 0], frame: 1.34 },
      { name: "07-front-edge", labelKey: "cmf_view_front_edge", direction: [0, 0.15, 1], up: [0, 1, 0], frame: 1.3 },
      { name: "08-hinge-edge", labelKey: "cmf_view_hinge_edge", direction: [0, 0.15, -1], up: [0, 1, 0], frame: 1.3 },
      { name: "09-ports-close", labelKey: "cmf_view_ports_close", direction: [-1, 0.02, 0.05], up: [0, 1, 0], targetOffset: [-0.486, 0.007, -0.355], frame: 0.42 },
    ],
    open: [
      { name: "01-screen", labelKey: "cmf_view_screen", direction: [0, 0.05, 1], up: [0, 1, 0], frame: 1.1 },
      { name: "02-deck-top", labelKey: "cmf_view_deck_top", direction: [0, 1, 0], up: [0, 0, -1], frame: 1.12 },
      { name: "03-hero-open", labelKey: "cmf_view_hero_open", direction: [-0.6, 0.45, 0.66], up: [0, 1, 0], frame: 1.16 },
      { name: "04-hero-back", labelKey: "cmf_view_hero_back", direction: [0.6, 0.4, -0.68], up: [0, 1, 0], frame: 1.16 },
      { name: "05-side-left", labelKey: "cmf_view_side_left", direction: [-1, 0.12, 0.08], up: [0, 1, 0], frame: 1.3 },
      { name: "06-side-right", labelKey: "cmf_view_side_right", direction: [1, 0.12, 0.08], up: [0, 1, 0], frame: 1.3 },
      { name: "07-keyboard-close", labelKey: "cmf_view_keyboard_close", direction: [0, 0.55, 0.83], up: [0, 0, -1], targetOffset: [0, -0.45, 0.009], frame: 0.42 },
      { name: "08-hinge-close", labelKey: "cmf_view_hinge_close", direction: [0, 0.2, 0.98], up: [0, 1, 0], targetOffset: [0, -0.44, -0.237], frame: 0.44 },
      { name: "09-ports-close", labelKey: "cmf_view_ports_close", direction: [-1, 0.05, 0.08], up: [0, 1, 0], targetOffset: [-0.486, -0.459, -0.13], frame: 0.4 },
    ],
  };

  const IPHONE_17_PRESETS = {
    porcelainCircuit: {
      frame: "black17",
      backGlass: "white17",
      volumeUp: "lavender17",
      volumeDown: "mistBlue17",
      actionButton: "sage17",
      cameraControl: "black17",
      sideButton: "white17",
      simTray: "lavender17",
      usbC: "mistBlue17",
    },
    sageTerminal: {
      frame: "black17",
      backGlass: "sage17",
      volumeUp: "lavender17",
      volumeDown: "mistBlue17",
      actionButton: "white17",
      cameraControl: "lavender17",
      sideButton: "sage17",
      simTray: "black17",
      usbC: "black17",
    },
    mistDraft: {
      frame: "white17",
      backGlass: "mistBlue17",
      volumeUp: "lavender17",
      volumeDown: "sage17",
      actionButton: "black17",
      cameraControl: "lavender17",
      sideButton: "mistBlue17",
      simTray: "white17",
      usbC: "black17",
    },
  };

  const IPHONE_17_PRO_PRESETS = {
    orangeIndex: {
      frame: "cosmicOrange17Pro",
      backGlass: "silver17Pro",
      volumeUp: "deepBlue17Pro",
      volumeDown: "deepBlue17Pro",
      actionButton: "deepBlue17Pro",
      cameraControl: "deepBlue17Pro",
      sideButton: "deepBlue17Pro",
      usbC: "silver17Pro",
    },
    deepBlueMargin: {
      frame: "deepBlue17Pro",
      backGlass: "deepBlue17Pro",
      volumeUp: "silver17Pro",
      volumeDown: "silver17Pro",
      actionButton: "cosmicOrange17Pro",
      cameraControl: "cosmicOrange17Pro",
      sideButton: "silver17Pro",
      usbC: "cosmicOrange17Pro",
    },
    silverProof: {
      frame: "silver17Pro",
      backGlass: "cosmicOrange17Pro",
      volumeUp: "deepBlue17Pro",
      volumeDown: "deepBlue17Pro",
      actionButton: "cosmicOrange17Pro",
      cameraControl: "deepBlue17Pro",
      sideButton: "cosmicOrange17Pro",
      usbC: "deepBlue17Pro",
    },
  };

  const IPHONE_AIR_PRESETS = {
    cloudBinding: {
      frame: "cloudWhiteAir",
      backGlass: "cloudWhiteAir",
      volumeUp: "spaceBlackAir",
      volumeDown: "spaceBlackAir",
      actionButton: "spaceBlackAir",
      cameraControl: "spaceBlackAir",
      sideButton: "spaceBlackAir",
      usbC: "spaceBlackAir",
    },
    goldCaption: {
      frame: "lightGoldAir",
      backGlass: "cloudWhiteAir",
      volumeUp: "lightGoldAir",
      volumeDown: "lightGoldAir",
      actionButton: "spaceBlackAir",
      cameraControl: "spaceBlackAir",
      sideButton: "lightGoldAir",
      usbC: "cloudWhiteAir",
    },
    skyTypeset: {
      frame: "skyBlueAir",
      backGlass: "skyBlueAir",
      volumeUp: "cloudWhiteAir",
      volumeDown: "cloudWhiteAir",
      actionButton: "lightGoldAir",
      cameraControl: "lightGoldAir",
      sideButton: "cloudWhiteAir",
      usbC: "spaceBlackAir",
    },
  };

  const IPHONE_17E_PRESETS = {
    pinkSerif: {
      frame: "softPink17e",
      backGlass: "softPink17e",
      volumeUp: "white17e",
      volumeDown: "white17e",
      actionButton: "black17e",
      sideButton: "white17e",
      usbC: "black17e",
    },
    inkLetterpress: {
      frame: "black17e",
      backGlass: "black17e",
      volumeUp: "softPink17e",
      volumeDown: "softPink17e",
      actionButton: "softPink17e",
      sideButton: "white17e",
      usbC: "white17e",
    },
    whiteFolio: {
      frame: "white17e",
      backGlass: "white17e",
      volumeUp: "black17e",
      volumeDown: "black17e",
      actionButton: "softPink17e",
      sideButton: "black17e",
      usbC: "softPink17e",
    },
  };

  const MACBOOK_NEO_PRESETS = {
    blushLid: {
      lid: "blushNeo",
      topCase: "silverNeo",
      bottomCase: "blushNeo",
      keycaps: "citrusNeo",
      trackpad: "silverNeo",
      usbC: "indigoNeo",
    },
    indigoDeck: {
      lid: "indigoNeo",
      topCase: "indigoNeo",
      bottomCase: "silverNeo",
      keycaps: "citrusNeo",
      trackpad: "indigoNeo",
      usbC: "silverNeo",
    },
    citrusKeys: {
      lid: "silverNeo",
      topCase: "silverNeo",
      bottomCase: "silverNeo",
      keycaps: "citrusNeo",
      trackpad: "blushNeo",
      usbC: "blushNeo",
    },
  };

  // One entry per model the server can recolor. Everything the UI needs to
  // switch devices lives here: palette, parts, presets and preset labels.
  const MODELS = [
    {
      id: "iphone-18-pro",
      asset: "/assets/cmf/iphone-18-pro.usdz",
      // The 18 Pro was the one phone that opened in the vendor's own scene
      // viewer instead of the studio. That made colour and light two systems:
      // the scene carried Apple's environment, and the reader could not drag
      // it, pick a part, or compare two finishes the way every other device
      // works. It now renders in the same interactive renderer as the rest of
      // the line-up, under the same shared EXR environment, with the mesh map
      // below standing in for the scene's material names.
      //
      // Its geometry is authored facing the other way: the studio's back view
      // showed its blank front, which is the one face a finish is never judged
      // from. Every other phone arrives facing the same way, so this is a fact
      // about this asset rather than a rule about the studio.
      spin: Math.PI,
      labelKey: "cmf_model_iphone_18_pro",
      colors: IPHONE_18_PRO_COLORS,
      parts: IPHONE_17_PRO_PARTS,
      presets: Object.fromEntries(IPHONE_18_PRO_COLORS.map((color) => [color.id,
        Object.fromEntries(IPHONE_17_PRO_PARTS.map((part) => [part.id, color.id]))])),
      presetLabelKeys: Object.fromEntries(IPHONE_18_PRO_COLORS.map((color) => [color.id, color.labelKey])),
      meshParts: IPHONE_18_PRO_MESH_PARTS,
    },
    {
      id: "iphone-duo",
      asset: "/assets/cmf/iphone-duo/viewer.html",
      renderer: "lotus",
      motion: "duo",
      labelKey: "cmf_model_iphone_duo",
      colors: IPHONE_DUO_COLORS,
      parts: IPHONE_DUO_PARTS,
      defaultView: "front",
      // Apple's scene carries named camera angles; these four are the ones a
      // finish is judged from, and the viewer sends the settled angle back so
      // the strip cannot stay lit on a view the writer has turned away from.
      views: IPHONE_DUO_VIEWS,
      poses: [
        { id: "closed", labelKey: "cmf_pose_closed" },
        { id: "half", labelKey: "cmf_pose_half" },
        { id: "open", labelKey: "cmf_pose_open" },
      ],
      // A whole-device preset per shipped finish, plus one that is honest
      // about being a studio recipe rather than a colorway Apple sells.
      presets: {
        ...Object.fromEntries(IPHONE_DUO_COLORS.map((color) => [color.id,
          Object.fromEntries(IPHONE_DUO_PARTS.map((part) => [part.id, color.id]))])),
        duoTwoTone: {
          frame: "nightSkyDuo",
          hinge: "nightSkyDuo",
          backGlass: "starWhiteDuo",
          cameraPlateau: "nightSkyDuo",
          sideButton: "nightSkyDuo",
        },
      },
      presetLabelKeys: {
        starWhiteDuo: "cmf_color_star_white_duo",
        nightSkyDuo: "cmf_color_night_sky_duo",
        duoTwoTone: "cmf_preset_duo_two_tone",
      },
    },
    {
      id: "iphone-17-standard",
      asset: "/assets/cmf/iphone-17-standard.usdz",
      labelKey: "cmf_model_iphone_17",
      colors: IPHONE_17_COLORS,
      parts: IPHONE_17_PARTS,
      presets: IPHONE_17_PRESETS,
      presetLabelKeys: {
        porcelainCircuit: "cmf_preset_porcelain",
        sageTerminal: "cmf_preset_sage",
        mistDraft: "cmf_preset_mist",
      },
      meshParts: IPHONE_17_MESH_PARTS,
    },
    {
      id: "iphone-17-pro",
      asset: "/assets/cmf/iphone-17-pro.usdz",
      labelKey: "cmf_model_iphone_17_pro",
      poses: [
        { id: "pro", labelKey: "cmf_pose_pro", asset: "/assets/cmf/iphone-17-pro.usdz" },
        { id: "pro-max", labelKey: "cmf_pose_pro_max", asset: "/assets/cmf/iphone-17-pro-max.usdz" },
      ],
      colors: IPHONE_17_PRO_COLORS,
      parts: IPHONE_17_PRO_PARTS,
      presets: IPHONE_17_PRO_PRESETS,
      presetLabelKeys: {
        orangeIndex: "cmf_preset_orange_index",
        deepBlueMargin: "cmf_preset_deep_blue_margin",
        silverProof: "cmf_preset_silver_proof",
      },
      meshParts: IPHONE_17_PRO_MESH_PARTS,
    },
    {
      id: "iphone-air",
      asset: "/assets/cmf/iphone-air.usdz",
      labelKey: "cmf_model_iphone_air",
      colors: IPHONE_AIR_COLORS,
      parts: IPHONE_AIR_PARTS,
      presets: IPHONE_AIR_PRESETS,
      presetLabelKeys: {
        cloudBinding: "cmf_preset_cloud_binding",
        goldCaption: "cmf_preset_gold_caption",
        skyTypeset: "cmf_preset_sky_typeset",
      },
      meshParts: IPHONE_AIR_MESH_PARTS,
    },
    {
      id: "iphone-17e",
      asset: "/assets/cmf/iphone-17e.usdz",
      labelKey: "cmf_model_iphone_17e",
      colors: IPHONE_17E_COLORS,
      parts: IPHONE_17E_PARTS,
      presets: IPHONE_17E_PRESETS,
      presetLabelKeys: {
        pinkSerif: "cmf_preset_pink_serif",
        inkLetterpress: "cmf_preset_ink_letterpress",
        whiteFolio: "cmf_preset_white_folio",
      },
      meshParts: IPHONE_17E_MESH_PARTS,
    },
    {
      id: "macbook-neo",
      labelKey: "cmf_model_macbook_neo",
      motion: "neo",
      asset: "/assets/cmf/macbook-neo-open.usdz",
      poses: [
        { id: "closed", labelKey: "cmf_pose_closed", asset: "/assets/cmf/macbook-neo-closed.usdz" },
        { id: "half", labelKey: "cmf_pose_half", asset: "/assets/cmf/macbook-neo-open.usdz" },
        { id: "open", labelKey: "cmf_pose_open", asset: "/assets/cmf/macbook-neo-open.usdz" },
      ],
      colors: MACBOOK_NEO_COLORS,
      parts: MACBOOK_NEO_PARTS,
      presets: MACBOOK_NEO_PRESETS,
      presetLabelKeys: {
        blushLid: "cmf_preset_blush_lid",
        indigoDeck: "cmf_preset_indigo_deck",
        citrusKeys: "cmf_preset_citrus_keys",
      },
      meshParts: MACBOOK_NEO_MESH_PARTS,
      views: MACBOOK_NEO_VIEWS,
    },
  ];
  const DEFAULT_MODEL_ID = "iphone-17-standard";
  const MODEL_ALIASES = Object.freeze({ "iphone-17-pro-max": "iphone-17-pro" });

  function canonicalModelId(id) {
    return MODEL_ALIASES[id] || id;
  }

  function modelSpec(id) {
    const canonicalId = canonicalModelId(id);
    return MODELS.find((model) => model.id === canonicalId) || MODELS.find((model) => model.id === DEFAULT_MODEL_ID);
  }

  function activeModel() {
    return modelSpec(recipe?.model || DEFAULT_MODEL_ID);
  }

  function activeColors() {
    return activeModel().colors;
  }

  function activeParts() {
    return activeModel().parts;
  }

  function activePresets() {
    return activeModel().presets;
  }

  function poseSpec(id) {
    const poses = activeModel().poses || [];
    return poses.find((pose) => pose.id === id) || poses[0] || null;
  }

  function activePose() {
    return poseSpec(recipe?.pose)?.id || "closed";
  }

  function activeViews() {
    const model = activeModel();
    // The Duo's view set is the scene's own named camera angles: it does not
    // change with the fold, so it is a plain list rather than a pose map.
    if (model.motion === "duo") return model.views || [];
    if (model.motion === "neo") return [
      { name: "motion", labelKey: "cmf_view_motion", direction: [-0.6, 0.45, 0.66], up: [0, 1, 0], frame: 1.05 },
      ...MACBOOK_NEO_VIEWS.open,
    ];
    const views = model.views?.[activePose()];
    return views || VIEW_DEFINITIONS;
  }

  function activeAssetUrl() {
    const model = activeModel();
    if (model.motion) return model.asset;
    if (model.poses) {
      return (poseSpec(activePose()) || model.poses[0]).asset;
    }
    return model.asset;
  }

  // The first camera set entry is the natural default for a model or pose.
  // A device switch must never keep a view name that does not exist in the
  // new set — applyCmfView would silently no-op and the model would load
  // unframed.
  function defaultViewForActive() {
    return activeModel().defaultView || activeViews()[0]?.name || "";
  }

  function defaultPartsFor(modelId) {
    const spec = modelSpec(modelId);
    return { ...spec.presets[Object.keys(spec.presets)[0]] };
  }

  function serviceRecipeFor(inputRecipe) {
    if (inputRecipe?.model !== "iphone-17-pro") return inputRecipe;
    const serviceModel = inputRecipe.pose === "pro-max" ? "iphone-17-pro-max" : "iphone-17-pro";
    const { pose, ...recipeWithoutPose } = inputRecipe;
    return { ...recipeWithoutPose, model: serviceModel };
  }

  let initialized = false;
  let recipe = defaultRecipe();
  let selectedView = "02-back";
  // The Duo preview lives in the scene's own iframe and answers the pointer
  // itself: it reports the named angle it settled on afterwards, so the strip
  // needs its own "the writer turned this away from a named view" flag.
  let duoViewIsCustom = false;
  let selectedPartId = "frame";
  let modelRefreshTimer = 0;
  let modelRequestId = 0;
  let modelAbortController = null;
  let pendingViewFrame = "";
  let modelRefreshKey = "";
  let modelActiveKey = "";
  let canRenderModel = null;
  let rendererModulesPromise = null;
  let rendererState = null;
  let rendererBuildPromise = null;
  let cameraAnimationFrame = 0;
  let pendingModelSwitch = false;
  let motionFrame = 0;
  let motionPlaying = false;
  let duoFrame = null;
  let duoReady = false;
  let cmfSuspended = false;
  let duoLoadReject = null;
  let duoMessageCleanup = null;
  let cmfBusy = false;
  let duoSequence = 0;
  const duoRequests = new Map();

  function defaultRecipe(modelId = DEFAULT_MODEL_ID, poseId) {
    const spec = modelSpec(modelId);
    const pose = spec.poses ? (poseId || (spec.motion === "duo" ? "half" : spec.poses[0].id)) : undefined;
    return {
      model: spec.id,
      ...(pose ? { pose } : {}),
      ...(spec.motion ? { fold: pose === "open" ? 1 : pose === "half" ? (spec.motion === "duo" ? 1 / 3 : 0.5) : 0 } : {}),
      name: `${spec.id}-cmf-studio`,
      parts: defaultPartsFor(spec.id),
    };
  }

  function cmfEl(id) {
    return document.getElementById(id);
  }

  // The Duo's viewer is a document the studio fetches and injects, not a
  // module the lazy loader stamps for us. An asset served without ?v= keeps a
  // day-long lifetime on the edge, so a release that changes the viewer or the
  // scripts beside it would leave returning visitors on the previous bytes
  // until that expired -- and the previous bytes are a viewer that does not
  // answer the view strip at all. The build stamp the app bundle already
  // carries is what versions this document and every asset it names.
  function withAssetBuildStamp(url) {
    const build = window.AISystem6BuildInfo?.build;
    if (!build || !url || /[?&]v=/.test(url)) return url;
    return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(build)}`;
  }

  function stampViewerDocument(source) {
    const stamped = String(source).replace(
      /\b(href|src)="(\/assets\/[^"?]*)"/g,
      (match, attribute, url) => `${attribute}="${withAssetBuildStamp(url)}"`,
    );
    // The viewer runs in a srcdoc frame, so its base URL is the *parent's* —
    // and the deployed site serves the studio from /go/cmf-studio, which made
    // every relative path the scene names (assets/cmf/... inside the .lsd and
    // .gltf) resolve one directory too deep. That is the deployed site's
    // "this environment cannot load a model": the scene found no textures, and
    // the viewer reported the asset it could not read. The document states its
    // own base instead — the site root, where the assets live — so the frame
    // resolves them the same way the desk does.
    return /<head[^>]*>/i.test(stamped)
      ? stamped.replace(/<head([^>]*)>/i, `<head$1><base href="/">`)
      : stamped;
  }

  function colorMeta(id) {
    const colors = activeColors();
    return colors.find((color) => color.id === id) || colors[0];
  }

  function initCmfStudio() {
    if (initialized) return;
    initialized = true;
    recipe = loadRecipe();
    ensureMotionControlsMarkup();
    ensureCompareMarkup();
    selectedPartId = activeParts()[0].id;
    buildModelControls();
    buildPoseControls();
    buildPartControls();
    buildViewControls();
    bindCmfStudioEvents();
    syncCmfForm();
    syncCompareControls();
    refreshCapabilities();
    setCmfStatus(t("cmf_ready"));
  }

  function ensureMotionControlsMarkup() {
    const target = cmfEl("cmf-motion-controls");
    if (!target || target.childElementCount) return;
    target.innerHTML = `<label class="cmf-control cmf-control-pose" id="cmf-pose-control" hidden><span data-i18n="cmf_pose">Pose</span><span class="select-wrap"><select id="cmf-pose"></select></span></label><label id="cmf-fold-label" for="cmf-fold" data-i18n="cmf_fold">Opening</label><input id="cmf-fold" type="range" min="0" max="1" step="0.001" value="0" disabled><output id="cmf-fold-value" for="cmf-fold">0%</output><button class="btn" type="button" id="cmf-motion-play" data-i18n="cmf_motion_play" disabled>Play</button><button class="btn" type="button" id="cmf-duo-video" data-i18n="cmf_duo_export_video" disabled hidden>Export fold video</button>`;
    // The container class is what gives this strip its one-row layout. Moving
    // the markup here to save boot bytes dropped it once: the strip fell back
    // to stacked block flow, and the pose chooser, the slider, the percentage
    // and Play piled up on separate lines under the preview. The class and the
    // chooser's help text belong to the markup that renders them.
    target.className = "cmf-motion-controls";
    cmfEl("cmf-pose-control")?.setAttribute("data-balloon-help", "balloon_cmf_pose");
    target.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  }

  function renderCmfStudio() {
    initCmfStudio();
    syncCmfForm();
  }

  function bindCmfStudioEvents() {
    cmfEl("cmf-model")?.addEventListener("change", (event) => {
      selectCmfModel(event.target.value);
    });
    cmfEl("cmf-fold")?.addEventListener("input", (event) => {
      // Stopping playback synchronizes controls back to the stored pose.
      // Capture the user's new value before that synchronization runs.
      const progress = Number(event.target.value);
      stopCmfMotion();
      setCmfFold(progress);
    });
    cmfEl("cmf-fold")?.addEventListener("change", (event) => {
      // Some touch and keyboard implementations emit only `change`. Apply
      // the final value here as well so the hinge cannot remain at its old
      // pose after the thumb is released.
      setCmfFold(Number(event.target.value));
      saveRecipe({ quiet: true });
    });
    cmfEl("cmf-fold")?.addEventListener("pointerdown", () => stopCmfMotion());
    cmfEl("cmf-motion-play")?.addEventListener("click", () => {
      if (motionPlaying) { stopCmfMotion(); saveRecipe({ quiet: true }); }
      else animateCmfFold(currentFold() < 0.5 ? 1 : 0);
    });
    cmfEl("cmf-duo-video")?.addEventListener("click", exportDuoVideo);
    cmfEl("cmf-pose")?.addEventListener("change", (event) => {
      selectCmfPose(event.target.value);
    });
    cmfEl("cmf-preset")?.addEventListener("change", (event) => {
      const preset = activePresets()[event.target.value];
      if (!preset) return;
      recipe.parts = { ...recipe.parts, ...preset };
      syncCmfForm();
      refreshCmfPresetControl();
      saveRecipe({ quiet: true });
      updateInteractiveModel();
      setCmfStatus(t("cmf_preset_applied"));
    });
    cmfEl("cmf-hold-a")?.addEventListener("click", () => holdCompareSlot("a"));
    cmfEl("cmf-hold-b")?.addEventListener("click", () => holdCompareSlot("b"));
    cmfEl("cmf-compare-run")?.addEventListener("click", compareHeldRecipes);
    cmfEl("cmf-adopt-a")?.addEventListener("click", () => adoptCompareSlot("a"));
    cmfEl("cmf-adopt-b")?.addEventListener("click", () => adoptCompareSlot("b"));
    cmfEl("cmf-compare-close")?.addEventListener("click", hideCompareStage);
    cmfEl("cmf-shuffle")?.addEventListener("click", shuffleRecipe);
    cmfEl("cmf-reset")?.addEventListener("click", resetRecipe);
    cmfEl("cmf-reset-view")?.addEventListener("click", resetCmfView);
    cmfEl("cmf-export")?.addEventListener("click", exportUsdz);
    cmfEl("cmf-export-views")?.addEventListener("click", exportViewsAsPng);
    cmfEl("cmf-view-strip")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cmf-view]");
      if (!button) return;
      selectCmfView(button.dataset.cmfView);
    });
    cmfEl("cmf-parts")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cmf-part-row]");
      if (!button) return;
      selectedPartId = button.dataset.cmfPartRow || selectedPartId;
      syncCmfForm();
    });
    cmfEl("cmf-palette")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cmf-color-option]");
      if (!button || button.disabled) return;
      recipe.parts[selectedPartId] = button.dataset.cmfColor;
      cmfEl("cmf-preset") && (cmfEl("cmf-preset").value = "");
      syncCmfForm();
      refreshCmfPresetControl();
      saveRecipe({ quiet: true });
      updateInteractiveModel();
    });
    bindRovingGroup(cmfEl("cmf-parts"), "[data-cmf-part-row]", "vertical");
    bindRovingGroup(cmfEl("cmf-palette"), "[data-cmf-color-option]", "horizontal");
    bindRovingGroup(cmfEl("cmf-view-strip"), "[data-cmf-view]", "horizontal");
  }

  function buildPartControls() {
    const target = cmfEl("cmf-parts");
    const palette = cmfEl("cmf-palette");
    if (!target || !palette) return;
    // Rebuilt on every model switch: parts and palette both change.
    if (target.dataset.model === activeModel().id) return;
    target.dataset.model = activeModel().id;
    target.replaceChildren(...activeParts().map((part) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "cmf-part-row";
      row.dataset.cmfPartRow = part.id;
      row.setAttribute("role", "option");

      const text = document.createElement("span");
      text.className = "cmf-part-label";
      text.textContent = t(part.labelKey);

      const current = document.createElement("span");
      current.className = "cmf-part-current";
      const swatch = document.createElement("span");
      swatch.className = "cmf-part-swatch";
      swatch.dataset.cmfSwatch = part.id;
      const currentName = document.createElement("span");
      currentName.dataset.cmfCurrentName = part.id;
      current.append(swatch, currentName);
      const affordance = document.createElement("span");
      affordance.className = "cmf-part-affordance";
      affordance.setAttribute("aria-hidden", "true");
      affordance.textContent = "›";
      row.append(text, current, affordance);
      return row;
    }));
    palette.replaceChildren(...activeColors().map((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cmf-color-chip";
      button.dataset.cmfColorOption = "true";
      button.dataset.cmfColor = color.id;
      button.title = t(color.labelKey);
      button.setAttribute("aria-label", t(color.labelKey));
      const swatch = document.createElement("span");
      swatch.className = "cmf-color-chip-swatch";
      swatch.dataset.cmfColor = color.id;
      const label = document.createElement("span");
      label.textContent = t(color.labelKey);
      button.append(swatch, label);
      return button;
    }));
  }

  function syncCmfForm() {
    syncCmfMotionControls();
    const parts = activeParts();
    const selectedPart = parts.find((part) => part.id === selectedPartId) || parts[0];
    selectedPartId = selectedPart.id;
    const selectedColor = colorMeta(recipe.parts[selectedPart.id]);
    const preset = cmfEl("cmf-preset");
    if (preset && document.activeElement !== preset) preset.value = matchingPresetId() || "";
    refreshCmfPresetControl();
    document.querySelectorAll("[data-cmf-part-row]").forEach((button) => {
      const selected = button.dataset.cmfPartRow === selectedPart.id;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll("[data-cmf-color-option]").forEach((button) => {
      const selected = selectedColor.id === button.dataset.cmfColor;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    updatePartSwatches();
    const summary = cmfEl("cmf-selection-summary");
    if (summary) summary.textContent = `${t(selectedPart.labelKey)} · ${t(selectedColor.labelKey)}`;
  }

  function buildViewControls() {
    const strip = cmfEl("cmf-view-strip");
    if (!strip) return;
    // An empty strip hides itself (`.cmf-view-strip:empty`), so the Duo keeps
    // its named angles instead of losing the strip for being folded.
    const poseKey = `${activeModel().id}:${activePose()}`;
    if (strip.dataset.pose === poseKey) return;
    strip.dataset.pose = poseKey;
    if (!activeViews().some((view) => view.name === selectedView)) {
      selectedView = defaultViewForActive();
    }
    strip.replaceChildren(...activeViews().map((view) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cmf-view-thumb cmf-view-control";
      button.dataset.cmfView = view.name;
      button.setAttribute("aria-pressed", String(view.name === selectedView));
      button.tabIndex = view.name === selectedView ? 0 : -1;
      const label = document.createElement("span");
      label.textContent = t(view.labelKey);
      button.append(label);
      return button;
    }));
  }

  function matchingPresetId() {
    const parts = activeParts();
    return Object.entries(activePresets()).find(([, preset]) => (
      parts.every((part) => recipe.parts[part.id] === preset[part.id])
    ))?.[0] || "";
  }

  /** Rebuild the model and preset dropdowns for the active model. */
  function buildModelControls() {
    const modelSelect = cmfEl("cmf-model");
    if (modelSelect && modelSelect.dataset.ready !== "true") {
      modelSelect.dataset.ready = "true";
      modelSelect.replaceChildren(...MODELS.map((model) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = t(model.labelKey);
        return option;
      }));
    }
    if (modelSelect) modelSelect.value = activeModel().id;

    const presetSelect = cmfEl("cmf-preset");
    if (presetSelect && presetSelect.dataset.model !== activeModel().id) {
      presetSelect.dataset.model = activeModel().id;
      const custom = document.createElement("option");
      custom.value = "";
      custom.textContent = t("cmf_preset_custom");
      presetSelect.replaceChildren(custom, ...Object.keys(activePresets()).map((id) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = t(activeModel().presetLabelKeys[id] || id);
        return option;
      }));
    }
    if (modelSelect && typeof refreshSystemSelectControl === "function") {
      refreshSystemSelectControl(modelSelect);
    }
  }

  /** Rebuild the pose dropdown for models with poses; hide it for phones. */
  function buildPoseControls() {
    const poseSelect = cmfEl("cmf-pose");
    if (!poseSelect) return;
    const poses = activeModel().poses || [];
    const control = poseSelect.closest(".cmf-control");
    if (control) control.hidden = poses.length === 0;
    // One chooser, two jobs: it picks a size on the Pro pair and a form on the
    // MacBook. "Size / pose" named both at once and therefore named neither --
    // a label that has to be read as a menu of itself. Say which one it is.
    const caption = control?.querySelector("span:not(.select-wrap)");
    if (caption) caption.textContent = t(activeModel().motion ? "cmf_pose" : "cmf_size");
    if (poseSelect.dataset.model !== activeModel().id) {
      poseSelect.dataset.model = activeModel().id;
      poseSelect.replaceChildren(...poses.map((pose) => {
        const option = document.createElement("option");
        option.value = pose.id;
        option.textContent = t(pose.labelKey);
        return option;
      }));
    }
    if (typeof initSystemSelectControls === "function") initSystemSelectControls();
    poseSelect.value = activePose();
    if (typeof refreshSystemSelectControl === "function") refreshSystemSelectControl(poseSelect);
  }

  function selectCmfModel(modelId) {
    const spec = modelSpec(modelId);
    if (spec.id === recipe.model) return;
    stopCmfMotion();
    disposeDuoFrame();
    recipe = loadRecipeFor(spec.id);
    selectedPartId = activeParts()[0].id;
    selectedView = defaultViewForActive();
    buildModelControls();
    buildPoseControls();
    buildPartControls();
    buildViewControls();
    syncCmfForm();
    syncCompareControls();
    saveRecipe({ quiet: true });
    // A different device means different geometry, so the model has to be
    // rebuilt server-side — recoloring the materials in place is not enough.
    pendingModelSwitch = true;
    refreshCapabilities();
    setCmfStatus(t("cmf_model_switched"));
  }

  function selectCmfPose(poseId) {
    if (activeModel().motion) {
      if (!poseSpec(poseId)) return;
      animateCmfFold(poseId === "open" ? 1 : poseId === "half" ? (activeModel().motion === "duo" ? 1 / 3 : 0.5) : 0);
      return;
    }
    if (!poseSpec(poseId) || poseId === activePose()) return;
    const spec = activeModel();
    const saved = readStore().recipes[spec.id];
    recipe = defaultRecipe(spec.id, poseId);
    if (saved?.parts) {
      const parts = { ...recipe.parts };
      for (const part of spec.parts) {
        const color = saved.parts[part.id];
        if (spec.colors.some((entry) => entry.id === color)) parts[part.id] = color;
      }
      recipe.parts = parts;
    }
    selectedPartId = activeParts()[0].id;
    selectedView = defaultViewForActive();
    buildPoseControls();
    buildViewControls();
    syncCmfForm();
    saveRecipe({ quiet: true });
    // A different pose is a different asset, so rebuild server-side too.
    pendingModelSwitch = true;
    scheduleModelRender(0);
    setCmfStatus(t("cmf_model_switched"));
  }

  function refreshCmfPresetControl() {
    const preset = cmfEl("cmf-preset");
    if (preset && typeof refreshSystemSelectControl === "function") refreshSystemSelectControl(preset);
  }

  function bindRovingGroup(container, selector, orientation) {
    container?.addEventListener("keydown", (event) => {
      const buttons = [...container.querySelectorAll(selector)].filter((button) => !button.disabled);
      const currentIndex = buttons.indexOf(document.activeElement);
      if (currentIndex < 0) return;
      const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
      const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
      if (![previousKey, nextKey, "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = currentIndex;
      if (event.key === previousKey) nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      if (event.key === nextKey) nextIndex = (currentIndex + 1) % buttons.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = buttons.length - 1;
      buttons[nextIndex]?.focus();
      buttons[nextIndex]?.click();
    });
  }

  function updatePartSwatches() {
    document.querySelectorAll("[data-cmf-swatch]").forEach((swatch) => {
      const part = swatch.dataset.cmfSwatch;
      const color = colorMeta(recipe.parts[part]);
      swatch.dataset.cmfColor = color.id;
      const label = document.querySelector(`[data-cmf-current-name="${part}"]`);
      if (label) label.textContent = t(color.labelKey);
    });
  }

  /**
   * Stored shape is { activeModel, recipes: { <modelId>: recipe } }. A recipe
   * saved by the single-model version is migrated into the iPhone 17 slot.
   */
  function readStore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.recipes && typeof saved.recipes === "object") return saved;
      if (saved?.model && saved.parts) {
        return { activeModel: saved.model, recipes: { [saved.model]: saved } };
      }
    } catch {}
    return { activeModel: DEFAULT_MODEL_ID, recipes: {} };
  }

  function loadRecipeFor(modelId) {
    const rawModelId = String(modelId || DEFAULT_MODEL_ID);
    const spec = modelSpec(rawModelId);
    const legacyPose = rawModelId === "iphone-17-pro-max" ? "pro-max" : undefined;
    const fallback = defaultRecipe(spec.id, legacyPose);
    const store = readStore();
    const saved = store.recipes[spec.id] || (legacyPose ? store.recipes[rawModelId] : null);
    if (!saved?.parts) return fallback;
    // Colors from another model's palette can't apply here; drop them.
    const parts = { ...fallback.parts };
    for (const part of spec.parts) {
      const color = saved.parts[part.id];
      if (spec.colors.some((entry) => entry.id === color)) parts[part.id] = color;
    }
    const pose = spec.poses
      ? (spec.poses.some((entry) => entry.id === (saved.pose || legacyPose)) ? (saved.pose || legacyPose) : spec.poses[0].id)
      : undefined;
    const restored = { ...fallback, ...saved, model: spec.id, ...(pose ? { pose } : {}), parts };
    if (spec.motion) restored.fold = window.AISystem6CMFMotion.clampProgress(saved.fold, pose === "open" ? 1 : pose === "half" ? (spec.motion === "duo" ? 1 / 3 : 0.5) : 0);
    return restored;
  }

  function loadRecipe() {
    return loadRecipeFor(readStore().activeModel || DEFAULT_MODEL_ID);
  }

  function saveRecipe(options = {}) {
    const store = readStore();
    store.activeModel = recipe.model;
    store.recipes[recipe.model] = recipe;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    if (!options.quiet) {
      setCmfStatus(t("cmf_recipe_saved"));
      setStatus?.(t("cmf_recipe_saved"));
      playSystemSound?.("save");
    }
  }

  function resetRecipe() {
    stopCmfMotion();
    // Only the current model resets; other models keep their saved recipes.
    const store = readStore();
    delete store.recipes[recipe.model];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    recipe = defaultRecipe(recipe.model, activePose());
    selectedView = defaultViewForActive();
    selectedPartId = activeParts()[0].id;
    syncCmfForm();
    refreshCmfPresetControl();
    syncViewControls();
    updateInteractiveModel();
    setCmfStatus(t("cmf_reset_done"));
  }

  function shuffleRecipe() {
    // Reshuffle each time the palette is exhausted, so a three-color palette
    // still mixes instead of repeating one fixed stripe order.
    const parts = activeParts();
    let bag = [];
    for (const part of parts) {
      if (!bag.length) bag = shuffleArray(activeColors().map((color) => color.id));
      recipe.parts[part.id] = bag.pop();
    }
    syncCmfForm();
    saveRecipe({ quiet: true });
    updateInteractiveModel();
    setCmfStatus(t("cmf_shuffle_done"));
  }

  function shuffleArray(items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // A static A/B of two finishes, not two live scenes. The whole value of a
  // comparison is seeing the difference, so both stills come out of the one
  // scene, one camera and one environment the studio already has: between the
  // two frames nothing changes but the recipe's colours. "Same viewpoint, same
  // light, same scale" is therefore a property of the method rather than
  // something anyone has to hold steady by hand — the camera is never touched.
  const COMPARE_SLOTS = ["a", "b"];

  // Slots are kept per device model, so there is no such thing as an A from
  // another machine and nothing to restore after adopting: the studio is
  // already on the model the held recipe belongs to.
  function heldRecipes() {
    const slots = readStore().compare?.[recipe.model];
    return { a: slots?.a || null, b: slots?.b || null };
  }

  function holdCompareSlot(slot) {
    const store = readStore();
    const compare = { ...(store.compare || {}) };
    compare[recipe.model] = { ...(compare[recipe.model] || {}), [slot]: { parts: { ...recipe.parts } } };
    store.compare = compare;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    syncCompareControls();
    setCmfStatus(t(slot === "a" ? "cmf_compare_held_a" : "cmf_compare_held_b"));
  }

  function comparePartDifferences(held) {
    return activeParts().filter((part) => held.a.parts?.[part.id] !== held.b.parts?.[part.id]);
  }

  async function compareHeldRecipes() {
    stopCmfMotion();
    const held = heldRecipes();
    if (!held.a || !held.b) { setCmfStatus(t("cmf_compare_need_two")); return; }
    const state = rendererState;
    if (activeModel().renderer === "lotus" || !state?.model || !state.bounds) {
      setCmfStatus(t("cmf_compare_unavailable"));
      return;
    }
    const differences = comparePartDifferences(held);
    if (!differences.length) { setCmfStatus(t("cmf_compare_identical")); return; }
    const live = { ...recipe.parts };
    setBusy(true, t("cmf_comparing"));
    let offscreen = null;
    try {
      offscreen = await createOffscreenRenderer();
      const shots = withOffscreenEnvironment(offscreen, () => {
        const captured = {};
        for (const slot of COMPARE_SLOTS) {
          recipe.parts = { ...live, ...held[slot].parts };
          applyLiveRecipe();
          offscreen.renderer.render(state.scene, state.camera);
          captured[slot] = offscreen.canvas.toDataURL("image/png");
        }
        return captured;
      });
      showCompareStage(shots, held, differences);
      setCmfStatus(t("cmf_compare_done"));
    } catch (error) {
      setCmfStatus(`${t("cmf_compare_failed")} ${error.message}`);
    } finally {
      disposeOffscreenRenderer(offscreen);
      // The live model goes back to what the writer was actually looking at
      // before the comparison borrowed it for two frames.
      recipe.parts = live;
      applyLiveRecipe();
      setBusy(false);
    }
  }

  function ensureCompareMarkup() {
    // A group of its own beside the other command groups, not inside one: the
    // toolbar becomes a two-column grid below 820px, and three more buttons
    // nested in the export stack crushed Reset View, Export USDZ and Export
    // Views to 26px wide with their labels printed over each other.
    const panel = cmfEl("cmf-button-stack-compare") ? null : document.querySelector(".cmf-studio-window .cmf-setup-panel");
    if (panel) {
      const row = document.createElement("div");
      row.className = "cmf-compare-actions";
      row.id = "cmf-button-stack-compare";
      row.innerHTML = '<button class="btn" type="button" id="cmf-hold-a" data-i18n="cmf_compare_hold_a">Hold as A</button><button class="btn" type="button" id="cmf-hold-b" data-i18n="cmf_compare_hold_b">Hold as B</button><button class="btn" type="button" id="cmf-compare-run" data-i18n="cmf_compare_run">Compare A/B</button>';
      panel.append(row);
    }
    const viewport = cmfEl("cmf-model-viewport");
    if (viewport && !cmfEl("cmf-compare-stage")) {
      const stage = document.createElement("div");
      stage.className = "cmf-compare-stage";
      stage.id = "cmf-compare-stage";
      stage.hidden = true;
      stage.innerHTML = COMPARE_SLOTS.map((slot) => `<figure class="cmf-compare-shot"><img id="cmf-compare-image-${slot}" alt=""><figcaption><b>${slot.toUpperCase()}</b> <span id="cmf-compare-caption-${slot}"></span></figcaption><button class="btn" type="button" id="cmf-adopt-${slot}" data-i18n="cmf_compare_adopt">Adopt</button></figure>`).join("")
        + '<button class="btn default cmf-compare-close" type="button" id="cmf-compare-close" data-i18n="cmf_compare_close">Done</button>';
      viewport.append(stage);
    }
    document.querySelectorAll("#cmf-button-stack-compare [data-i18n], #cmf-compare-stage [data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  }

  function compareCaption(held, slot, differences) {
    return differences.map((part) => `${t(part.labelKey)} ${t(colorMeta(held[slot].parts?.[part.id]).labelKey)}`).join(" · ");
  }

  function showCompareStage(shots, held, differences) {
    const stage = cmfEl("cmf-compare-stage");
    if (!stage) return;
    COMPARE_SLOTS.forEach((slot) => {
      const image = cmfEl(`cmf-compare-image-${slot}`);
      if (image) image.src = shots[slot];
      const caption = cmfEl(`cmf-compare-caption-${slot}`);
      if (caption) caption.textContent = compareCaption(held, slot, differences);
    });
    stage.hidden = false;
  }

  function hideCompareStage() {
    const stage = cmfEl("cmf-compare-stage");
    if (!stage || stage.hidden) return;
    // The two stills are full-size PNGs held as data URLs. Drop them on the
    // way out rather than keeping two frames of a device nobody is looking at.
    COMPARE_SLOTS.forEach((slot) => { const image = cmfEl(`cmf-compare-image-${slot}`); if (image) image.removeAttribute("src"); });
    stage.hidden = true;
  }

  function adoptCompareSlot(slot) {
    const held = heldRecipes()[slot];
    if (!held) return;
    hideCompareStage();
    recipe.parts = { ...recipe.parts, ...held.parts };
    syncCmfForm();
    refreshCmfPresetControl();
    saveRecipe({ quiet: true });
    updateInteractiveModel();
    setCmfStatus(t("cmf_compare_adopted"));
  }

  function syncCompareControls() {
    const held = heldRecipes();
    COMPARE_SLOTS.forEach((slot) => {
      const button = cmfEl(`cmf-hold-${slot}`);
      if (!button) return;
      button.classList.toggle("is-held", Boolean(held[slot]));
      button.setAttribute("aria-pressed", String(Boolean(held[slot])));
    });
    const run = cmfEl("cmf-compare-run");
    if (run) run.disabled = cmfBusy || !held.a || !held.b;
  }

  // A hung capabilities probe must not leave the preview in an eternal
  // "Loading…" state: after the timeout the feature degrades to the
  // unavailable state like any other fetch failure.
  const CAPABILITIES_TIMEOUT_MS = 8000;

  function currentFold() {
    return window.AISystem6CMFMotion.clampProgress(recipe.fold);
  }

  function syncCmfMotionControls() {
    const motion = activeModel().motion;
    const bar = cmfEl("cmf-motion-controls");
    const hasPose = Boolean(activeModel().poses?.length);
    if (bar) bar.hidden = !motion && !hasPose;
    const poseControl = cmfEl("cmf-pose-control");
    if (poseControl) poseControl.hidden = !hasPose;
    const videoButton = cmfEl("cmf-duo-video");
    if (videoButton) {
      // The fold video belongs to the folding phone, and it belongs on the same
      // row as Play: it is the other thing Play can produce.
      videoButton.hidden = motion !== "duo";
      videoButton.disabled = motion !== "duo" || !duoReady || cmfBusy;
    }
    const ready = motion === "duo" ? duoReady : rendererState?.modelId === recipe.model;
    const slider = cmfEl("cmf-fold");
    if (slider) {
      slider.value = String(currentFold());
      slider.hidden = !motion;
      slider.disabled = cmfBusy || !ready || !motion;
      slider.dataset.capabilityDisabled = String(!ready);
      slider.setAttribute("aria-valuetext", t("cmf_fold_value").replace("{percent}", String(Math.round(currentFold() * 100))));
    }
    const output = cmfEl("cmf-fold-value");
    if (output) {
      output.hidden = !motion;
      output.textContent = `${Math.round(currentFold() * 100)}%`;
    }
    const foldLabel = cmfEl("cmf-fold-label");
    if (foldLabel) foldLabel.hidden = !motion;
    const play = cmfEl("cmf-motion-play");
    if (play) {
      play.hidden = !motion;
      play.textContent = t(motionPlaying ? "cmf_motion_pause" : "cmf_motion_play");
      play.disabled = cmfBusy || !ready;
      play.dataset.capabilityDisabled = String(!ready);
    }
  }

  function stopCmfMotion() {
    window.cancelAnimationFrame(motionFrame);
    motionFrame = 0;
    motionPlaying = false;
    syncCmfMotionControls();
  }

  function setCmfFold(value) {
    const spec = activeModel();
    if (!spec.motion) return;
    recipe.fold = window.AISystem6CMFMotion.clampProgress(value);
    recipe.pose = recipe.fold <= 0.001 ? "closed" : recipe.fold >= 0.999 ? "open" : "half";
    const poseSelect = cmfEl("cmf-pose");
    if (poseSelect && poseSelect.value !== recipe.pose) {
      poseSelect.value = recipe.pose;
      if (typeof refreshSystemSelectControl === "function") refreshSystemSelectControl(poseSelect);
    }
    if (spec.motion === "duo") sendDuo("fold", { progress: recipe.fold });
    else if (rendererState?.modelId === spec.id && rendererState.model) {
      window.AISystem6CMFMotion.applyNeo(rendererState.model, recipe.fold);
      rendererState.bounds = new rendererState.modules.Box3().setFromObject(rendererState.model);
      rendererState.poseId = recipe.pose;
      renderModelFrame();
    }
    syncCmfMotionControls();
  }

  function animateCmfFold(target) {
    if (!activeModel().motion) return;
    stopCmfMotion();
    const from = currentFold();
    const to = window.AISystem6CMFMotion.clampProgress(target);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(to - from) < 0.001) {
      setCmfFold(to);
      saveRecipe({ quiet: true });
      return;
    }
    const modelId = recipe.model;
    const start = performance.now();
    const duration = Math.max(350, Math.abs(to - from) * 1800);
    motionPlaying = true;
    function tick(now) {
      if (recipe.model !== modelId || !motionPlaying) return;
      const p = Math.min(1, (now - start) / duration);
      const easing = activeModel().motion === "neo"
        ? window.AISystem6CMFMotion.neoEaseProgress
        : window.AISystem6CMFMotion.easeProgress;
      setCmfFold(from + (to - from) * easing(p));
      if (p < 1) motionFrame = window.requestAnimationFrame(tick);
      else { stopCmfMotion(); saveRecipe({ quiet: true }); }
    }
    motionFrame = window.requestAnimationFrame(tick);
    syncCmfMotionControls();
  }

  function sendDuo(type, data = {}) {
    if (!duoFrame || !duoReady) return;
    duoFrame.contentWindow?.postMessage({ channel: "ai6-cmf-duo", type, ...data }, window.location.origin);
  }

  function disposeDuoFrame() {
    duoLoadReject?.(new DOMException("Model changed", "AbortError"));
    duoLoadReject = null;
    duoMessageCleanup?.();
    duoMessageCleanup = null;
    duoReady = false;
    for (const request of duoRequests.values()) request.reject(new DOMException("Model changed", "AbortError"));
    duoRequests.clear();
    duoFrame?.remove();
    duoFrame = null;
  }

  async function renderDuoModel(requestId, signal) {
    stopModelAnimationLoop();
    disposeDuoFrame();
    const canvas = cmfEl("cmf-model-canvas");
    if (canvas) canvas.hidden = true;
    const empty = cmfEl("cmf-preview-empty");
    if (empty) { empty.hidden = false; empty.textContent = t("cmf_model_loading"); }
    if (rendererState) {
      // Sweep by scene membership, not by the committed slot: handing the pane
      // to the Duo frame has to leave the WebGL scene empty, and an interrupted
      // load can have parented a model the committed slot never names.
      for (const loaded of rendererState.loadedModels || []) {
        rendererState.scene.remove(loaded);
        disposeModel(loaded);
      }
      rendererState.loadedModels?.clear();
      if (rendererState.model) {
        rendererState.scene.remove(rendererState.model);
        disposeModel(rendererState.model);
      }
      rendererState.model = null;
      rendererState.modelId = "";
      rendererState.framedModelId = "";
    }
    syncCmfMotionControls();
    try {
      const response = await fetch(withAssetBuildStamp(activeModel().viewer || activeAssetUrl()), { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const documentSource = await response.text();
      if (requestId !== modelRequestId) return;
      const frame = document.createElement("iframe");
      frame.className = "cmf-duo-frame";
      frame.title = t(activeModel().labelKey);
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
      // This is our bundled document, with absolute self-hosted asset URLs.
      // srcdoc isolates Lotus globals and uses the existing application CSP.
      frame.srcdoc = stampViewerDocument(documentSource);
      duoFrame = frame;
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => finish(new Error(t("cmf_model_failed"))), 60000);
        const finish = (error) => {
          window.clearTimeout(timeout);
          duoLoadReject = null;
          if (error) { window.removeEventListener("message", onMessage); reject(error); }
          else resolve();
        };
        function onMessage(event) {
          if (event.source !== frame.contentWindow || event.origin !== window.location.origin || event.data?.channel !== "ai6-cmf-duo") return;
          if (duoFrame !== frame) { window.removeEventListener("message", onMessage); return; }
          const message = event.data;
          if (message.type === "ready") { duoReady = true; finish(); }
          if (message.type === "angle") applyDuoAngle(message.angle);
          if (message.type === "error") {
            duoReady = false;
            syncCmfMotionControls();
            finish(new Error(message.message || t("cmf_model_failed")));
          }
          if (message.type === "snapshot") {
            const request = duoRequests.get(message.id);
            if (request) {
              duoRequests.delete(message.id);
              message.blob?.size ? request.resolve(message.blob) : request.reject(new Error(t("cmf_export_views_failed")));
            }
          }
          if (message.type === "video" || message.type === "video-error") {
            const request = duoRequests.get(message.id);
            if (request) {
              duoRequests.delete(message.id);
              message.type === "video" && message.blob?.size ? request.resolve(message) : request.reject(new Error(message.message || t("cmf_duo_video_failed")));
            }
          }
        }
        duoLoadReject = (error) => { window.removeEventListener("message", onMessage); finish(error); };
        duoMessageCleanup = () => window.removeEventListener("message", onMessage);
        window.addEventListener("message", onMessage);
        frame.addEventListener("load", () => {
          if (duoFrame !== frame) window.removeEventListener("message", onMessage);
        });
        cmfEl("cmf-model-viewport")?.append(frame);
      });
      if (requestId !== modelRequestId) return;
      if (empty) empty.hidden = true;
      if (activeModel().motion) setCmfFold(currentFold());
      else sendDuo("view", { name: selectedView });
      updateInteractiveModel();
      syncCmfMotionControls();
      setCmfStatus(t(activeModel().motion ? "cmf_motion_ready" : "cmf_official_ready"));
      if (cmfSuspended) sendDuo("suspend");
    } catch (error) {
      if (requestId === modelRequestId && error.name !== "AbortError") {
        const message = cmfModelFailureMessage(error);
        setCmfStatus(message);
        if (empty) empty.textContent = message;
      }
    } finally {
      if (requestId === modelRequestId) setModelRefreshing(false);
    }
  }

  function snapshotDuo() {
    if (!duoReady) return Promise.reject(new Error(t("cmf_export_views_unavailable")));
    const id = ++duoSequence;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => { duoRequests.delete(id); reject(new Error(t("cmf_export_views_failed"))); }, 15000);
      duoRequests.set(id, {
        resolve: (blob) => { window.clearTimeout(timeout); resolve(blob); },
        reject: (error) => { window.clearTimeout(timeout); reject(error); },
      });
      sendDuo("snapshot", { id });
    });
  }

  function recordDuoVideo(durationMs = 5500) {
    if (!duoReady) return Promise.reject(new Error(t("cmf_export_views_unavailable")));
    const id = ++duoSequence;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => { duoRequests.delete(id); reject(new Error(t("cmf_duo_video_failed"))); }, durationMs + 20000);
      duoRequests.set(id, {
        resolve: (message) => { window.clearTimeout(timeout); resolve(message); },
        reject: (error) => { window.clearTimeout(timeout); reject(error); },
      });
      sendDuo("record", { id, durationMs });
    });
  }

  async function exportDuoVideo() {
    setBusy(true, t("cmf_duo_exporting_video"));
    try {
      const result = await recordDuoVideo();
      const saved = window.AISystem6WebPlatform.saveArtifact({ blob: result.blob, fileName: `${recipe.name}-fold.webm`, mimeType: result.mime || "video/webm" });
      setCmfStatus(t(saved ? "cmf_duo_video_done" : "cmf_export_download_failed"));
    } catch (error) { setCmfStatus(`${t("cmf_duo_video_failed")} ${error.message}`); }
    finally { setBusy(false); }
  }

  async function exportDuoViews() {
    const previous = currentFold();
    setBusy(true, t("cmf_exporting_views"));
    try {
      let saved = true;
      const views = activeModel().motion === "duo" ? [["closed", 0], ["half", 1 / 3], ["open", 1]] : activeViews().map(view => [view.name, null]);
      for (const [name, progress] of views) {
        if (progress === null) sendDuo("view", { name });
        else setCmfFold(progress);
        const blob = await snapshotDuo();
        if (!window.AISystem6WebPlatform.saveArtifact({ blob, fileName: `${recipe.name}-${name}.png`, mimeType: "image/png" })) saved = false;
      }
      setCmfStatus(t(saved ? "cmf_export_views_done" : "cmf_export_views_download_failed"));
    } catch (error) {
      setCmfStatus(`${t("cmf_export_views_failed")} ${error.message}`);
    } finally {
      if (activeModel().motion === "duo") setCmfFold(previous);
      else sendDuo("view", { name: selectedView });
      setBusy(false);
    }
  }

  async function refreshCapabilities() {
    const requestedModel = recipe.model;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CAPABILITIES_TIMEOUT_MS);
    let canExport = false;
    let available = false;
    try {
      const assetResponse = await fetch(activeAssetUrl(), {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });
      available = assetResponse.ok;
    } catch {
      available = false;
    }
    try {
      const response = await window.AISystem6Capabilities.requestService("cmf.capabilities", {
        init: { cache: "no-store", signal: controller.signal },
      });
      const data = await response.json();
      canExport = Boolean(data.canExport);
    } catch {
      canExport = false;
    }
    if (recipe.model !== requestedModel) { window.clearTimeout(timer); return; }
    canRenderModel = available;
    // Every shipped USDZ can be exported locally; Lotus scenes cannot be sent
    // through the USD-only fallback service.
    canExport = activeModel().motion !== "duo" && (canRenderModel || canExport);
    const label = canRenderModel ? t("cmf_cap_ready") : t("cmf_cap_missing");
    const el = cmfEl("cmf-capabilities");
    if (el) el.textContent = label;
    if (cmfEl("cmf-reset-view")) {
      cmfEl("cmf-reset-view").dataset.capabilityDisabled = String(!canRenderModel);
      cmfEl("cmf-reset-view").disabled = !canRenderModel;
    }
    if (cmfEl("cmf-export")) {
      cmfEl("cmf-export").dataset.capabilityDisabled = String(!canExport);
      cmfEl("cmf-export").disabled = !canExport;
      cmfEl("cmf-export").title = activeModel().motion === "duo" ? t("cmf_duo_usdz_unavailable") : "";
    }
    if (cmfEl("cmf-export-views")) {
      cmfEl("cmf-export-views").dataset.capabilityDisabled = String(!canRenderModel);
      cmfEl("cmf-export-views").disabled = !canRenderModel;
    }
    const empty = cmfEl("cmf-preview-empty");
    syncCmfMotionControls();
    if (empty) empty.textContent = canRenderModel ? t("cmf_model_loading") : t("cmf_preview_unavailable");
    window.clearTimeout(timer);
    if (canRenderModel) scheduleModelRender(0);
  }

  function loadRendererModules() {
    if (!rendererModulesPromise) {
      rendererModulesPromise = import(RENDERER_VENDOR_URL);
    }
    return rendererModulesPromise;
  }

  async function ensureRenderer() {
    if (rendererState) return rendererState;
    // Three.js loads lazily, so the guard above and the assignment below sit on
    // either side of an await. Two calls that arrive during that window both
    // get past it and build a second renderer, OrbitControls and animation
    // loop on the same canvas. Share the one build in flight instead.
    if (!rendererBuildPromise) {
      rendererBuildPromise = buildRenderer().finally(() => {
        rendererBuildPromise = null;
      });
    }
    return rendererBuildPromise;
  }

  // The one light every interactive model is lit by. It is the same EXR the
  // official scene names, copied out of that model's asset bundle so eight
  // devices can share one studio instead of reaching into a ninth's uploads.
  const ENVIRONMENT_URL = "/assets/cmf/environment/studio.exr";

  async function buildEnvironment(modules, renderer) {
    const generator = new modules.PMREMGenerator(renderer);
    generator.compileEquirectangularShader();
    try {
      const texture = await new modules.EXRLoader().loadAsync(ENVIRONMENT_URL);
      const target = generator.fromEquirectangular(texture);
      texture.dispose();
      return target.texture;
    } catch {
      // A browser without EXR support still needs something reflective, or
      // every anodised finish collapses to grey. A synthetic room is the
      // wrong room, which is visibly better than no room at all.
      return generator.fromScene(new modules.RoomEnvironment(), 0.04).texture;
    } finally {
      generator.dispose();
    }
  }

  async function buildRenderer() {
    const modules = await loadRendererModules();
    const canvas = cmfEl("cmf-model-canvas");
    const viewport = cmfEl("cmf-model-viewport");
    if (!canvas || !viewport) throw new Error(t("cmf_model_surface_missing"));

    const renderer = new modules.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = modules.SRGBColorSpace;
    // Apple's product scene renders with ACESFilmic at exposure 1 and sRGB
    // output (renderer.toneMapping 4 in its .lsd). Matching it is half of
    // matching the look; the other half is the environment below.
    renderer.toneMapping = modules.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(0x000000, 0);

    const scene = new modules.Scene();
    const camera = new modules.OrthographicCamera(-1, 1, 1, -1, 0.001, 1000);

    // No analytic lights. Apple's scene has none either: one `Environment`
    // script pointing at an EXR, envMapIntensity 1, no rotation, and that is
    // the whole rig. Three lights plus a synthetic room was this viewport's
    // own invention, and it is why the enclosures read as chrome rather than
    // as anodised aluminium — a metal has no diffuse term, so every one of
    // those lights was a specular smear on top of an environment that was
    // already doing the work badly.
    const environment = await buildEnvironment(modules, renderer);
    scene.environment = environment;

    const controls = new modules.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minZoom = 0.35;
    controls.maxZoom = 8;
    controls.listenToKeyEvents(canvas);

    rendererState = {
      modules,
      renderer,
      scene,
      camera,
      controls,
      viewport,
      canvas,
      model: null,
      // Every device model currently parented to the scene. One slot per
      // commit is not enough: see the sweep in renderInteractiveModel.
      loadedModels: new Set(),
      framedModelId: "",
      modelId: "",
      poseId: "",
      bounds: null,
      viewHalfHeight: 1,
      viewIsCustom: false,
    };

    controls.addEventListener("start", () => {
      window.cancelAnimationFrame(cameraAnimationFrame);
      rendererState.viewIsCustom = true;
      syncViewControls();
    });
    controls.addEventListener("change", renderModelFrame);
    const resizeObserver = new ResizeObserver(resizeModelViewport);
    resizeObserver.observe(viewport);
    rendererState.resizeObserver = resizeObserver;
    resizeModelViewport();
    startModelAnimationLoop();
    return rendererState;
  }

  // Per-model lighting used to mean per-model light rigs, because the phone
  // rig's key light sat below the deck and lit the MacBook from underneath.
  // With one environment and no analytic lights there is nothing to aim: the
  // studio surrounds the model, so a lid that opens upward and a phone lying
  // on its back are both lit correctly by the same texture. Only the rotation
  // is model business — Neo is authored Y-up, and turning the studio with it
  // keeps the softbox over the lid instead of off its left shoulder.
  function configureModelLighting(state, modelId) {
    const neo = modelId === "macbook-neo";
    state.scene.environmentIntensity = 1;
    state.scene.environmentRotation?.set(0, neo ? Math.PI / 2 : 0, 0);
    state.renderer.toneMappingExposure = 1;
  }

  // The damping loop is a real rAF every frame for as long as the renderer
  // lives, so suspending has to take the loop off the renderer — not just skip
  // work inside it. Kept as one named pair so resume reinstalls the same loop.
  function startModelAnimationLoop() {
    const state = rendererState;
    if (!state) return;
    state.renderer.setAnimationLoop(() => {
      if (state.canvas.closest(".window")?.classList.contains("is-hidden")) return;
      if (state.controls.update()) renderModelFrame();
    });
  }

  function stopModelAnimationLoop() {
    window.cancelAnimationFrame(cameraAnimationFrame);
    cameraAnimationFrame = 0;
    rendererState?.renderer.setAnimationLoop(null);
  }

  // A window that is collapsed, WindowShaded or not laid out yet measures
  // zero, and the aspect ratio computed from it is not merely imprecise, it is
  // 1/height -- a number small enough to frame the device at a few percent of
  // the pane. That bad frame then persists after the window opens, because
  // nothing re-frames a view the camera already believes it is at.
  function viewportMeasurable() {
    const state = rendererState;
    if (!state) return false;
    const rect = state.viewport.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2;
  }

  function resizeModelViewport() {
    const state = rendererState;
    if (!state) return;
    const rect = state.viewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    state.renderer.setSize(width, height, false);
    updateCameraFrustum(state.viewHalfHeight);
    // A frame deferred while the pane had no size is owed one now.
    if (pendingViewFrame && viewportMeasurable()) {
      const name = pendingViewFrame;
      pendingViewFrame = "";
      applyCmfView(name, { animate: false });
      return;
    }
    renderModelFrame();
  }

  function updateCameraFrustum(halfHeight) {
    const state = rendererState;
    if (!state) return;
    const rect = state.viewport.getBoundingClientRect();
    const aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    state.viewHalfHeight = Math.max(halfHeight || state.viewHalfHeight, 0.001);
    state.camera.left = -state.viewHalfHeight * aspect;
    state.camera.right = state.viewHalfHeight * aspect;
    state.camera.top = state.viewHalfHeight;
    state.camera.bottom = -state.viewHalfHeight;
    state.camera.updateProjectionMatrix();
  }

  function renderModelFrame() {
    if (activeModel().renderer === "lotus") return;
    const state = rendererState;
    if (!state) return;
    state.renderer.render(state.scene, state.camera);
  }

  function updateInteractiveModel() {
    // Two stills of a recipe nobody is editing any more would go stale the
    // moment a colour changes underneath them, so an edit closes the pair.
    hideCompareStage();
    if (activeModel().renderer === "lotus") {
      sendDuo("colors", { parts: recipe.parts, colors: Object.fromEntries(activeParts().map((part) => [part.id, colorMeta(recipe.parts[part.id]).hex])) });
      return;
    }
    if (activeModel().motion === "neo" && rendererState?.modelId === recipe.model) setCmfFold(currentFold());
    if (applyLiveRecipe()) {
      setModelRefreshing(false);
      setCmfStatus(t("cmf_model_live"));
      return;
    }
    scheduleModelRender(0);
  }

  function applyLiveRecipe(model = rendererState?.model) {
    if (!model) return 0;
    // Never paint one device (or pose) in another's finishes: if the loaded
    // model is not the recipe's model+pose (a switch that failed, or one still
    // loading), report no live update so the caller rebuilds instead.
    if (rendererState && rendererState.modelId && (
      rendererState.modelId !== recipe.model || (!activeModel().motion && rendererState.poseId !== (recipe.pose || "closed"))
    )) return 0;
    let changedMaterials = 0;
    model.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        const match = String(material.name || "").match(
          /__(frameSide|frame|backGlass|volumeUp|volumeDown|actionOrSim|cameraControl|sideButton|simTray|usbC|screwOrSpeaker|cameraPlate|lid|topCase|bottomCase|keycaps|trackpad)_[^/]+$/,
        );
        const partId = material.userData?.cmfPart || (match ? (MATERIAL_PART_ALIASES[match[1]] || match[1]) : "");
        const color = partId ? colorMeta(recipe.parts[partId]) : null;
        if (!color || !material.color?.set) return;
        material.color.set(color.hex);
        material.needsUpdate = true;
        changedMaterials += 1;
      });
    });
    if (changedMaterials) renderModelFrame();
    return changedMaterials;
  }

  function prepareLiveMaterials(model, globalBounds) {
    const state = rendererState;
    if (!state || !model || !globalBounds) return;
    model.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      sourceMaterials.filter(Boolean).forEach((material) => {
        // Three r184 can expand indexed USD st1 coordinates incorrectly. The
        // affected maps are baked occlusion atlases, so letting WebGL sample
        // them paints unrelated component silhouettes across the enclosure.
        // Keep the real mesh and its color/normal/roughness maps, but omit the
        // invalid supplemental AO instead of displaying corrupt surface data.
        if (material.aoMap && (material.aoMap.channel > 0 || object.geometry?.getAttribute("uv1"))) {
          material.aoMap = null;
          material.aoMapIntensity = 0;
        }
        if (material.transparent) material.depthWrite = false;
        // A lit display is emissive over a black dielectric. At grazing angles
        // that dielectric's Fresnel term climbs toward 1 and, under this
        // viewport's plain studio lighting, lays a flat grey veil over the
        // wallpaper (measured: colour saturation 0.43 head-on, 0.27 off-axis).
        // Damp the specular so the screen keeps its picture; a trace is left so
        // it does not read as matte paper.
        if (material.emissiveMap && "specularIntensity" in material) {
          material.specularIntensity = SCREEN_SPECULAR_INTENSITY;
        }
        // The MacBook's panel also ships a 0.25 clearcoat. That varnish is a
        // separate lobe the line above cannot reach, and at envMapIntensity 1 it
        // mirrored the studio back as the grey wash the demo kept showing. Leave
        // the trace an anti-glare coating really has.
        if (material.emissiveMap && "clearcoat" in material && material.clearcoat > SCREEN_CLEARCOAT) {
          material.clearcoat = SCREEN_CLEARCOAT;
        }
        // The viewport grades the enclosure through ACES Filmic so aluminium and
        // anodising read like a product shot. A lit display is not a surface
        // being lit — it is a light source showing an already-graded picture, and
        // the film curve rolled its highlights toward white and pulled the
        // saturation out, which is the washed-out screen the demo kept showing.
        // Opt the panel out of the curve so the wallpaper renders as authored.
        if (material.emissiveMap) material.toneMapped = false;
        material.needsUpdate = true;
      });
      const namedPart = sourceMaterials
        .map((material) => String(material?.name || "").match(
          /__(frameSide|frame|backGlass|volumeUp|volumeDown|actionOrSim|cameraControl|sideButton|simTray|usbC|screwOrSpeaker|cameraPlate|lid|topCase|bottomCase|keycaps|trackpad)_[^/]+$/,
        ))
        .find(Boolean);
      const partId = (namedPart ? (MATERIAL_PART_ALIASES[namedPart[1]] || namedPart[1]) : "")
        || activeModel().meshParts[object.name]
        || classifyLiveMesh(object, globalBounds);
      if (!partId || !Object.prototype.hasOwnProperty.call(recipe.parts, partId)) return;
      // The server already refuses to recolor black trim (lens glass and rings,
      // display bezels, antenna lines). Live recoloring has to agree, or the
      // viewport would paint what the export leaves alone.
      if (!namedPart && sourceMaterials.some(isBlackTrim)) return;

      const ownedMaterials = sourceMaterials.map((material) => {
        const owned = material.clone();
        owned.userData = { ...material.userData, cmfPart: partId };
        if (owned.aoMap) {
          owned.aoMap = null;
          owned.aoMapIntensity = 0;
        }
        if (activeModel().id === "macbook-neo" && ["lid", "topCase", "bottomCase", "trackpad"].includes(partId)) {
          // Keep a satin aluminium response: broad highlights still describe
          // the enclosure, but no chalky diffuse veil over the anodising.
          owned.metalness = Math.max(owned.metalness, 0.8);
          owned.roughness = Math.min(owned.roughness, 0.32);
        }
        if (owned.transparent) owned.depthWrite = false;
        return owned;
      });
      object.material = Array.isArray(object.material) ? ownedMaterials : ownedMaterials[0];
    });
  }

  /** Trim Apple authors as true black: never a finish surface. */
  function isBlackTrim(material) {
    if (!material?.color?.getHSL) return false;
    if (material.map || material.emissiveMap) return false;
    const { r, g, b } = material.color;
    return (r * 0.299 + g * 0.587 + b * 0.114) < 0.035;
  }

  function classifyLiveMesh(object, globalBounds) {
    const state = rendererState;
    if (!state) return "";
    const bounds = new state.modules.Box3().setFromObject(object);
    if (bounds.isEmpty()) return "";
    const size = bounds.getSize(new state.modules.Vector3());
    const center = bounds.getCenter(new state.modules.Vector3());
    const globalSize = globalBounds.getSize(new state.modules.Vector3());
    const leftEdge = globalBounds.min.x + globalSize.x * 0.08;
    const rightEdge = globalBounds.max.x - globalSize.x * 0.08;
    const topEdge = globalBounds.max.y - globalSize.y * 0.22;
    const bottomEdge = globalBounds.min.y + globalSize.y * 0.08;
    const nearSide = center.x < leftEdge || center.x > rightEdge;
    const sideControl = nearSide
      && size.x < globalSize.x * 0.08
      && size.z < globalSize.z * 0.35
      && size.y > globalSize.y * 0.035
      && size.y < globalSize.y * 0.18;
    if (sideControl) return "";

    const bottomPart = center.y < bottomEdge
      && size.z < globalSize.z * 0.35
      && size.y < globalSize.y * 0.06;
    if (bottomPart && size.x > globalSize.x * 0.25) return "usbC";
    if (bottomPart && size.x > globalSize.x * 0.05) return "usbC";

    const backGlass = Math.abs(center.x) < globalSize.x * 0.12
      && center.z < globalBounds.min.z + globalSize.z * 0.38
      && size.x > globalSize.x * 0.72
      && size.y > globalSize.y * 0.75;
    if (backGlass) return "backGlass";

    const sideFrame = nearSide
      && size.y > globalSize.y * 0.45
      && size.z > globalSize.z * 0.45;
    if (sideFrame) return "frame";

    const mainFrame = Math.abs(center.x) < globalSize.x * 0.12
      && size.x > globalSize.x * 0.88
      && size.y > globalSize.y * 0.85
      && size.z > globalSize.z * 0.18;
    if (mainFrame) return "frame";

    const cameraArea = center.y > topEdge
      && center.x > globalBounds.min.x + globalSize.x * 0.45
      && size.x > globalSize.x * 0.12
      && size.y > globalSize.y * 0.08;
    return cameraArea ? "cameraPlate" : "";
  }

  function modelRenderKey() {
    const model = activeModel();
    return `${model.id}|${model.renderer || "usd"}|${activeAssetUrl()}|${model.motion ? "motion" : activePose()}`;
  }

  function scheduleModelRender(delay = 0) {
    if (canRenderModel === false) {
      window.clearTimeout(modelRefreshTimer);
      modelRefreshTimer = 0;
      modelRefreshKey = "";
      modelRequestId += 1;
      modelAbortController?.abort();
      modelAbortController = null;
      modelActiveKey = "";
      setModelRefreshing(false);
      setCmfStatus(t("cmf_ready"));
      return;
    }
    const nextKey = modelRenderKey();
    // Capability refresh and form sync can both request the same asset during
    // startup. Coalesce those requests instead of aborting the first download
    // before it has had a chance to finish.
    if (modelRefreshKey === nextKey && modelRefreshTimer) return;
    if (modelActiveKey === nextKey && modelAbortController) return;
    window.clearTimeout(modelRefreshTimer);
    modelRefreshTimer = 0;
    modelRefreshKey = "";
    if (modelAbortController) modelAbortController.abort();
    const requestId = modelRequestId + 1;
    modelRequestId = requestId;
    modelAbortController = null;
    modelActiveKey = "";
    modelRefreshKey = nextKey;
    setModelRefreshing(true);
    setCmfStatus(t(activeModel().renderer === "lotus" ? "cmf_model_loading" : "cmf_model_rendering"));
    modelRefreshTimer = window.setTimeout(() => {
      modelRefreshTimer = 0;
      modelRefreshKey = "";
      renderInteractiveModel(requestId, nextKey);
    }, delay);
  }

  function cancelModelRender() {
    window.clearTimeout(modelRefreshTimer);
    modelRefreshTimer = 0;
    modelRefreshKey = "";
    modelRequestId += 1;
    modelAbortController?.abort();
    modelAbortController = null;
    modelActiveKey = "";
    setModelRefreshing(false);
  }

  // Prefer the static source USDZ and recolor it in the browser; fall back to
  // the server export only when the asset is missing or unreachable (VPS/Mac
  // can also serve the recolored model, but the browser path removes the
  // server-side render dependency for the live preview).
  async function loadModelAsset(requestedRecipe, signal) {
    try {
      const assetResponse = await fetch(activeAssetUrl(), { signal });
      if (assetResponse.ok) return assetResponse;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // Fall through to the server path below.
    }
    return window.AISystem6Capabilities.requestService("cmf.exportUsdz", {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: serviceRecipeFor(activeModel().motion === "neo" ? { ...requestedRecipe, pose: "open" } : requestedRecipe) }),
        signal,
      },
    });
  }

  async function renderInteractiveModel(requestId, renderKey) {
    if (requestId !== modelRequestId) return;
    const controller = new AbortController();
    modelAbortController = controller;
    modelActiveKey = renderKey;
    if (activeModel().renderer === "lotus") {
      try {
        await renderDuoModel(requestId, controller.signal);
      } finally {
        if (requestId === modelRequestId && modelAbortController === controller) {
          modelAbortController = null;
          modelActiveKey = "";
        }
      }
      return;
    }
    disposeDuoFrame();
    const requestedRecipe = JSON.parse(JSON.stringify(recipe));
    try {
      const [state, response] = await Promise.all([
        ensureRenderer(),
        loadModelAsset(requestedRecipe, controller.signal),
      ]);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || response.statusText || `HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      if (requestId !== modelRequestId) return;

      // The returned group is only geometry; the callback waits for textures.
      // Preparing materials earlier misses the asynchronously attached screen
      // emissiveMap and clones enclosure materials before their maps exist.
      const nextModel = await new Promise((resolve, reject) => {
        // CMF renders the actual recolored USDZ in the browser.
        // new state.modules.USDLoader().parse(buffer)
        new state.modules.USDLoader().parse(buffer, "", resolve, reject);
      });
      // A device whose own art faces the other way is turned here, before the
      // bounds are taken, so framing, orbiting and every named view agree about
      // which side the studio is looking at.
      const spin = modelSpec(requestedRecipe.model).spin;
      if (spin) nextModel.rotation.y += spin;
      nextModel.updateMatrixWorld(true);
      const nextBounds = new state.modules.Box3().setFromObject(nextModel);
      if (nextBounds.isEmpty()) {
        disposeModel(nextModel);
        throw new Error(t("cmf_model_empty"));
      }
      if (requestId !== modelRequestId) {
        disposeModel(nextModel);
        return;
      }

      const previousModel = state.model;
      configureModelLighting(state, requestedRecipe.model);
      prepareLiveMaterials(nextModel, nextBounds);
      state.scene.add(nextModel);
      state.loadedModels.add(nextModel);
      state.model = nextModel;
      state.modelId = requestedRecipe.model;
      state.motionBounds = null;
      state.poseId = requestedRecipe.pose || "closed";
      state.bounds = nextBounds;
      if (activeModel().motion === "neo") {
        const allBounds = new state.modules.Box3();
        for (const value of [0, 0.5, 1]) {
          window.AISystem6CMFMotion.applyNeo(nextModel, value);
          allBounds.union(new state.modules.Box3().setFromObject(nextModel));
        }
        state.motionBounds = allBounds;
        window.AISystem6CMFMotion.applyNeo(nextModel, currentFold());
        state.bounds = new state.modules.Box3().setFromObject(nextModel);
      }
      applyLiveRecipe(nextModel);
      // A load that gets interrupted can still finish its parse and add its own
      // model to the scene, so the scene can hold more than one device at a time
      // and removing only the single predecessor would strand the other there
      // forever. Remove every model that is not the one just committed.
      const hadPreviousModel = Boolean(previousModel);
      for (const loaded of state.loadedModels) {
        if (loaded === nextModel) continue;
        state.loadedModels.delete(loaded);
        state.scene.remove(loaded);
        disposeModel(loaded);
      }
      state.canvas.hidden = false;
      startModelAnimationLoop();
      syncCmfMotionControls();
      const empty = cmfEl("cmf-preview-empty");
      if (empty) empty.hidden = true;
      // A different device is a different size, so re-frame it the way a first
      // load would instead of keeping the previous device's camera distance.
      // A load that is overtaken can consume the switch flag before the winning
      // load commits, so the decision also asks which device the camera is
      // actually framed for.
      if (!hadPreviousModel || pendingModelSwitch || state.framedModelId !== state.modelId) {
        pendingModelSwitch = false;
        state.framedModelId = state.modelId;
        state.viewIsCustom = false;
        syncViewControls();
        applyCmfView(selectedView, { animate: false });
        // Coming back from a Lotus device, this canvas was hidden until the
        // line above, so the frame may have been deferred against a pane that
        // could not be measured. The resize observer will not rescue it -- the
        // pane never changed size, only what was drawn into it -- so measure
        // here, which pays any frame the deferral is still holding.
        if (pendingViewFrame) resizeModelViewport();
      } else {
        renderModelFrame();
      }
      setCmfStatus(t("cmf_model_done"));
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (requestId === modelRequestId) {
        const message = cmfModelFailureMessage(error);
        setCmfStatus(message);
        if (!rendererState?.model) {
          const empty = cmfEl("cmf-preview-empty");
          if (empty) {
            empty.hidden = false;
            empty.textContent = message;
          }
        }
        playSystemSound?.("alert");
      }
    } finally {
      if (requestId === modelRequestId && modelAbortController === controller) {
        modelAbortController = null;
        modelActiveKey = "";
        setModelRefreshing(false);
      }
    }
  }

  function disposeModel(model) {
    model?.traverse((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        Object.values(material).forEach((value) => value?.isTexture && value.dispose());
        material.dispose?.();
      });
    });
  }

  function selectCmfView(name) {
    if (!activeViews().some((view) => view.name === name)) return;
    selectedView = name;
    setViewIsCustom(false);
    syncViewControls();
    applyCmfView(name, { animate: true });
    if (typeof updateMenuState === "function") updateMenuState();
  }

  function resetCmfView() {
    // On the Duo this is also the way back from a drag: the scene's own
    // camera answers the pointer, so a turned device needs a named angle to
    // return to. The fold angle stays the pose chooser's business.
    if (!selectedView) selectedView = "02-back";
    setViewIsCustom(false);
    syncViewControls();
    applyCmfView(selectedView, { animate: true });
  }

  function syncViewControls() {
    document.querySelectorAll("[data-cmf-view]").forEach((button) => {
      const selected = !viewIsCustom() && button.dataset.cmfView === selectedView;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = button.dataset.cmfView === selectedView ? 0 : -1;
    });
  }

  function viewIsCustom() {
    if (activeModel().motion === "duo") return duoViewIsCustom;
    return Boolean(rendererState?.viewIsCustom);
  }

  function setViewIsCustom(value) {
    if (activeModel().motion === "duo") duoViewIsCustom = value;
    else if (rendererState) rendererState.viewIsCustom = value;
  }

  /** The Duo viewer reports the named angle the pointer settled on. */
  function applyDuoAngle(angle) {
    if (!angle || activeModel().motion !== "duo") return;
    // The scene offers corners the studio does not list (frontLeft, say). An
    // angle outside our set means no listed view is current any more.
    const known = activeViews().some((view) => view.name === angle);
    if (known) selectedView = angle;
    duoViewIsCustom = !known;
    syncViewControls();
  }

  function applyCmfView(name, options = {}) {
    if (activeModel().renderer === "lotus") { sendDuo("view", { name }); return; }
    const state = rendererState;
    const view = activeViews().find((item) => item.name === name);
    if (!state?.model || !state.bounds || !view) return;
    // Framing against a zero-sized pane bakes a 1/height aspect into the
    // camera and leaves the device a few pixels tall. Owe the frame instead;
    // resizeModelViewport pays it the moment the pane has a size.
    if (!viewportMeasurable()) {
      pendingViewFrame = name;
      return;
    }

    const { Vector3 } = state.modules;
    const bounds = name === "motion" && state.motionBounds ? state.motionBounds : state.bounds;
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const targetOffset = view.targetOffset || [0, 0, 0];
    const target = center.clone().add(new Vector3(
      targetOffset[0] * size.x,
      targetOffset[1] * size.y,
      targetOffset[2] * size.z,
    ));
    const direction = new Vector3(...view.direction).normalize();
    const up = new Vector3(...view.up).normalize();
    const right = new Vector3().crossVectors(up, direction).normalize();
    const trueUp = new Vector3().crossVectors(direction, right).normalize();
    const rect = state.viewport.getBoundingClientRect();
    // The pane this fit is computed against. A resize to a different size
    // leaves that frame stale, so resizeModelViewport re-frames it.
    const aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    let halfWidth = 0;
    let halfHeight = 0;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const local = new Vector3(x, y, z).sub(target);
          halfWidth = Math.max(halfWidth, Math.abs(local.dot(right)));
          halfHeight = Math.max(halfHeight, Math.abs(local.dot(trueUp)));
        }
      }
    }
    const nextHalfHeight = Math.max(halfHeight, halfWidth / aspect) * 1.14 * view.frame;
    const distance = Math.max(size.length() * 2.6, 1);
    const position = target.clone().add(direction.multiplyScalar(distance));
    const animate = options.animate !== false && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    animateCameraTo(position, target, up, nextHalfHeight, animate);
  }

  function animateCameraTo(position, target, up, halfHeight, animate) {
    const state = rendererState;
    if (!state) return;
    window.cancelAnimationFrame(cameraAnimationFrame);
    const startPosition = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const startUp = state.camera.up.clone();
    const startHalfHeight = state.viewHalfHeight;
    const startZoom = state.camera.zoom;
    const startedAt = performance.now();
    const duration = animate ? 360 : 0;

    const step = (now) => {
      const progress = duration ? Math.min((now - startedAt) / duration, 1) : 1;
      const eased = 1 - Math.pow(1 - progress, 3);
      state.camera.position.lerpVectors(startPosition, position, eased);
      state.controls.target.lerpVectors(startTarget, target, eased);
      state.camera.up.lerpVectors(startUp, up, eased).normalize();
      state.camera.zoom = startZoom + (1 - startZoom) * eased;
      updateCameraFrustum(startHalfHeight + (halfHeight - startHalfHeight) * eased);
      state.camera.lookAt(state.controls.target);
      state.camera.updateMatrixWorld();
      state.controls.update();
      renderModelFrame();
      if (progress < 1) cameraAnimationFrame = window.requestAnimationFrame(step);
    };
    // An unanimated move is a placement, not an animation, so it must not wait
    // for a frame callback. requestAnimationFrame does not fire while the tab
    // is in the background or the window is hidden, and a device loaded in
    // that state was left at the camera's initial position -- at the origin,
    // inside the enclosure, where an orthographic frustum slices the model
    // into the folded chrome ribbon this looked like a broken mesh for.
    if (!duration) step(startedAt);
    else cameraAnimationFrame = window.requestAnimationFrame(step);
  }

  function setModelRefreshing(refreshing) {
    const panel = document.querySelector(".cmf-preview-panel");
    panel?.classList.toggle("is-refreshing", refreshing);
    panel?.setAttribute("aria-busy", String(refreshing));
    const indicator = cmfEl("cmf-live-indicator");
    if (indicator) {
      indicator.dataset.state = refreshing ? "loading" : "ready";
      indicator.textContent = t(refreshing ? "cmf_model_updating" : activeModel().motion ? "cmf_model_motion" : activeModel().renderer === "lotus" ? "cmf_model_official" : "cmf_model_interactive");
    }
  }

  function buildBrowserExportRecipe() {
    const spec = activeModel();
    return {
      modelId: spec.id,
      pose: spec.poses ? activePose() : undefined,
      ...(spec.motion === "neo" ? { fold: currentFold() } : {}),
      parts: recipe.parts,
      colors: activeColors().map(({ id, hex }) => ({ id, hex })),
      exactMeshParts: spec.meshParts || {},
      exactOnly: spec.id === "macbook-neo",
      slug: recipe.name || `${spec.id}-cmf`,
    };
  }

  function exportFileName() {
    const name = String(recipe.name || "iphone-17-standard-cmf")
      .trim()
      .replace(/\.usdz$/i, "");
    return `${name || "cmf-studio"}.usdz`;
  }

  async function exportUsdzBrowser() {
    const exporter = window.AISystem6CMFUsdzExport;
    if (!exporter) throw new Error(t("cmf_export_failed") || "Browser USDZ exporter is unavailable.");
    const assetResponse = await fetch(activeAssetUrl(), { cache: "force-cache" });
    if (!assetResponse.ok) throw new Error(assetResponse.statusText || `HTTP ${assetResponse.status}`);
    const buffer = await assetResponse.arrayBuffer();
    const result = await exporter.exportUsdz({
      buffer,
      recipe: buildBrowserExportRecipe(),
    });
    // The model itself built fine at this point; saveArtifact's own dispatch
    // result is a separate, later thing that can still refuse (e.g. no File
    // constructor) - the caller must not claim "exported" over that without
    // triggering an unrelated server-side retry.
    return window.AISystem6WebPlatform.saveArtifact({
      blob: result.blob,
      fileName: exportFileName(),
      mimeType: "model/vnd.usdz+zip",
    });
  }

  async function exportUsdz() {
    if (activeModel().motion === "duo") { setCmfStatus(t("cmf_duo_usdz_unavailable")); return; }
    stopCmfMotion();
    setBusy(true, t("cmf_exporting"));
    setCmfControlLoading("cmf-export", true, t("cmf_exporting"));
    try {
      let saved;
      try {
        saved = await exportUsdzBrowser();
      } catch (error) {
        if (activeModel().motion) throw error;
        // Static deployments own the source asset and the browser exporter.
        // Local/VPS deployments can still fall through to the Node engine.
        const response = await window.AISystem6Capabilities.requestService("cmf.exportUsdz", {
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipe: serviceRecipeFor(recipe) }),
          },
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || data.error || response.statusText || `HTTP ${response.status}`);
        }
        const blob = await response.blob();
        saved = window.AISystem6WebPlatform.saveArtifact({
          blob,
          fileName: exportFileName(),
          mimeType: "model/vnd.usdz+zip",
        });
      }
      // The model built fine either way; only claim "exported" once
      // saveArtifact's own dispatch actually confirms it.
      setCmfStatus(saved ? t("cmf_export_done") : t("cmf_export_download_failed"));
      if (saved) playSystemSound?.("save");
    } catch (error) {
      setCmfStatus(`${t("cmf_export_failed")} ${error.message}`);
      playSystemSound?.("alert");
    } finally {
      setCmfControlLoading("cmf-export", false);
      setBusy(false);
    }
  }

  function cameraPoseForView(view) {
    const state = rendererState;
    const { Vector3 } = state.modules;
    const center = state.bounds.getCenter(new Vector3());
    const size = state.bounds.getSize(new Vector3());
    const offset = view.targetOffset || [0, 0, 0];
    const target = center.clone().add(new Vector3(
      offset[0] * size.x,
      offset[1] * size.y,
      offset[2] * size.z,
    ));
    const direction = new Vector3(...view.direction).normalize();
    const up = new Vector3(...view.up).normalize();
    const right = new Vector3().crossVectors(up, direction).normalize();
    const trueUp = new Vector3().crossVectors(direction, right).normalize();
    const rect = state.viewport.getBoundingClientRect();
    const aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    let halfWidth = 0;
    let halfHeight = 0;
    for (const x of [state.bounds.min.x, state.bounds.max.x]) {
      for (const y of [state.bounds.min.y, state.bounds.max.y]) {
        for (const z of [state.bounds.min.z, state.bounds.max.z]) {
          const local = new Vector3(x, y, z).sub(target);
          halfWidth = Math.max(halfWidth, Math.abs(local.dot(right)));
          halfHeight = Math.max(halfHeight, Math.abs(local.dot(trueUp)));
        }
      }
    }
    const nextHalfHeight = Math.max(halfHeight, halfWidth / aspect) * 1.14 * view.frame;
    const distance = Math.max(size.length() * 2.6, 1);
    return {
      position: target.clone().add(direction.multiplyScalar(distance)),
      target,
      up,
      halfHeight: nextHalfHeight,
    };
  }

  function snapCamera(pose) {
    const state = rendererState;
    state.camera.position.copy(pose.position);
    state.controls.target.copy(pose.target);
    state.camera.up.copy(pose.up).normalize();
    state.camera.zoom = 1;
    updateCameraFrustum(pose.halfHeight);
    state.camera.lookAt(state.controls.target);
    state.camera.updateMatrixWorld();
    state.controls.update();
    renderModelFrame();
  }

  // The studio's whole look is one environment map and no analytic lights, so
  // a metal with no environment has nothing to reflect and renders black. That
  // map is a PMREM render target living in the live renderer's GL context: a
  // second renderer cannot borrow it, and every frame exported through one came
  // out as a black silhouette on transparency. The offscreen renderer therefore
  // builds the same environment in its own context, and the caller lends it to
  // the scene for exactly as long as it is rendering.
  async function createOffscreenRenderer() {
    const state = rendererState;
    const rect = state.viewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * 2));
    const height = Math.max(1, Math.round(rect.height * 2));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const renderer = new state.modules.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = state.modules.SRGBColorSpace;
    renderer.toneMapping = state.renderer.toneMapping;
    renderer.toneMappingExposure = state.renderer.toneMappingExposure;
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height, false);
    const environment = await buildEnvironment(state.modules, renderer);
    return { renderer, canvas, environment };
  }

  // The swap has to be invisible to the live preview, which is repainting on
  // its own rAF loop: everything between lending and returning the environment
  // runs in one synchronous task, so no frame is ever composited with the
  // foreign map. That is also why the stills are read as data URLs here and
  // turned into blobs afterwards -- toBlob's callback would end the task.
  function withOffscreenEnvironment(offscreen, capture) {
    const state = rendererState;
    const previous = state.scene.environment;
    state.scene.environment = offscreen.environment;
    try {
      return capture();
    } finally {
      state.scene.environment = previous;
    }
  }

  function disposeOffscreenRenderer(offscreen) {
    offscreen?.environment?.dispose?.();
    offscreen?.renderer.dispose();
  }

  function dataUrlToPngBlob(dataUrl) {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: "image/png" });
  }

  // Browser-side WebGL multi-view export: the view presets already drive the
  // live preview, so each view is re-framed synchronously and read back from
  // the canvas as a PNG. This removes the server software-rasterizer dependency
  // for the public/Pages deployment.
  async function exportViewsAsPng() {
    stopCmfMotion();
    if (activeModel().renderer === "lotus") { await exportDuoViews(); return; }
    const state = rendererState;
    if (!state?.model || !state.bounds) {
      setCmfStatus(t("cmf_export_views_unavailable"));
      return;
    }
    setBusy(true, t("cmf_exporting_views"));
    const previousView = selectedView;
    try {
      const views = activeViews();
      const offscreen = await createOffscreenRenderer();
      let allSaved = true;
      const shots = withOffscreenEnvironment(offscreen, () => views.map((view) => {
        snapCamera(cameraPoseForView(view));
        offscreen.renderer.render(state.scene, state.camera);
        return [view.name, offscreen.canvas.toDataURL("image/png")];
      }));
      for (const [name, dataUrl] of shots) {
        const saved = window.AISystem6WebPlatform.saveArtifact({
          blob: dataUrlToPngBlob(dataUrl),
          fileName: `${recipe.name || activeModel().id}-${name}.png`,
          mimeType: "image/png",
        });
        if (!saved) allSaved = false;
      }
      disposeOffscreenRenderer(offscreen);
      // Every frame rendered fine either way; only claim "exported" once
      // every saveArtifact dispatch actually confirmed.
      setCmfStatus(allSaved ? t("cmf_export_views_done") : t("cmf_export_views_download_failed"));
      if (allSaved) playSystemSound?.("save");
    } catch (error) {
      setCmfStatus(`${t("cmf_export_views_failed")} ${error.message}`);
      playSystemSound?.("alert");
    } finally {
      if (previousView) applyCmfView(previousView, { animate: false });
      setBusy(false);
    }
  }

  function setCmfControlLoading(id, loading, label = "") {
    const control = cmfEl(id);
    if (!control) return;
    if (typeof setControlLoading === "function") {
      setControlLoading(control, loading, label);
      return;
    }
    control.toggleAttribute("aria-busy", loading);
    control.dataset.loading = String(loading);
    if (label) control.dataset.loadingLabel = label;
  }

  function setBusy(busy, message = "") {
    cmfBusy = busy;
    if (busy) stopCmfMotion();
    document.querySelectorAll("[data-cmf-color-option], [data-cmf-part-row]").forEach((button) => { button.disabled = busy; });
    ["cmf-shuffle", "cmf-reset", "cmf-reset-view", "cmf-export", "cmf-export-views", "cmf-fold", "cmf-motion-play", "cmf-model", "cmf-pose", "cmf-preset", "cmf-hold-a", "cmf-hold-b", "cmf-compare-run"].forEach((id) => {
      const button = cmfEl(id);
      if (button) button.disabled = busy || button.dataset.capabilityDisabled === "true";
    });
    document.querySelectorAll("[data-cmf-color-option]").forEach((button) => {
      button.disabled = busy;
    });
    syncCmfMotionControls();
    // Compare stays disabled until two recipes are actually held, so it must
    // be decided after the blanket re-enable above, not by it.
    syncCompareControls();
    if (message) setCmfStatus(message);
  }

  function setCmfStatus(message) {
    const el = cmfEl("cmf-status");
    if (el) el.textContent = message;
  }

  function cmfModelFailureMessage(error) {
    const prefix = String(t("cmf_model_failed") || "Model update failed.").trim();
    const base = prefix.replace(/[:：]\s*$/, "");
    const detail = String(error?.message || "").trim();
    if (!detail || detail === base || detail === prefix) {
      return `${base}${/[.!。！？]$/.test(base) ? "" : "。"}`;
    }
    if (detail.toLocaleLowerCase().startsWith(base.toLocaleLowerCase())) return detail;
    return `${prefix} ${detail}`;
  }

  // A hidden CMF Studio keeps a WebGL context, a loaded model and a per-frame
  // damping loop alive. Suspend stops the loop and the in-flight render; the
  // scene stays built, so coming back is one repaint rather than a reload.
  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("cmfStudio", {
    onSuspend: () => {
      cmfSuspended = true;
      stopCmfMotion();
      sendDuo("suspend");
      if (activeModel().renderer === "lotus") return;
      stopModelAnimationLoop();
      cancelModelRender();
    },
    onResume: () => {
      cmfSuspended = false;
      if (activeModel().renderer === "lotus") { sendDuo("resume"); return; }
      if (!rendererState) return;
      startModelAnimationLoop();
      resizeModelViewport();
      renderModelFrame();
    },
    onDispose: () => {
      stopCmfMotion();
      disposeDuoFrame();
      stopModelAnimationLoop();
      cancelModelRender();
      const state = rendererState;
      if (!state) return;
      rendererState = null;
      state.resizeObserver?.disconnect();
      state.controls?.dispose?.();
      // Dispose every model the scene still holds, not just the committed one:
      // an interrupted load can have left more than one parented here.
      for (const model of state.loadedModels || []) disposeModel(model);
      state.loadedModels?.clear();
      if (state.model) disposeModel(state.model);
      state.renderer?.dispose?.();
    },
  });

  window.AISystem6CMFStudioLoaded = true;
  window.renderCmfStudio = renderCmfStudio;
  window.AISystem6CMFStudio = Object.freeze({
    cancelRender: cancelModelRender,
    // Empty once the camera has been dragged away from a named view, so the
    // three View rows mark nothing rather than naming a view the model is
    // no longer at.
    currentView: () => (rendererState?.viewIsCustom ? "" : selectedView || ""),
    runMenuCommand(command) {
      // Keys must match action.slice("cmf-".length) — the registered ids are
      // "cmf-save-recipe" and "cmf-export-usdz", not "cmf-save"/"cmf-export",
      // so "save"/"export" here never matched and both menu items silently
      // did nothing.
      const commands = {
        "save-recipe": () => saveRecipe(),
        "export-usdz": exportUsdz,
        shuffle: shuffleRecipe,
        reset: resetRecipe,
        "reset-view": resetCmfView,
        "export-views": exportViewsAsPng,
        "view-front": () => selectCmfView("01-front"),
        "view-back": () => selectCmfView("02-back"),
        "view-side": () => selectCmfView("05-buttons-side"),
      };
      return commands[command]?.();
    },
  });
  const CMF_STUDIO_COMMAND_NAMES = [
    "cmf-save-recipe",
    "cmf-export-usdz",
    "cmf-shuffle",
    "cmf-reset",
    "cmf-reset-view",
    "cmf-export-views",
    "cmf-view-front",
    "cmf-view-back",
    "cmf-view-side",
  ];

  function cmfStudioCommandAvailable(action) {
    if (action === "open-cmf-studio") return true;
    if (cmfBusy) return false;
    const activeWindow = document.querySelector(".window.is-active");
    if (activeWindow?.dataset.window !== "cmfStudio") return false;
    if (action === "cmf-view-front") {
      return !!document.querySelector('[data-cmf-view="01-front"]');
    }
    if (action === "cmf-view-back") {
      return !!document.querySelector('[data-cmf-view="02-back"]');
    }
    if (action === "cmf-view-side") {
      return !!document.querySelector('[data-cmf-view="05-buttons-side"]');
    }
    return true;
  }

  window.AISystem6Runtime?.registerApplication({
    id: "cmfStudio",
    windowName: "cmfStudio",
    mount: renderCmfStudio,
    restore: renderCmfStudio,
    commands: Object.fromEntries(
      ["open-cmf-studio", ...CMF_STUDIO_COMMAND_NAMES].map((action) => {
        const handler = action === "open-cmf-studio"
          ? () => openWindow("cmfStudio")
          : () => window.AISystem6CMFStudio.runMenuCommand(action.slice("cmf-".length));
        return [action, {
          handler,
          isAvailable: () => cmfStudioCommandAvailable(action),
        }];
      })
    ),
  });
  // No path check here. `/cmf-studio` opened this window until 2026-09-11; the
  // one entry is /go/cmf-studio, and the ?launch= it redirects to is read once
  // at boot by app/core/launch-intent.js for every standalone app alike.
})();
