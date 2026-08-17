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
  const RENDERER_VENDOR_URL = "/app/vendor/cmf-renderer.js?v=three-0.184.0-uv-channel-cache";
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
      id: "iphone-17-pro-max",
      asset: "/assets/cmf/iphone-17-pro-max.usdz",
      labelKey: "cmf_model_iphone_17_pro_max",
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
      poses: [
        { id: "closed", labelKey: "cmf_pose_closed", asset: "/assets/cmf/macbook-neo-closed.usdz" },
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
  const DEFAULT_MODEL_ID = MODELS[0].id;

  function modelSpec(id) {
    return MODELS.find((model) => model.id === id) || MODELS[0];
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
    const views = activeModel().views?.[activePose()];
    return views || VIEW_DEFINITIONS;
  }

  function activeAssetUrl() {
    const model = activeModel();
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
    return activeViews()[0]?.name || "";
  }

  function defaultPartsFor(modelId) {
    const spec = modelSpec(modelId);
    return { ...spec.presets[Object.keys(spec.presets)[0]] };
  }

  let initialized = false;
  let recipe = defaultRecipe();
  let selectedView = "02-back";
  let selectedPartId = "frame";
  let modelRefreshTimer = 0;
  let modelRequestId = 0;
  let modelAbortController = null;
  let canRenderModel = null;
  let rendererModulesPromise = null;
  let rendererState = null;
  let rendererBuildPromise = null;
  let cameraAnimationFrame = 0;
  let pendingModelSwitch = false;

  function defaultRecipe(modelId = DEFAULT_MODEL_ID, poseId) {
    const spec = modelSpec(modelId);
    const pose = spec.poses ? (poseId || spec.poses[0].id) : undefined;
    return {
      model: spec.id,
      ...(pose ? { pose } : {}),
      name: `${spec.id}-cmf-studio`,
      parts: defaultPartsFor(spec.id),
    };
  }

  function cmfEl(id) {
    return document.getElementById(id);
  }

  function colorMeta(id) {
    const colors = activeColors();
    return colors.find((color) => color.id === id) || colors[0];
  }

  function initCmfStudio() {
    if (initialized) return;
    initialized = true;
    recipe = loadRecipe();
    selectedPartId = activeParts()[0].id;
    buildModelControls();
    buildPoseControls();
    buildPartControls();
    buildViewControls();
    bindCmfStudioEvents();
    syncCmfForm();
    refreshCapabilities();
    setCmfStatus(t("cmf_ready"));
  }

  function renderCmfStudio() {
    initCmfStudio();
    syncCmfForm();
  }

  function bindCmfStudioEvents() {
    cmfEl("cmf-model")?.addEventListener("change", (event) => {
      selectCmfModel(event.target.value);
    });
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
    if (poseSelect.dataset.model !== activeModel().id) {
      poseSelect.dataset.model = activeModel().id;
      poseSelect.replaceChildren(...poses.map((pose) => {
        const option = document.createElement("option");
        option.value = pose.id;
        option.textContent = t(pose.labelKey);
        return option;
      }));
    }
    poseSelect.value = activePose();
    if (typeof refreshSystemSelectControl === "function") refreshSystemSelectControl(poseSelect);
  }

  function selectCmfModel(modelId) {
    const spec = modelSpec(modelId);
    if (spec.id === recipe.model) return;
    recipe = loadRecipeFor(spec.id);
    selectedPartId = activeParts()[0].id;
    selectedView = defaultViewForActive();
    buildModelControls();
    buildPoseControls();
    buildPartControls();
    buildViewControls();
    syncCmfForm();
    saveRecipe({ quiet: true });
    // A different device means different geometry, so the model has to be
    // rebuilt server-side — recoloring the materials in place is not enough.
    pendingModelSwitch = true;
    scheduleModelRender(0);
    setCmfStatus(t("cmf_model_switched"));
  }

  function selectCmfPose(poseId) {
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
    const spec = modelSpec(modelId);
    const fallback = defaultRecipe(spec.id);
    const saved = readStore().recipes[spec.id];
    if (!saved?.parts) return fallback;
    // Colors from another model's palette can't apply here; drop them.
    const parts = { ...fallback.parts };
    for (const part of spec.parts) {
      const color = saved.parts[part.id];
      if (spec.colors.some((entry) => entry.id === color)) parts[part.id] = color;
    }
    const pose = spec.poses
      ? (spec.poses.some((entry) => entry.id === saved.pose) ? saved.pose : spec.poses[0].id)
      : undefined;
    return { ...fallback, ...saved, model: spec.id, ...(pose ? { pose } : {}), parts };
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

  // A hung capabilities probe must not leave the preview in an eternal
  // "Loading…" state: after the timeout the feature degrades to the
  // unavailable state like any other fetch failure.
  const CAPABILITIES_TIMEOUT_MS = 8000;

  async function refreshCapabilities() {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CAPABILITIES_TIMEOUT_MS);
    let canExport = false;
    try {
      const assetResponse = await fetch(activeAssetUrl(), {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });
      canRenderModel = assetResponse.ok;
    } catch {
      canRenderModel = false;
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
    }
    if (cmfEl("cmf-export-views")) {
      cmfEl("cmf-export-views").dataset.capabilityDisabled = String(!canRenderModel);
      cmfEl("cmf-export-views").disabled = !canRenderModel;
    }
    const empty = cmfEl("cmf-preview-empty");
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
    renderer.toneMapping = modules.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setClearColor(0x000000, 0);

    const scene = new modules.Scene();
    const camera = new modules.OrthographicCamera(-1, 1, 1, -1, 0.001, 1000);
    scene.add(new modules.AmbientLight(0xffffff, 1.5));
    const keyLight = new modules.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(-3, -4, -5);
    scene.add(keyLight);
    const fillLight = new modules.DirectionalLight(0xb9c9ff, 1.7);
    fillLight.position.set(4, 2, 5);
    scene.add(fillLight);

    // Apple authors the enclosures as metal (the MacBook's lid is metalness
    // 0.6, its deck 0.8). A metal has no diffuse term, so with lights alone
    // there is nothing for it to reflect and every finish collapses to grey —
    // only the low-metalness parts, like the keycaps, kept their colour. A
    // neutral room gives the anodising something to pick up.
    const environment = new modules.PMREMGenerator(renderer)
      .fromScene(new modules.RoomEnvironment(), 0.04);
    scene.environment = environment.texture;

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

  function resizeModelViewport() {
    const state = rendererState;
    if (!state) return;
    const rect = state.viewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    state.renderer.setSize(width, height, false);
    updateCameraFrustum(state.viewHalfHeight);
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
    const state = rendererState;
    if (!state) return;
    state.renderer.render(state.scene, state.camera);
  }

  function updateInteractiveModel() {
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
      rendererState.modelId !== recipe.model || rendererState.poseId !== (recipe.pose || "closed")
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

  function scheduleModelRender(delay = 0) {
    window.clearTimeout(modelRefreshTimer);
    if (canRenderModel === false) {
      setModelRefreshing(false);
      setCmfStatus(t("cmf_ready"));
      return;
    }
    const requestId = modelRequestId + 1;
    modelRequestId = requestId;
    modelAbortController?.abort();
    modelAbortController = null;
    setModelRefreshing(true);
    setCmfStatus(t("cmf_model_rendering"));
    modelRefreshTimer = window.setTimeout(() => renderInteractiveModel(requestId), delay);
  }

  function cancelModelRender() {
    window.clearTimeout(modelRefreshTimer);
    modelRefreshTimer = 0;
    modelRequestId += 1;
    modelAbortController?.abort();
    modelAbortController = null;
    setModelRefreshing(false);
  }

  // Prefer the static source USDZ and recolor it in the browser; fall back to
  // the server export only when the asset is missing or unreachable (VPS/Mac
  // can also serve the recolored model, but the browser path removes the
  // server-side render dependency for the live preview).
  async function loadModelAsset(requestedRecipe) {
    try {
      const assetResponse = await fetch(activeAssetUrl(), { signal: modelAbortController.signal });
      if (assetResponse.ok) return assetResponse;
    } catch {
      // Fall through to the server path below.
    }
    return window.AISystem6Capabilities.requestService("cmf.exportUsdz", {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: requestedRecipe }),
        signal: modelAbortController.signal,
      },
    });
  }

  async function renderInteractiveModel(requestId) {
    if (requestId !== modelRequestId) return;
    modelAbortController = new AbortController();
    const requestedRecipe = JSON.parse(JSON.stringify(recipe));
    try {
      const [state, response] = await Promise.all([
        ensureRenderer(),
        loadModelAsset(requestedRecipe),
      ]);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || response.statusText);
      }
      const buffer = await response.arrayBuffer();
      if (requestId !== modelRequestId) return;

      const nextModel = new state.modules.USDLoader().parse(buffer);
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
      prepareLiveMaterials(nextModel, nextBounds);
      state.scene.add(nextModel);
      state.model = nextModel;
      state.modelId = requestedRecipe.model;
      state.poseId = requestedRecipe.pose || "closed";
      state.bounds = nextBounds;
      applyLiveRecipe(nextModel);
      if (previousModel) {
        state.scene.remove(previousModel);
        disposeModel(previousModel);
      }
      state.canvas.hidden = false;
      const empty = cmfEl("cmf-preview-empty");
      if (empty) empty.hidden = true;
      // A different device is a different size, so re-frame it the way a first
      // load would instead of keeping the previous device's camera distance.
      if (!previousModel || pendingModelSwitch) {
        pendingModelSwitch = false;
        state.viewIsCustom = false;
        syncViewControls();
        applyCmfView(selectedView, { animate: false });
      } else {
        renderModelFrame();
      }
      setCmfStatus(t("cmf_model_done"));
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (requestId === modelRequestId) {
        setCmfStatus(`${t("cmf_model_failed")} ${error.message}`);
        if (!rendererState?.model) {
          const empty = cmfEl("cmf-preview-empty");
          if (empty) {
            empty.hidden = false;
            empty.textContent = t("cmf_model_failed");
          }
        }
        playSystemSound?.("alert");
      }
    } finally {
      if (requestId === modelRequestId) {
        modelAbortController = null;
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
    if (rendererState) rendererState.viewIsCustom = false;
    syncViewControls();
    applyCmfView(name, { animate: true });
  }

  function resetCmfView() {
    if (!selectedView) selectedView = "02-back";
    if (rendererState) rendererState.viewIsCustom = false;
    syncViewControls();
    applyCmfView(selectedView, { animate: true });
  }

  function syncViewControls() {
    document.querySelectorAll("[data-cmf-view]").forEach((button) => {
      const selected = !rendererState?.viewIsCustom && button.dataset.cmfView === selectedView;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = button.dataset.cmfView === selectedView ? 0 : -1;
    });
  }

  function applyCmfView(name, options = {}) {
    const state = rendererState;
    const view = activeViews().find((item) => item.name === name);
    if (!state?.model || !state.bounds || !view) return;

    const { Vector3 } = state.modules;
    const center = state.bounds.getCenter(new Vector3());
    const size = state.bounds.getSize(new Vector3());
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
    cameraAnimationFrame = window.requestAnimationFrame(step);
  }

  function setModelRefreshing(refreshing) {
    const panel = document.querySelector(".cmf-preview-panel");
    panel?.classList.toggle("is-refreshing", refreshing);
    panel?.setAttribute("aria-busy", String(refreshing));
    const indicator = cmfEl("cmf-live-indicator");
    if (indicator) {
      indicator.dataset.state = refreshing ? "loading" : "ready";
      indicator.textContent = t(refreshing ? "cmf_model_updating" : "cmf_model_interactive");
    }
  }

  function buildBrowserExportRecipe() {
    const spec = activeModel();
    return {
      modelId: spec.id,
      pose: spec.poses ? activePose() : undefined,
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
    window.AISystem6WebPlatform.saveArtifact({
      blob: result.blob,
      fileName: exportFileName(),
      mimeType: "model/vnd.usdz+zip",
    });
  }

  async function exportUsdz() {
    setBusy(true, t("cmf_exporting"));
    setCmfControlLoading("cmf-export", true, t("cmf_exporting"));
    try {
      try {
        await exportUsdzBrowser();
      } catch (error) {
        // Static deployments own the source asset and the browser exporter.
        // Local/VPS deployments can still fall through to the Node engine.
        const response = await window.AISystem6Capabilities.requestService("cmf.exportUsdz", {
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipe }),
          },
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || data.error || response.statusText);
        }
        const blob = await response.blob();
        window.AISystem6WebPlatform.saveArtifact({
          blob,
          fileName: exportFileName(),
          mimeType: "model/vnd.usdz+zip",
        });
      }
      setCmfStatus(t("cmf_export_done"));
      playSystemSound?.("save");
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

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
    });
  }

  function createOffscreenRenderer() {
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
    renderer.toneMapping = state.modules.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height, false);
    return { renderer, canvas };
  }

  // Browser-side WebGL multi-view export: the view presets already drive the
  // live preview, so each view is re-framed synchronously and read back from
  // the canvas as a PNG. This removes the server software-rasterizer dependency
  // for the public/Pages deployment.
  async function exportViewsAsPng() {
    const state = rendererState;
    if (!state?.model || !state.bounds) {
      setCmfStatus(t("cmf_export_views_unavailable"));
      return;
    }
    setBusy(true, t("cmf_exporting_views"));
    const previousView = selectedView;
    try {
      const views = activeViews();
      const offscreen = createOffscreenRenderer();
      for (const view of views) {
        snapCamera(cameraPoseForView(view));
        offscreen.renderer.render(state.scene, state.camera);
        const blob = await canvasToPngBlob(offscreen.canvas);
        window.AISystem6WebPlatform.saveArtifact({
          blob,
          fileName: `${recipe.name || activeModel().id}-${view.name}.png`,
          mimeType: "image/png",
        });
      }
      offscreen.renderer.dispose();
      setCmfStatus(t("cmf_export_views_done"));
      playSystemSound?.("save");
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
    ["cmf-shuffle", "cmf-reset", "cmf-reset-view", "cmf-export", "cmf-export-views"].forEach((id) => {
      const button = cmfEl(id);
      if (button) button.disabled = busy || button.dataset.capabilityDisabled === "true";
    });
    document.querySelectorAll("[data-cmf-color-option]").forEach((button) => {
      button.disabled = busy;
    });
    if (message) setCmfStatus(message);
  }

  function setCmfStatus(message) {
    const el = cmfEl("cmf-status");
    if (el) el.textContent = message;
  }

  // A hidden CMF Studio keeps a WebGL context, a loaded model and a per-frame
  // damping loop alive. Suspend stops the loop and the in-flight render; the
  // scene stays built, so coming back is one repaint rather than a reload.
  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("cmfStudio", {
    onSuspend: () => {
      stopModelAnimationLoop();
      cancelModelRender();
    },
    onResume: () => {
      if (!rendererState) return;
      startModelAnimationLoop();
      resizeModelViewport();
      renderModelFrame();
    },
    onDispose: () => {
      stopModelAnimationLoop();
      cancelModelRender();
      const state = rendererState;
      if (!state) return;
      rendererState = null;
      state.resizeObserver?.disconnect();
      state.controls?.dispose?.();
      state.renderer?.dispose?.();
    },
  });

  window.AISystem6CMFStudioLoaded = true;
  window.renderCmfStudio = renderCmfStudio;
  window.AISystem6CMFStudio = Object.freeze({
    cancelRender: cancelModelRender,
    runMenuCommand(command) {
      const commands = {
        save: () => saveRecipe(),
        export: exportUsdz,
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
})();
