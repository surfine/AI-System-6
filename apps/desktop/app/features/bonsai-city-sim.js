// Bonsai City deterministic simulation core / 盆景城市确定性模拟核心.
// Original MIT-clean rules: the shell supplies a seed and advances whole ticks.
window.AISystem6BonsaiSimLoaded = true;

(function initBonsaiSim() {
  "use strict";

  const FORMAT = "bonsai-city";
  const SAVE_VERSION = 3;
  const SAVE_FORMAT_VERSION = 3;
  const ENGINE_RULESET_VERSION = 3;
  const COMMAND_SCHEMA_VERSION = 2;
  const EVENT_SCHEMA_VERSION = 2;
  const FIXED_TICK_HZ = 20;
  const TICKS_PER_DAY = 5;
  // SC2K calendar: a 300-day year of 12 months, 25 days each.
  const DAYS_PER_MONTH = 25;
  const MONTHS_PER_YEAR = 12;
  const TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH;
  const DEFAULT_SIZE = 96;
  const SIZE = DEFAULT_SIZE;
  const SUPPORTED_SIZES = Object.freeze([64, 96, 128]);
  const TERRAIN_PRESETS = Object.freeze(["balanced", "river", "lake", "coast", "mountain"]);
  const MAX_ALT = 31;
  const MAX_STAGE = 3;
  const START_YEAR = 1900;
  const YEAR_FOUNDED_CHOICES = Object.freeze([1900, 1950, 2000, 2050]);
  const START_FUNDS = 30000;
  const DEFAULT_TAX = 7;
  const MAX_TAX_RATE = 20;
  const MAX_PENDING_COMMANDS = 256;
  const MAX_EVENTS = 128;
  const MAX_HISTORY_MONTHS = 120;
  const MAX_UNDO = 100;
  const ROAD_REACH = 3;
  const CONGESTION_THRESHOLD = 64;
  const INTEGRITY_ALGORITHM = "SHA-256";
  const CANONICALIZATION = "sorted-json-v1";

  const ZONE_NONE = 0;
  const ZONE_R = 1;
  const ZONE_C = 2;
  const ZONE_I = 3;
  // Port and military zones exist in the model for .sc2 compatibility; the
  // command layer starts accepting them with the transport milestone.
  const ZONE_MILITARY = 4;
  const ZONE_AIRPORT = 5;
  const ZONE_SEAPORT = 6;
  const MAX_ZONE = ZONE_SEAPORT;
  const DENSITY_NONE = 0;
  const DENSITY_LOW = 1;
  const DENSITY_HIGH = 2;
  const BUILDING_EMPTY = 0;
  const BUILDING_FOUNDATION = 1;
  const BUILDING_CONSTRUCTION = 2;
  const BUILDING_ACTIVE = 3;
  const BUILDING_DECLINING = 4;
  const BUILDING_ABANDONED = 5;
  const BUILDING_RECOVERING = 6;

  // Compatibility view only. v2 persists independent infrastructure layers.
  const OVER_NONE = 0;
  const OVER_ROAD = 1;
  const OVER_WIRE = 2;
  const OVER_PARK = 3;
  const OVER_ROADWIRE = 4;

  const PROBLEM = Object.freeze({ NONE: 0, NO_ROAD: 1, NO_POWER: 2, NO_WATER: 3, CONGESTED: 4, NO_DEMAND: 5, POLLUTION: 6 });
  const PROBLEM_NAMES = Object.freeze([null, "no-road", "no-power", "no-water", "congested", "no-demand", "pollution"]);
  const PROBLEM_ACTIONS = Object.freeze([null, "build-road", "connect-power", "connect-water", "add-transport-capacity", "rebalance-demand", "separate-industry"]);

  // Highway rides at SC2K's player-visible $100 per 2x2 section, charged as
  // $25 per tile; the onramp is the $25 joint piece [verify-during-impl].
  const NETWORK_COST = Object.freeze({ road: 10, rail: 25, wire: 5, pipe: 8, park: 20, subway: 100, highway: 25, onramp: 25 });
  // Crossing water builds a bridge (or a line over pylons): same layer,
  // higher per-tile price. Pipes and subways stay on land.
  const BRIDGE_COST = Object.freeze({ road: 50, rail: 75, wire: 25, highway: 100 });
  const ZONE_COST = Object.freeze({ low: 50, high: 100 });
  // Port zones per tile; military zones arrive with the reward flow.
  const PORT_ZONE_COST = Object.freeze({ seaport: 150, airport: 250 });
  const PORT_MIN_TILES = Object.freeze({ seaport: 8, airport: 12 });
  const TERRAFORM_COST = Object.freeze({ raise: 15, lower: 15, level: 20, tree: 5 });
  // The eleven SC2K budget funding lines. Transit funding scales the relief
  // its network provides; service funding scales coverage radii.
  const FUNDING_SERVICES = Object.freeze(["roads", "highways", "bridges", "rail", "subway", "tunnels", "police", "fire", "health", "schools", "colleges"]);
  const BOND_PRINCIPAL = 10000;
  const MAX_BONDS = 50;
  // The twenty SC2K ordinances, finance section first. Per-capita income and
  // cost figures are our own deterministic approximations, tuned against the
  // owner's side-by-side sessions; EQ/LE hooks arrive with the population
  // model (M4b) and are marked "later".
  const ORDINANCES = Object.freeze({
    salesTax: { section: "finance", incomeDiv: 20 },
    incomeTax: { section: "finance", incomeDiv: 25 },
    legalizedGambling: { section: "finance", incomeDiv: 16, crime: 5 },
    parkingFines: { section: "finance", incomeDiv: 40 },
    proReading: { section: "education", base: 20, costDiv: 50 },       // EQ later
    antiDrug: { section: "safety", base: 20, costDiv: 50, crime: -8 },
    cprTraining: { section: "safety", base: 10, costDiv: 80 },         // LE later
    neighborhoodWatch: { section: "safety", base: 10, costDiv: 60, crime: -6 },
    juniorSports: { section: "promotion", base: 20, costDiv: 60, happiness: 2 },
    publicSmokingBan: { section: "safety", base: 5, costDiv: 200 },    // LE later
    freeClinics: { section: "safety", base: 25, costDiv: 40 },         // LE later
    homelessShelters: { section: "safety", base: 20, costDiv: 50 },
    pollutionControls: { section: "other", base: 25, costDiv: 40, cleanIndustry: true },
    volunteerFireDept: { section: "safety", base: 5, costDiv: 200 },
    energyConservation: { section: "other", base: 15, costDiv: 60, powerSaver: true },
    nuclearFreeZone: { section: "other", base: 0, blocksNuclear: true },
    waterConservation: { section: "other", base: 10, costDiv: 80, waterSaver: true },
    annualCarnival: { section: "promotion", base: 25, costDiv: 60, happiness: 2 },
    touristAdvertising: { section: "promotion", base: 20, costDiv: 60, cDemand: 3 },
    businessAdvertising: { section: "promotion", base: 20, costDiv: 60, cDemand: 3 },
  });
  const ORDINANCE_IDS = Object.freeze(Object.keys(ORDINANCES).sort());
  function makeOrdinanceState() { const out = {}; for (const id of ORDINANCE_IDS) out[id] = false; return out; }
  const ordinanceOn = (state, id) => !!(state.ordinances && state.ordinances[id]);
  // Power plants carry SC2K's player-visible costs and outputs and a 50-year
  // service life; capacity units follow the SC2K megawatt figures while zone
  // draw keeps the engine's per-tile scale. Exact per-plant balance is tuned
  // against the owner's side-by-side sessions (SC2-COMPAT.md protocol).
  const PLANT_LIFESPAN_TICKS = 50 * MONTHS_PER_YEAR * TICKS_PER_MONTH;
  const FACILITY_KINDS = Object.freeze({
    coal: { w: 2, h: 2, cost: 4000, upkeep: 60, power: 200, pollution: 70, tech: 1900, lifespan: true, group: "utility" },
    hydro: { w: 1, h: 1, cost: 400, upkeep: 8, power: 20, pollution: 0, tech: 1900, lifespan: true, needsWaterfall: true, group: "utility" },
    oil: { w: 4, h: 4, cost: 6600, upkeep: 70, power: 220, pollution: 60, tech: 1900, lifespan: true, group: "utility" },
    gas: { w: 4, h: 4, cost: 2000, upkeep: 40, power: 50, pollution: 20, tech: 1950, lifespan: true, group: "utility" },
    nuclear: { w: 4, h: 4, cost: 15000, upkeep: 100, power: 500, pollution: 5, tech: 1955, lifespan: true, group: "utility" },
    wind: { w: 1, h: 1, cost: 100, upkeep: 4, power: 4, pollution: 0, tech: 1900, lifespan: true, group: "utility" },
    solar: { w: 4, h: 4, cost: 1300, upkeep: 20, power: 50, pollution: 0, tech: 1990, lifespan: true, group: "utility" },
    microwave: { w: 4, h: 4, cost: 28000, upkeep: 120, power: 1600, pollution: 0, tech: 2020, lifespan: true, group: "utility" },
    fusion: { w: 4, h: 4, cost: 40000, upkeep: 150, power: 2500, pollution: 0, tech: 2050, lifespan: true, group: "utility" },
    pump: { w: 1, h: 1, cost: 450, upkeep: 15, water: 500, tech: 1900, group: "utility" },
    "water-tower": { w: 1, h: 1, cost: 300, upkeep: 8, water: 250, tech: 1900, group: "utility" },
    treatment: { w: 1, h: 1, cost: 500, upkeep: 30, water: 1000, tech: 1935, group: "utility" },
    desal: { w: 2, h: 2, cost: 1000, upkeep: 40, water: 500, tech: 1990, desalinates: true, group: "utility" },
    police: { w: 1, h: 1, cost: 300, upkeep: 20, radius: 6, tech: 1900, group: "police" },
    fire: { w: 1, h: 1, cost: 250, upkeep: 15, radius: 5, tech: 1900, group: "fire" },
    school: { w: 1, h: 1, cost: 350, upkeep: 18, radius: 5, tech: 1900, group: "schools" },
    clinic: { w: 1, h: 1, cost: 400, upkeep: 22, radius: 5, tech: 1900, group: "health" },
    station: { w: 2, h: 2, cost: 600, upkeep: 25, radius: 4, tech: 1900, group: "transport" },
    "subway-station": { w: 1, h: 1, cost: 250, upkeep: 12, radius: 4, tech: 1910, group: "transport" },
    bus: { w: 1, h: 1, cost: 250, upkeep: 10, radius: 8, tech: 1920, group: "transport" },
    // Rewards: offered by the population ladder, free to place, and they
    // lift land value around them. Arcologies repeat; the rest are one
    // each. Thresholds and arco capacity are tuned against the owner's
    // side-by-side sessions.
    "mayors-house": { w: 2, h: 2, cost: 0, upkeep: 0, reward: true, valueBonus: 10, radius: 6, group: "civic" },
    "city-hall": { w: 3, h: 3, cost: 0, upkeep: 0, reward: true, valueBonus: 12, radius: 8, group: "civic" },
    statue: { w: 1, h: 1, cost: 0, upkeep: 0, reward: true, valueBonus: 8, radius: 5, group: "civic" },
    dome: { w: 3, h: 3, cost: 0, upkeep: 0, reward: true, valueBonus: 10, radius: 6, group: "civic" },
    arco: { w: 3, h: 3, cost: 0, upkeep: 0, reward: true, repeatable: true, population: 30000, valueBonus: 6, radius: 4, tech: 2000, group: "civic" },
  });
  const PLANT_KINDS = Object.freeze(Object.fromEntries(Object.entries(FACILITY_KINDS).filter(([, spec]) => spec.power)));
  const REWARD_TIERS = Object.freeze([
    { tier: 1, kind: "mayors-house", threshold: 2000 },
    { tier: 2, kind: "city-hall", threshold: 10000 },
    { tier: 3, kind: "statue", threshold: 30000 },
    { tier: 4, kind: "military-base", threshold: 60000 },
    { tier: 5, kind: "dome", threshold: 80000 },
    { tier: 6, kind: "arco", threshold: 120000 },
  ]);
  const MAX_MICROSIMS = 150;
  // Scenario goals the runner can evaluate; imported SCEN files map onto
  // the same set. Original scenarios only — the built-ins below are ours.
  const SCENARIO_GOAL_KEYS = Object.freeze(["population", "funds", "landValue", "crimeMax", "pollutionMax", "trafficMax", "bondsMax"]);
  const SCENARIO_DISASTER_IDS = Object.freeze({ 1: "fire", 2: "flood", 6: "earthquake", 7: "tornado", 8: "monster" });
  const SCENARIOS = Object.freeze({
    "after-the-fire": Object.freeze({
      id: "after-the-fire", seed: 7301, size: 64, terrainPreset: "balanced", yearFounded: 1950,
      months: 60, goals: Object.freeze({ population: 1500 }), disaster: Object.freeze({ kind: "fire", delayMonths: 1 }),
    }),
    "deep-in-debt": Object.freeze({
      id: "deep-in-debt", seed: 7302, size: 64, terrainPreset: "river", yearFounded: 2000,
      months: 48, goals: Object.freeze({ funds: 20000, bondsMax: 0 }), startingBonds: 3,
    }),
  });
  // Newspaper stories are keys plus numbers; the shell owns the words
  // (the core never touches translation strings). Priority is list order.
  const NEWS_STORY_KEYS = Object.freeze([
    "disaster_fire", "disaster_flood", "disaster_tornado", "disaster_earthquake", "disaster_monster",
    "disaster_over", "reward", "milestone", "deficit", "brownout", "water_shortage",
    "crime_high", "congestion", "plant_expired", "growth", "decline", "tax_high", "ordinance", "bond", "quiet_1", "quiet_2", "quiet_3",
    "scenario_won", "scenario_lost",
  ]);
  const MAX_NEWS_STORIES = 5;
  // The M6-1 disaster set; the trigger menu and emergent starts share it.
  const DISASTER_KINDS = Object.freeze({
    fire: { duration: 200 },
    flood: { duration: 50, radius: 6 },
    tornado: { duration: 100 },
    earthquake: { duration: 10 },
    monster: { duration: 150 },
  });
  // Each working facility kind reports one headline figure in the query
  // dialog; the label key names what the figure is.
  const MICROSIM_KINDS = Object.freeze({
    police: "arrests", fire: "responses", school: "students", clinic: "patients",
    station: "riders", "subway-station": "riders", bus: "riders",
    "city-hall": "visitors", "mayors-house": "visitors", dome: "events", arco: "residents",
    treatment: "volume", desal: "volume",
  });
  const SERVICE_KINDS = Object.freeze({ police: FACILITY_KINDS.police, fire: FACILITY_KINDS.fire, school: FACILITY_KINDS.school, clinic: FACILITY_KINDS.clinic });
  // Moving things in the XTHG shape. Record ids are format facts; only the
  // civil kinds fly and sail here — deploys and disasters have their own
  // machinery, and imported records of other kinds stay in the sidecar.
  const THING_KIND_BY_ID = Object.freeze({ 1: "airplane", 2: "helicopter", 3: "ship", 9: "sailboat" });
  const THING_ID_BY_KIND = Object.freeze({ airplane: 1, helicopter: 2, ship: 3, sailboat: 9 });
  const THING_STEP_TICKS = Object.freeze({ airplane: 2, helicopter: 3, ship: 5, sailboat: 6 });
  const MAX_THINGS = 39;
  const COSTS = Object.freeze({
    network: NETWORK_COST,
    zone: ZONE_COST,
    facility: Object.freeze(Object.fromEntries(Object.entries(FACILITY_KINDS).map(([kind, spec]) => [kind, spec.cost]))),
    terraform: TERRAFORM_COST,
    demolish: 3,
  });
  const TOOLS = Object.freeze({
    query: { cost: 0 }, bulldoze: { cost: 3 }, road: { cost: 10 }, rail: { cost: 25 }, wire: { cost: 5 }, pipe: { cost: 8 }, park: { cost: 20 },
    residential: { cost: 50 }, commercial: { cost: 50 }, industrial: { cost: 50 },
    ...Object.fromEntries(Object.entries(FACILITY_KINDS).map(([kind, spec]) => [kind, { cost: spec.cost }])),
  });

  function freezeRecipe(recipe) {
    recipe.commandLog.forEach((command) => {
      if (Array.isArray(command.payload.points)) command.payload.points.forEach(Object.freeze);
      if (Array.isArray(command.payload.points)) Object.freeze(command.payload.points);
      Object.freeze(command.payload);
      Object.freeze(command);
    });
    Object.freeze(recipe.commandLog);
    return Object.freeze(recipe);
  }

  function zoneCohortCommands(prefix, zone, y, targetTick) {
    return [16, 18, 20, 22, 24, 26].map((x, index) => ({
      schemaVersion: 2,
      type: "zone-area",
      payload: { zone, density: "high", x, y, width: 1, height: 1 },
      targetTick,
      clientCommandId: `${prefix}-${index + 1}`,
    }));
  }

  const EXAMPLES = Object.freeze({
    "starter-town": freezeRecipe({
      id: "starter-town", name: "Starter Town", seed: 6101, size: 64, terrainPreset: "balanced", targetTick: 1800,
      commandLog: [
        { schemaVersion: 2, type: "place-facility", payload: { kind: "wind", x: 8, y: 6 }, targetTick: 0, clientCommandId: "starter-wind" },
        { schemaVersion: 2, type: "place-facility", payload: { kind: "water-tower", x: 8, y: 7 }, targetTick: 0, clientCommandId: "starter-water" },
        { schemaVersion: 2, type: "build-path", payload: { network: "road", points: [{ x: 10, y: 8 }, { x: 24, y: 8 }] }, targetTick: 0, clientCommandId: "starter-road" },
        { schemaVersion: 2, type: "build-path", payload: { network: "wire", points: [{ x: 8, y: 6 }, { x: 21, y: 9 }, { x: 10, y: 9 }] }, targetTick: 0, clientCommandId: "starter-wire" },
        { schemaVersion: 2, type: "build-path", payload: { network: "pipe", points: [{ x: 8, y: 7 }, { x: 21, y: 9 }, { x: 10, y: 9 }] }, targetTick: 0, clientCommandId: "starter-pipe" },
        { schemaVersion: 2, type: "zone-area", payload: { zone: "residential", density: "high", x: 10, y: 9, width: 4, height: 3 }, targetTick: 0, clientCommandId: "starter-r" },
        { schemaVersion: 2, type: "zone-area", payload: { zone: "commercial", density: "high", x: 15, y: 9, width: 3, height: 3 }, targetTick: 0, clientCommandId: "starter-c" },
        { schemaVersion: 2, type: "zone-area", payload: { zone: "industrial", density: "high", x: 19, y: 9, width: 3, height: 3 }, targetTick: 0, clientCommandId: "starter-i" },
        { schemaVersion: 2, type: "place-facility", payload: { kind: "police", x: 8, y: 12 }, targetTick: 0, clientCommandId: "starter-police" },
        { schemaVersion: 2, type: "place-facility", payload: { kind: "fire", x: 9, y: 12 }, targetTick: 0, clientCommandId: "starter-fire" },
      ],
    }),
    "troubled-mid-size": freezeRecipe({
      id: "troubled-mid-size", name: "Troubled Mid-size", seed: 6202, size: 64, terrainPreset: "balanced", targetTick: 600,
      commandLog: [
        { schemaVersion: 2, type: "place-facility", payload: { kind: "coal", x: 14, y: 3 }, targetTick: 0, clientCommandId: "troubled-coal" },
        { schemaVersion: 2, type: "place-facility", payload: { kind: "water-tower", x: 14, y: 1 }, targetTick: 0, clientCommandId: "troubled-water" },
        { schemaVersion: 2, type: "build-path", payload: { network: "road", points: [{ x: 16, y: 2 }, { x: 28, y: 2 }] }, targetTick: 0, clientCommandId: "troubled-road-early" },
        { schemaVersion: 2, type: "build-path", payload: { network: "road", points: [{ x: 16, y: 7 }, { x: 28, y: 7 }] }, targetTick: 0, clientCommandId: "troubled-road-mid" },
        { schemaVersion: 2, type: "build-path", payload: { network: "road", points: [{ x: 16, y: 12 }, { x: 28, y: 12 }] }, targetTick: 0, clientCommandId: "troubled-road-late" },
        { schemaVersion: 2, type: "build-path", payload: { network: "rail", points: [{ x: 16, y: 6 }, { x: 28, y: 6 }] }, targetTick: 0, clientCommandId: "troubled-rail" },
        { schemaVersion: 2, type: "build-path", payload: { network: "wire", points: [{ x: 14, y: 3 }, { x: 15, y: 3 }, { x: 15, y: 12 }] }, targetTick: 0, clientCommandId: "troubled-wire-main" },
        { schemaVersion: 2, type: "build-path", payload: { network: "wire", points: [{ x: 15, y: 2 }, { x: 28, y: 2 }] }, targetTick: 0, clientCommandId: "troubled-wire-early" },
        { schemaVersion: 2, type: "build-path", payload: { network: "wire", points: [{ x: 15, y: 7 }, { x: 28, y: 7 }] }, targetTick: 0, clientCommandId: "troubled-wire-mid" },
        { schemaVersion: 2, type: "build-path", payload: { network: "wire", points: [{ x: 15, y: 12 }, { x: 28, y: 12 }] }, targetTick: 0, clientCommandId: "troubled-wire-late" },
        { schemaVersion: 2, type: "build-path", payload: { network: "pipe", points: [{ x: 14, y: 1 }, { x: 15, y: 1 }, { x: 15, y: 12 }] }, targetTick: 0, clientCommandId: "troubled-pipe-main" },
        { schemaVersion: 2, type: "build-path", payload: { network: "pipe", points: [{ x: 15, y: 2 }, { x: 28, y: 2 }] }, targetTick: 0, clientCommandId: "troubled-pipe-early" },
        { schemaVersion: 2, type: "build-path", payload: { network: "pipe", points: [{ x: 15, y: 7 }, { x: 28, y: 7 }] }, targetTick: 0, clientCommandId: "troubled-pipe-mid" },
        { schemaVersion: 2, type: "build-path", payload: { network: "pipe", points: [{ x: 15, y: 12 }, { x: 28, y: 12 }] }, targetTick: 0, clientCommandId: "troubled-pipe-late" },
        { schemaVersion: 2, type: "place-facility", payload: { kind: "station", x: 29, y: 5 }, targetTick: 0, clientCommandId: "troubled-station" },
        { schemaVersion: 2, type: "place-facility", payload: { kind: "police", x: 29, y: 3 }, targetTick: 0, clientCommandId: "troubled-police" },
        { schemaVersion: 2, type: "place-facility", payload: { kind: "fire", x: 29, y: 4 }, targetTick: 0, clientCommandId: "troubled-fire" },
        { schemaVersion: 2, type: "set-policy", payload: { policy: "tax-rate", taxRate: 0 }, targetTick: 0, clientCommandId: "troubled-growth-tax" },
        ...zoneCohortCommands("troubled-early-r", "residential", 3, 0),
        ...zoneCohortCommands("troubled-early-c", "commercial", 4, 0),
        ...zoneCohortCommands("troubled-early-i", "industrial", 5, 0),
        ...zoneCohortCommands("troubled-mid-r", "residential", 8, 250),
        ...zoneCohortCommands("troubled-mid-c", "commercial", 9, 250),
        ...zoneCohortCommands("troubled-mid-i", "industrial", 10, 250),
        ...zoneCohortCommands("troubled-late-r", "residential", 13, 500),
        ...zoneCohortCommands("troubled-late-c", "commercial", 14, 500),
        ...zoneCohortCommands("troubled-late-i", "industrial", 15, 500),
        { schemaVersion: 2, type: "set-policy", payload: { policy: "tax-rate", taxRate: 20 }, targetTick: 540, clientCommandId: "troubled-tax" },
        { schemaVersion: 2, type: "set-policy", payload: { policy: "funding", service: "police", level: 0 }, targetTick: 540, clientCommandId: "troubled-police-cut" },
        { schemaVersion: 2, type: "set-policy", payload: { policy: "funding", service: "fire", level: 0 }, targetTick: 540, clientCommandId: "troubled-fire-cut" },
        { schemaVersion: 2, type: "zone-area", payload: { zone: "residential", density: "high", x: 18, y: 11, width: 1, height: 1 }, targetTick: 570, clientCommandId: "troubled-construction-r" },
        { schemaVersion: 2, type: "zone-area", payload: { zone: "commercial", density: "high", x: 22, y: 11, width: 1, height: 1 }, targetTick: 570, clientCommandId: "troubled-construction-c" },
        { schemaVersion: 2, type: "zone-area", payload: { zone: "industrial", density: "high", x: 26, y: 11, width: 1, height: 1 }, targetTick: 570, clientCommandId: "troubled-construction-i" },
        { schemaVersion: 2, type: "zone-area", payload: { zone: "residential", density: "high", x: 16, y: 11, width: 1, height: 1 }, targetTick: 595, clientCommandId: "troubled-foundation-r" },
        { schemaVersion: 2, type: "zone-area", payload: { zone: "commercial", density: "high", x: 20, y: 11, width: 1, height: 1 }, targetTick: 595, clientCommandId: "troubled-foundation-c" },
        { schemaVersion: 2, type: "zone-area", payload: { zone: "industrial", density: "high", x: 24, y: 11, width: 1, height: 1 }, targetTick: 595, clientCommandId: "troubled-foundation-i" },
      ],
    }),
  });

  function latticeInt(x, y, seed) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 962287)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function latticeHash(x, y, seed) { return latticeInt(x, y, seed) / 4294967296; }
  function nextRandom(state) {
    state.rngState = (state.rngState + 0x6d2b79f5) | 0;
    let value = state.rngState ^ (state.rngState >>> 15);
    value = Math.imul(value, 1 | state.rngState);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  function smoothNoise(x, y, freq, seed) {
    const fx = x * freq; const fy = y * freq; const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const tx = fx - x0; const ty = fy - y0; const sx = tx * tx * (3 - 2 * tx); const sy = ty * ty * (3 - 2 * ty);
    const a = latticeHash(x0, y0, seed); const b = latticeHash(x0 + 1, y0, seed); const c = latticeHash(x0, y0 + 1, seed); const d = latticeHash(x0 + 1, y0 + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fractalNoise(x, y, seed) {
    return smoothNoise(x, y, 1 / 24, seed) * 0.55 + smoothNoise(x, y, 1 / 11, seed + 101) * 0.3 + smoothNoise(x, y, 1 / 5, seed + 202) * 0.15;
  }
  // The sixteen SC2K graph series, sampled monthly with half-year and
  // five-year tiers (the XGRP shape: 12 + 20 + 20 samples).
  const GRAPH_SERIES = Object.freeze(["citySize", "residents", "commerce", "industry", "traffic", "pollution", "value", "crime",
    "powerPercent", "waterPercent", "health", "education", "unemployment", "gnp", "nationalPopulation", "fedRate"]);
  const GRAPH_TIERS = Object.freeze({ monthly: 12, halfYearly: 20, fiveYearly: 20 });
  function makeEmptyGraphs() {
    const out = {};
    for (const tier of Object.keys(GRAPH_TIERS)) { out[tier] = {}; for (const series of GRAPH_SERIES) out[tier][series] = []; }
    return out;
  }
  function makeEmptyBudget() {
    return { income: 0, taxes: { r: 0, c: 0, i: 0 }, ordinanceIncome: 0, ordinanceCost: 0,
      roads: 0, highways: 0, bridges: 0, rail: 0, subway: 0, tunnels: 0,
      police: 0, fire: 0, health: 0, schools: 0, colleges: 0, bondInterest: 0, expense: 0 };
  }
  function tileCount(state) { return state.size * state.size; }
  function indexOf(state, x, y) { return y * state.size + x; }
  function inBounds(state, x, y) { return x >= 0 && y >= 0 && x < state.size && y < state.size; }
  function xyOf(state, i) { return { x: i % state.size, y: Math.floor(i / state.size) }; }

  function makeLayers(count) {
    return {
      terrain: new Uint8Array(count), alt: new Uint8Array(count), water: new Uint8Array(count), shore: new Uint8Array(count), slope: new Uint8Array(count), tree: new Uint8Array(count),
      road: new Uint8Array(count), rail: new Uint8Array(count), wire: new Uint8Array(count), pipe: new Uint8Array(count), park: new Uint8Array(count),
      zone: new Uint8Array(count), density: new Uint8Array(count), stage: new Uint8Array(count), buildingState: new Uint8Array(count),
      constructionTimer: new Uint16Array(count), variant: new Uint8Array(count),
      // v3 durable layers for the SC2K-native model. catalogId carries an
      // explicit XBLD-aligned tile id; 0 means "derive from sim state", so
      // imports can preserve buildings the sim does not simulate yet.
      catalogId: new Uint8Array(count), subway: new Uint8Array(count), waterLevel: new Uint8Array(count),
      salt: new Uint8Array(count), rotate: new Uint8Array(count), tunnel: new Uint8Array(count), waterKind: new Uint8Array(count),
      highway: new Uint8Array(count), onramp: new Uint8Array(count),
      // blaze: 0 none, 1..4 burning (age), 5 burns out to rubble, 6 flooded.
      blaze: new Uint8Array(count),
    };
  }
  function installLayers(state, layers) { Object.keys(layers).forEach((key) => { state[key] = layers[key]; }); }

  function terrainWater(preset, x, y, size, seed, noise, threshold) {
    if (preset === "river") {
      const center = size * 0.5 + Math.round((smoothNoise(0, y, 1 / 13, seed + 404) - 0.5) * 12);
      return Math.abs(x - center) <= 2 + (latticeInt(0, y, seed + 14) % 2);
    }
    if (preset === "lake") {
      const cx = size * (0.45 + (latticeHash(1, 0, seed) - 0.5) * 0.16); const cy = size * (0.50 + (latticeHash(0, 1, seed) - 0.5) * 0.16);
      const rx = size * 0.20; const ry = size * 0.16;
      return ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) + (noise - 0.5) * 0.3 < 1;
    }
    if (preset === "coast") return x < size * 0.24 + (smoothNoise(0, y, 1 / 15, seed + 505) - 0.5) * 10;
    // Mountains keep only the deepest valleys wet; the ridge does the rest.
    if (preset === "mountain") return noise <= threshold * 0.35;
    return noise <= threshold;
  }

  function recomputeTerrainEdges(state) {
    state.shore.fill(0); state.slope.fill(0);
    const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
      const i = indexOf(state, x, y); let slope = 0;
      for (let d = 0; d < neighbors.length; d += 1) {
        const nx = x + neighbors[d][0]; const ny = y + neighbors[d][1];
        if (!inBounds(state, nx, ny)) continue;
        const ni = indexOf(state, nx, ny);
        if (!state.water[i] && state.water[ni]) state.shore[i] = 1;
        if (state.alt[ni] > state.alt[i]) slope |= (1 << d);
      }
      state.slope[i] = slope;
    }
  }

  function findSpawnCenter(state) {
    let best = { x: Math.floor(state.size / 2), y: Math.floor(state.size / 2), score: -1 };
    for (let y = 4; y < state.size - 4; y += 1) for (let x = 4; x < state.size - 4; x += 1) {
      const base = state.alt[indexOf(state, x, y)]; let score = 0;
      for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
        const i = indexOf(state, x + dx, y + dy);
        if (!state.water[i] && Math.abs(state.alt[i] - base) <= 1) score += 1;
      }
      if (score > best.score) best = { x, y, score };
    }
    return { x: best.x, y: best.y };
  }

  function generateTerrain(state) {
    const count = tileCount(state); const noise = new Float64Array(count);
    for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) noise[indexOf(state, x, y)] = fractalNoise(x, y, state.seed);
    const sorted = Array.from(noise).sort((a, b) => a - b); const threshold = sorted[Math.floor(count * 0.23)];
    for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
      const i = indexOf(state, x, y); const wet = terrainWater(state.terrainPreset, x, y, state.size, state.seed, noise[i], threshold);
      state.water[i] = wet ? 1 : 0; state.terrain[i] = wet ? 0 : 1 + (latticeInt(x, y, state.seed + 707) % 3);
      // The mountain preset raises a diagonal ridge over the same noise
      // field, so the map climbs toward its spine instead of rolling.
      const ridge = state.terrainPreset === "mountain"
        ? Math.max(0, 12 - Math.abs(x + y - state.size) * 24 / state.size) + noise[i] * 8 : 0;
      state.alt[i] = wet ? 0 : 1 + Math.min(MAX_ALT - 1, Math.floor(noise[i] * 6 + ridge));
      state.waterKind[i] = wet ? 1 : 0; state.salt[i] = wet && state.terrainPreset === "coast" ? 1 : 0;
    }
    for (let pass = 0; pass < 2; pass += 1) {
      for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
        const i = indexOf(state, x, y); if (state.water[i]) continue;
        if (x > 0) state.alt[i] = Math.min(state.alt[i], state.alt[i - 1] + 1);
        if (y > 0) state.alt[i] = Math.min(state.alt[i], state.alt[i - state.size] + 1);
      }
      for (let y = state.size - 1; y >= 0; y -= 1) for (let x = state.size - 1; x >= 0; x -= 1) {
        const i = indexOf(state, x, y); if (state.water[i]) continue;
        if (x + 1 < state.size) state.alt[i] = Math.min(state.alt[i], state.alt[i + 1] + 1);
        if (y + 1 < state.size) state.alt[i] = Math.min(state.alt[i], state.alt[i + state.size] + 1);
      }
    }
    recomputeTerrainEdges(state);
    for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
      const i = indexOf(state, x, y);
      if (!state.water[i] && !state.shore[i] && smoothNoise(x, y, 1 / 7, state.seed + 909) > 0.68) {
        state.tree[i] = 1; state.variant[i] = latticeInt(x, y, state.seed + 77) % 8;
      }
    }
    state.spawnCenter = findSpawnCenter(state);
  }

  function allocateDerived(state) {
    const count = tileCount(state);
    for (const key of ["over", "powered", "watered", "roadOk", "railConnected", "railOk", "congested", "policeCovered", "fireCovered", "educationCovered", "healthCovered", "civicBonus", "landValue", "pollution", "crime", "fireRisk", "happiness", "problemCode", "lastProblemCode"]) state[key] = new Uint8Array(count);
    state.traffic = new Uint16Array(count);
    for (const key of ["facilityAt", "plantAt", "serviceAt"]) { state[key] = new Int16Array(count); state[key].fill(-1); }
    for (const key of ["buildingId", "buildingAnchor"]) { state[key] = new Int32Array(count); state[key].fill(-1); }
    state.derivedDirty = true;
  }

  function createCity(options = {}) {
    if (!Number.isInteger(options.seed)) throw new Error("bonsai-required-seed");
    const size = options.size == null ? DEFAULT_SIZE : options.size;
    if (!SUPPORTED_SIZES.includes(size)) throw new Error("bonsai-invalid-size");
    const terrainPreset = options.terrainPreset == null ? "balanced" : options.terrainPreset;
    if (!TERRAIN_PRESETS.includes(terrainPreset)) throw new Error("bonsai-invalid-terrain-preset");
    // The UI offers the four SC2K choices; imported cities carry any year.
    const yearFounded = options.yearFounded == null ? START_YEAR : options.yearFounded;
    if (!Number.isInteger(yearFounded) || yearFounded < 1000 || yearFounded > 2999) throw new Error("bonsai-invalid-year-founded");
    const seed = options.seed >>> 0;
    const state = {
      format: FORMAT, version: SAVE_VERSION, rulesetVersion: ENGINE_RULESET_VERSION,
      name: typeof options.name === "string" ? options.name : "", seed, rngState: seed | 0, size, terrainPreset, yearFounded,
      // The terrain editor is the city before it is founded: time stands
      // still, sculpting is free, and nothing else may be built yet.
      founded: options.founded !== false,
      tick: 0, speed: 0, funds: START_FUNDS, taxRate: DEFAULT_TAX, taxRates: { r: DEFAULT_TAX, c: DEFAULT_TAX, i: DEFAULT_TAX },
      bonds: [], ordinances: makeOrdinanceState(), milestone: 0, wasBroke: false, brownout: false, waterShortage: false,
      facilities: [], buildings: [], population: 0, jobs: 0, cJobs: 0, iJobs: 0, demand: { r: 55, c: 30, i: 35 }, economyIndex: 0,
      railService: { stations: 0, connectedStations: 0, connectedRailTiles: 0, passengerCapacity: 0, freightCapacity: 0, roadTrafficRelief: 0, jobs: 0 },
      subwayService: { stations: 0, connectedStations: 0, connectedSubwayTiles: 0, passengerCapacity: 0, roadTrafficRelief: 0, jobs: 0 },
      busService: { depots: 0, capacity: 0, roadTrafficRelief: 0, jobs: 0 },
      things: [],
      funding: Object.fromEntries(FUNDING_SERVICES.map((service) => [service, 100])),
      budget: makeEmptyBudget(),
      eq: 60, le: 60, workforcePercent: 41, unemployed: 0, nationalPopulation: 120000,
      graphs: makeEmptyGraphs(),
      rewardTier: 0, rewardsOffered: [], microsims: [], arcoPopulation: 0,
      disaster: null, disastersOff: false,
      scenario: null,
      newspaper: { edition: 0, extra: false, stories: [] }, paperDelivery: true,
      newsMemo: { funds: START_FUNDS, population: 0, milestone: 0, rewardTier: 0, plantExpired: false, ordinance: "", bonds: 0 },
      lastIncome: 0, lastExpense: 0, history: [], problems: [], powerCapacity: 0, powerDemand: 0, waterCapacity: 0, waterDemand: 0,
      nextCommandSequence: 1, pendingCommands: [], events: [], notices: [], rev: 1, undoStack: [], redoStack: [], sc2Sidecar: null,
    };
    installLayers(state, makeLayers(size * size)); allocateDerived(state); generateTerrain(state); syncCompatibility(state); ensureDerived(state);
    pushNotice(state, "bonsai_msg_welcome"); pushEvent(state, "city-created", { seed, size, terrainPreset });
    return state;
  }

  function syncCompatibility(state) {
    for (let i = 0; i < tileCount(state); i += 1) {
      state.over[i] = state.road[i] && state.wire[i] ? OVER_ROADWIRE : state.road[i] ? OVER_ROAD : state.wire[i] ? OVER_WIRE : state.park[i] ? OVER_PARK : OVER_NONE;
    }
    state.plants = state.facilities.filter((item) => PLANT_KINDS[item.kind]).map((item) => ({ kind: item.kind, x: item.x, y: item.y }));
    state.services = state.facilities.filter((item) => SERVICE_KINDS[item.kind]).map((item) => ({ kind: item.kind, x: item.x, y: item.y }));
  }
  function markDerivedDirty(state) { state.derivedDirty = true; syncCompatibility(state); }

  function rebuildFacilityLayers(state) {
    state.facilityAt.fill(-1); state.plantAt.fill(-1); state.serviceAt.fill(-1);
    state.facilities.forEach((facility, id) => {
      const spec = FACILITY_KINDS[facility.kind];
      for (let dy = 0; dy < spec.h; dy += 1) for (let dx = 0; dx < spec.w; dx += 1) {
        const i = indexOf(state, facility.x + dx, facility.y + dy); state.facilityAt[i] = id;
        if (PLANT_KINDS[facility.kind]) state.plantAt[i] = id;
        if (SERVICE_KINDS[facility.kind]) state.serviceAt[i] = id;
      }
    });
  }
  function paintReach(state, target, x, y, radius) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const span = radius - Math.abs(dy);
      for (let dx = -span; dx <= span; dx += 1) if (inBounds(state, x + dx, y + dy)) target[indexOf(state, x + dx, y + dy)] = 1;
    }
  }

  function recomputeRailService(state) {
    state.railConnected.fill(0); state.railOk.fill(0);
    const stations = state.facilities.filter((facility) => facility.kind === "station");
    const queue = []; let connectedStations = 0;
    for (const station of stations) {
      const spec = FACILITY_KINDS.station; let roadConnected = false; const adjacentRail = [];
      for (let y = station.y - 1; y <= station.y + spec.h; y += 1) for (let x = station.x - 1; x <= station.x + spec.w; x += 1) {
        if (!inBounds(state, x, y)) continue;
        const i = indexOf(state, x, y);
        if (state.road[i]) roadConnected = true;
        if (state.rail[i]) adjacentRail.push(i);
      }
      if (roadConnected && adjacentRail.length) {
        connectedStations += 1;
        adjacentRail.forEach((i) => { if (!state.railConnected[i]) { state.railConnected[i] = 1; queue.push(i); } });
        paintReach(state, state.railOk, station.x, station.y, 6);
      }
    }
    for (let head = 0; head < queue.length; head += 1) {
      const i = queue[head]; const { x, y } = xyOf(state, i); paintReach(state, state.railOk, x, y, 3);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!inBounds(state, nx, ny)) continue; const ni = indexOf(state, nx, ny);
        if (state.rail[ni] && !state.railConnected[ni]) { state.railConnected[ni] = 1; queue.push(ni); }
      }
    }
    let connectedRailTiles = 0;
    for (let i = 0; i < tileCount(state); i += 1) if (state.railConnected[i]) connectedRailTiles += 1;
    state.railService = {
      stations: stations.length,
      connectedStations,
      connectedRailTiles,
      passengerCapacity: connectedStations * 80 + connectedRailTiles * 4,
      freightCapacity: connectedStations * 60 + connectedRailTiles * 6,
      roadTrafficRelief: 0,
      jobs: connectedStations * 20,
    };

    // Subway service: a station connects when it touches both a road and the
    // underground network; connected stations flood the subway layer.
    const subwayStations = state.facilities.filter((facility) => facility.kind === "subway-station");
    const subwaySeen = new Uint8Array(tileCount(state));
    const subwayQueue = [];
    let connectedSubwayStations = 0;
    for (const station of subwayStations) {
      let roadConnected = false; const touching = [];
      for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = station.x + dx; const ny = station.y + dy;
        if (!inBounds(state, nx, ny)) continue;
        const ni = indexOf(state, nx, ny);
        if (state.road[ni]) roadConnected = true;
        if (state.subway[ni]) touching.push(ni);
      }
      if (roadConnected && touching.length) {
        connectedSubwayStations += 1;
        touching.forEach((i) => { if (!subwaySeen[i]) { subwaySeen[i] = 1; subwayQueue.push(i); } });
      }
    }
    for (let head = 0; head < subwayQueue.length; head += 1) {
      const { x, y } = xyOf(state, subwayQueue[head]);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!inBounds(state, nx, ny)) continue; const ni = indexOf(state, nx, ny);
        if (state.subway[ni] && !subwaySeen[ni]) { subwaySeen[ni] = 1; subwayQueue.push(ni); }
      }
    }
    state.subwayService = {
      stations: subwayStations.length,
      connectedStations: connectedSubwayStations,
      connectedSubwayTiles: subwayQueue.length,
      passengerCapacity: connectedSubwayStations * 90 + subwayQueue.length * 5,
      roadTrafficRelief: connectedSubwayStations ? Math.min(40, connectedSubwayStations * 15 + Math.floor(subwayQueue.length / 2)) : 0,
      jobs: connectedSubwayStations * 8,
    };

    // Bus depots relieve road traffic when they can reach a road at all.
    const depots = state.facilities.filter((facility) => facility.kind === "bus");
    let servingDepots = 0;
    for (const depot of depots) {
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        if (inBounds(state, depot.x + dx, depot.y + dy) && state.road[indexOf(state, depot.x + dx, depot.y + dy)]) { servingDepots += 1; break; }
      }
    }
    state.busService = {
      depots: depots.length,
      capacity: servingDepots * 40,
      roadTrafficRelief: Math.min(24, servingDepots * 8),
      jobs: servingDepots * 5,
    };

    // Highways carry traffic only where onramps join them to the road
    // network: flood the highway layer from every onramp that touches both
    // a road and a highway, then let relief follow the connected mileage.
    const highwaySeen = new Uint8Array(tileCount(state));
    const highwayQueue = [];
    let connectedOnramps = 0;
    for (let i = 0; i < tileCount(state); i += 1) {
      if (!state.onramp[i]) continue;
      const { x, y } = xyOf(state, i);
      let touchesRoad = false; const touching = [];
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!inBounds(state, nx, ny)) continue; const ni = indexOf(state, nx, ny);
        if (state.road[ni]) touchesRoad = true;
        if (state.highway[ni]) touching.push(ni);
      }
      if (touchesRoad && touching.length) {
        connectedOnramps += 1;
        touching.forEach((ni) => { if (!highwaySeen[ni]) { highwaySeen[ni] = 1; highwayQueue.push(ni); } });
      }
    }
    for (let head = 0; head < highwayQueue.length; head += 1) {
      const { x, y } = xyOf(state, highwayQueue[head]);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!inBounds(state, nx, ny)) continue; const ni = indexOf(state, nx, ny);
        if (state.highway[ni] && !highwaySeen[ni]) { highwaySeen[ni] = 1; highwayQueue.push(ni); }
      }
    }
    // A highway needs an entry and an exit before it carries anything.
    state.highwayService = {
      onramps: connectedOnramps,
      connectedHighwayTiles: highwayQueue.length,
      roadTrafficRelief: connectedOnramps >= 2 ? Math.min(48, connectedOnramps * 6 + Math.floor(highwayQueue.length / 4)) : 0,
    };
  }

  function recomputeTraffic(state) {
    recomputeRailService(state);
    state.roadOk.fill(0); state.traffic.fill(0); state.congested.fill(0);
    // Transit funding scales the relief a network can deliver; buses have
    // no SC2K funding line and ride at full strength.
    const railRelief = Math.floor((state.railService.connectedStations
      ? Math.min(32, state.railService.connectedStations * 12 + Math.floor(state.railService.connectedRailTiles / 2))
      : 0) * state.funding.rail / 100)
      + Math.floor(state.subwayService.roadTrafficRelief * state.funding.subway / 100)
      + Math.floor(state.highwayService.roadTrafficRelief * state.funding.highways / 100)
      + state.busService.roadTrafficRelief;
    let totalRelief = 0;
    for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
      const i = indexOf(state, x, y); if (!state.road[i]) continue; paintReach(state, state.roadOk, x, y, ROAD_REACH); let pressure = 0;
      for (let dy = -ROAD_REACH; dy <= ROAD_REACH; dy += 1) {
        const span = ROAD_REACH - Math.abs(dy);
        for (let dx = -span; dx <= span; dx += 1) {
          const nx = x + dx; const ny = y + dy; if (!inBounds(state, nx, ny)) continue; const ni = indexOf(state, nx, ny);
          if (state.zone[ni]) pressure += state.stage[ni] * (state.density[ni] === DENSITY_HIGH ? 4 : 2);
        }
      }
      const appliedRelief = Math.min(pressure, railRelief);
      totalRelief += appliedRelief;
      state.traffic[i] = Math.min(65535, pressure - appliedRelief);
    }
    for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
      const i = indexOf(state, x, y);
      if (state.road[i] && state.traffic[i] >= CONGESTION_THRESHOLD) { state.congested[i] = 1; paintReach(state, state.congested, x, y, ROAD_REACH); }
    }
    state.railService.roadTrafficRelief = totalRelief;
  }

  function recomputeUtility(state, kind) {
    const network = kind === "power" ? state.wire : state.pipe; const target = kind === "power" ? state.powered : state.watered;
    target.fill(0); const queue = []; const seen = new Uint8Array(tileCount(state)); let capacity = 0;
    const desalinated = state.facilities.some((item) => FACILITY_KINDS[item.kind].desalinates);
    state.facilities.forEach((facility) => {
      const spec = FACILITY_KINDS[facility.kind]; let amount = kind === "power" ? (spec.power || 0) : (spec.water || 0); if (!amount) return;
      if (kind === "water" && facility.kind === "pump") {
        // A pump on salt water alone produces nothing until desalination.
        let usable = false;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          if (!inBounds(state, facility.x + dx, facility.y + dy)) continue;
          const ni = indexOf(state, facility.x + dx, facility.y + dy);
          if (state.water[ni] && (!state.salt[ni] || desalinated)) usable = true;
        }
        if (!usable) amount = 0;
      }
      if (!amount) return;
      capacity += amount + (facility.kind === "wind" ? state.alt[indexOf(state, facility.x, facility.y)] * 2 : 0);
      for (let dy = 0; dy < spec.h; dy += 1) for (let dx = 0; dx < spec.w; dx += 1) {
        const i = indexOf(state, facility.x + dx, facility.y + dy); if (!seen[i]) { seen[i] = 1; queue.push(i); }
      }
    });
    // Conservation ordinances stretch the same supply further; the boost
    // lands before allocation so the meter and the served tiles agree.
    if (kind === "power" && ordinanceOn(state, "energyConservation")) capacity = Math.floor(capacity * 10 / 9);
    if (kind === "water" && ordinanceOn(state, "waterConservation")) capacity = Math.floor(capacity * 10 / 9);
    const conducts = (i) => !!network[i] || state.zone[i] !== ZONE_NONE || state.facilityAt[i] >= 0; const reached = [];
    for (let head = 0; head < queue.length; head += 1) {
      const i = queue[head]; reached.push(i); const { x, y } = xyOf(state, i);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!inBounds(state, nx, ny)) continue; const ni = indexOf(state, nx, ny);
        if (!seen[ni] && conducts(ni)) { seen[ni] = 1; queue.push(ni); }
      }
    }
    // A block that went dark for want of supply keeps its place in the queue.
    // Letting its draw fall to zero cleared the very shortage that emptied it,
    // so it rebuilt, failed again, and the neighbourhood cycled forever
    // instead of growing. The reservation is exactly what it draws once it
    // comes back at stage 1, so restoring it cannot re-open the shortage.
    const unitDraw = (i) => (state.density[i] === DENSITY_HIGH ? 2 : 1);
    const draw = (i) => {
      if (!state.zone[i]) return 0;
      if (state.stage[i]) return state.stage[i] * unitDraw(i);
      const building = state.buildingState[i];
      return building === BUILDING_ABANDONED || building === BUILDING_DECLINING ? unitDraw(i) : 0;
    };
    // The grid is handed out against what each plot will draw once it stands.
    // Empty land that needs nothing used to read as connected even on a full
    // grid, so a saturated city kept starting blocks it could never carry and
    // they died the day they opened. The meter reports the same figure it
    // allocates, so "supply 90 / demand 120" and the dark plots agree.
    const need = (i) => (state.zone[i] ? Math.max(draw(i), unitDraw(i)) : draw(i));
    let demand = 0; for (const i of reached) demand += need(i);
    let served = 0;
    for (const i of reached) {
      const amount = need(i);
      if (served + amount <= capacity) { target[i] = 1; served += amount; }
    }
    if (kind === "power") { state.powerCapacity = capacity; state.powerDemand = demand; state.brownout = demand > capacity; }
    else { state.waterCapacity = capacity; state.waterDemand = demand; state.waterShortage = demand > capacity; }
  }

  function recomputeCoverageAndRisks(state) {
    state.policeCovered.fill(0); state.fireCovered.fill(0); state.educationCovered.fill(0); state.healthCovered.fill(0); state.civicBonus.fill(0); state.pollution.fill(0);
    const coverage = { police: state.policeCovered, fire: state.fireCovered, school: state.educationCovered, clinic: state.healthCovered };
    state.facilities.forEach((facility) => {
      const spec = FACILITY_KINDS[facility.kind];
      if (coverage[facility.kind]) paintReach(state, coverage[facility.kind], facility.x, facility.y, Math.max(0, Math.round(spec.radius * state.funding[spec.group] / 100)));
      if (spec.valueBonus) {
        for (let dy = -spec.radius; dy <= spec.radius; dy += 1) {
          const span = spec.radius - Math.abs(dy);
          for (let dx = -span; dx <= span; dx += 1) {
            if (!inBounds(state, facility.x + dx, facility.y + dy)) continue;
            const i = indexOf(state, facility.x + dx, facility.y + dy);
            state.civicBonus[i] = Math.min(40, state.civicBonus[i] + spec.valueBonus);
          }
        }
      }
      if (spec.pollution) for (let dy = -5; dy <= 5; dy += 1) for (let dx = -5; dx <= 5; dx += 1) {
        const distance = Math.abs(dx) + Math.abs(dy); if (distance > 5 || !inBounds(state, facility.x + dx, facility.y + dy)) continue;
        const i = indexOf(state, facility.x + dx, facility.y + dy); state.pollution[i] = Math.min(255, state.pollution[i] + Math.max(0, spec.pollution - distance * 10));
      }
    });
    // Ordinance effects live at the same hooks the base rates use.
    const industryPollution = ordinanceOn(state, "pollutionControls") ? 24 : 28;
    const crimeShift = (ordinanceOn(state, "legalizedGambling") ? 5 : 0)
      - (ordinanceOn(state, "antiDrug") ? 8 : 0) - (ordinanceOn(state, "neighborhoodWatch") ? 6 : 0);
    const happinessShift = (ordinanceOn(state, "annualCarnival") ? 2 : 0) + (ordinanceOn(state, "juniorSports") ? 2 : 0);
    for (let i = 0; i < tileCount(state); i += 1) {
      if (state.zone[i] === ZONE_I && state.stage[i]) state.pollution[i] = Math.min(255, state.pollution[i] + state.stage[i] * industryPollution);
      const activity = state.stage[i] * (state.density[i] === DENSITY_HIGH ? 8 : 4);
      state.crime[i] = Math.max(0, Math.min(255, 18 + crimeShift + activity + (state.congested[i] ? 15 : 0) - (state.policeCovered[i] ? 32 : 0)));
      state.fireRisk[i] = Math.max(0, Math.min(255, 8 + activity + Math.floor(state.pollution[i] / 5) - (state.fireCovered[i] ? 30 : 0)));
      state.landValue[i] = Math.max(0, Math.min(255, 25 + state.civicBonus[i] + (state.roadOk[i] ? 12 : 0) + (state.railOk[i] ? 10 : 0) + (state.powered[i] ? 8 : 0) + (state.watered[i] ? 8 : 0)
        + (state.park[i] ? 25 : 0) + (state.educationCovered[i] ? 8 : 0) + (state.healthCovered[i] ? 8 : 0) - Math.floor(state.pollution[i] / 3) - (state.congested[i] ? 20 : 0)));
      state.happiness[i] = Math.max(0, Math.min(100, 58 + happinessShift + Math.floor(state.landValue[i] / 8) - Math.floor(state.crime[i] / 6)
        - Math.floor(state.fireRisk[i] / 8) - Math.floor(state.pollution[i] / 7) - Math.max(0, state.taxRate - DEFAULT_TAX) * 3));
    }
  }

  function canGroupBuilding(state, x, y, side, zone, stage) {
    if (x + side > state.size || y + side > state.size) return false;
    for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) {
      const i = indexOf(state, x + dx, y + dy);
      if (state.buildingId[i] >= 0 || state.zone[i] !== zone || state.density[i] !== DENSITY_HIGH || state.stage[i] < stage || state.buildingState[i] !== BUILDING_ACTIVE) return false;
    }
    return true;
  }
  function rebuildBuildingsAndCounts(state) {
    state.buildingId.fill(-1); state.buildingAnchor.fill(-1); state.buildings = []; let population = 0; let cJobs = 0; let iJobs = 0;
    for (let y = 0; y < state.size; y += 1) for (let x = 0; x < state.size; x += 1) {
      const i = indexOf(state, x, y);
      if (!state.zone[i] || !state.stage[i] || state.buildingState[i] === BUILDING_ABANDONED || state.buildingId[i] >= 0) continue;
      let side = 1;
      if (state.stage[i] >= 3 && canGroupBuilding(state, x, y, 3, state.zone[i], 3)) side = 3;
      else if (state.stage[i] >= 2 && canGroupBuilding(state, x, y, 2, state.zone[i], 2)) side = 2;
      const id = state.buildings.length; const anchor = indexOf(state, x, y); let minStage = state.stage[i];
      for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) {
        const ti = indexOf(state, x + dx, y + dy); state.buildingId[ti] = id; state.buildingAnchor[ti] = anchor; minStage = Math.min(minStage, state.stage[ti]);
      }
      state.buildings.push({ id, x, y, w: side, h: side, zone: state.zone[i], stage: minStage, state: state.buildingState[i], variant: state.variant[i] });
      const cells = side * side; const densityFactor = state.density[i] === DENSITY_HIGH ? 2 : 1;
      if (state.zone[i] === ZONE_R) population += cells * minStage * 8 * densityFactor;
      else if (state.zone[i] === ZONE_C) cJobs += cells * minStage * 6 * densityFactor;
      else iJobs += cells * minStage * 8 * densityFactor;
    }
    // Transit jobs count as commercial work; military tiles employ on the
    // industrial side; arcologies house their own population.
    let militaryTiles = 0;
    for (let i = 0; i < tileCount(state); i += 1) if (state.zone[i] === ZONE_MILITARY) militaryTiles += 1;
    state.population = population; state.cJobs = cJobs + state.railService.jobs + state.subwayService.jobs + state.busService.jobs; state.iJobs = iJobs + militaryTiles * 2;
    state.jobs = state.cJobs + state.iJobs;
    state.arcoPopulation = state.facilities.filter((item) => item.kind === "arco").length * (FACILITY_KINDS.arco.population || 0);
  }

  function recomputeProblems(state) {
    const problems = []; state.problemCode.fill(PROBLEM.NONE); const demandByZone = [0, state.demand.r, state.demand.c, state.demand.i];
    for (let i = 0; i < tileCount(state); i += 1) {
      if (!state.zone[i]) continue;
      if (state.zone[i] > ZONE_I) { state.problemCode[i] = PROBLEM.NONE; continue; }
      let code = PROBLEM.NONE;
      if (!state.roadOk[i]) code = PROBLEM.NO_ROAD; else if (!state.powered[i]) code = PROBLEM.NO_POWER; else if (!state.watered[i]) code = PROBLEM.NO_WATER;
      else if (state.congested[i]) code = PROBLEM.CONGESTED; else if (demandByZone[state.zone[i]] <= 0) code = PROBLEM.NO_DEMAND;
      else if (state.pollution[i] >= 100 && state.zone[i] === ZONE_R) code = PROBLEM.POLLUTION;
      state.problemCode[i] = code;
      if (code && problems.length < 64) { const pos = xyOf(state, i); problems.push({ code: PROBLEM_NAMES[code], x: pos.x, y: pos.y, action: PROBLEM_ACTIONS[code] }); }
    }
    state.problems = problems;
  }
  function publishProblemChanges(state) {
    for (let i = 0; i < tileCount(state); i += 1) if (state.problemCode[i] !== state.lastProblemCode[i]) {
      const code = state.problemCode[i]; const pos = xyOf(state, i);
      pushEvent(state, "problem-changed", { code: PROBLEM_NAMES[code], previousCode: PROBLEM_NAMES[state.lastProblemCode[i]], x: pos.x, y: pos.y, action: PROBLEM_ACTIONS[code] });
    }
    state.lastProblemCode.set(state.problemCode);
  }
  function ensureDerived(state, emitProblemChanges = false) {
    if (state.derivedDirty) {
      rebuildFacilityLayers(state); recomputeTraffic(state); recomputeUtility(state, "power"); recomputeUtility(state, "water");
      recomputeCoverageAndRisks(state); rebuildBuildingsAndCounts(state); recomputeProblems(state); state.derivedDirty = false;
    }
    if (emitProblemChanges) publishProblemChanges(state);
  }

  function canonicalStringify(value) {
    if (value === null) return "null"; const kind = typeof value;
    if (kind === "number") { if (!Number.isFinite(value)) throw new Error("bonsai-canonical-non-finite"); return String(value); }
    if (kind === "boolean") return value ? "true" : "false"; if (kind === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
    if (kind === "object") { const keys = Object.keys(value).sort(); return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`; }
    throw new Error("bonsai-canonical-unsupported");
  }
  function pushNotice(state, key) { state.notices.push(key); if (state.notices.length > 8) state.notices.shift(); }
  function drainNotices(state) { const out = state.notices; state.notices = []; return out; }
  function pushEvent(state, type, payload, sequence = 0) {
    const event = { schemaVersion: EVENT_SCHEMA_VERSION, tick: state.tick, sequence, type, payload: payload == null ? null : payload };
    state.events.push(event); if (state.events.length > MAX_EVENTS) state.events.shift(); return event;
  }
  function drainEvents(state) { const out = state.events; state.events = []; return out; }

  function normalizeArea(payload) {
    if (!payload || typeof payload !== "object") return null;
    const x = Number.isInteger(payload.x) ? payload.x : payload.start && payload.start.x; const y = Number.isInteger(payload.y) ? payload.y : payload.start && payload.start.y;
    let width = Number.isInteger(payload.width) ? payload.width : 1; let height = Number.isInteger(payload.height) ? payload.height : 1;
    if (payload.end && Number.isInteger(payload.end.x) && Number.isInteger(payload.end.y) && Number.isInteger(x) && Number.isInteger(y)) {
      width = Math.abs(payload.end.x - x) + 1; height = Math.abs(payload.end.y - y) + 1;
      return { x: Math.min(x, payload.end.x), y: Math.min(y, payload.end.y), width, height };
    }
    return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 ? { x, y, width, height } : null;
  }
  function areaTiles(area) { const out = []; for (let dy = 0; dy < area.height; dy += 1) for (let dx = 0; dx < area.width; dx += 1) out.push({ x: area.x + dx, y: area.y + dy }); return out; }
  function pathTiles(payload) {
    let points = Array.isArray(payload && payload.points) ? payload.points : null; if (!points && payload && payload.start && payload.end) points = [payload.start, payload.end];
    if (!points || !points.length) return null; const out = []; const seen = new Set();
    const add = (x, y) => { const key = `${x},${y}`; if (!seen.has(key)) { seen.add(key); out.push({ x, y }); } };
    for (let p = 0; p < points.length; p += 1) {
      const point = points[p]; if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)) return null;
      if (!p) { add(point.x, point.y); continue; }
      let x = points[p - 1].x; let y = points[p - 1].y;
      while (x !== point.x) { x += point.x > x ? 1 : -1; add(x, y); } while (y !== point.y) { y += point.y > y ? 1 : -1; add(x, y); }
    }
    return out;
  }
  // Every highway path point becomes a 2x2 pad anchored at the point; at the
  // far map edges the pad shifts back one tile so the ribbon stays two wide.
  function highwayStamp(state, tiles) {
    if (!tiles) return null; const out = []; const seen = new Set();
    for (const tile of tiles) {
      const baseX = Math.min(tile.x, state.size - 2); const baseY = Math.min(tile.y, state.size - 2);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const key = `${baseX + dx},${baseY + dy}`;
        if (!seen.has(key)) { seen.add(key); out.push({ x: baseX + dx, y: baseY + dy }); }
      }
    }
    return out.length ? out : null;
  }
  function footprintBounds(tiles) {
    if (!tiles.length) return null; let minX = tiles[0].x; let maxX = minX; let minY = tiles[0].y; let maxY = minY;
    tiles.forEach((tile) => { minX = Math.min(minX, tile.x); maxX = Math.max(maxX, tile.x); minY = Math.min(minY, tile.y); maxY = Math.max(maxY, tile.y); });
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }
  function receipt(plan, extra = {}) {
    const tiles = plan && plan.tiles ? plan.tiles.map((tile) => ({ x: tile.x, y: tile.y })) : [];
    return { schemaVersion: 2, accepted: !!(plan && plan.accepted), code: plan ? plan.code : "schema", cost: plan ? plan.cost || 0 : 0,
      footprint: { tiles, bounds: footprintBounds(tiles) }, sequence: extra.sequence || 0, queued: !!extra.queued,
      transactionId: extra.transactionId || "", events: extra.events || [] };
  }
  function reject(code, tiles = []) { return { accepted: false, code, cost: 0, tiles }; }
  function accept(action, cost, tiles, data = {}) { return { accepted: true, code: "ok", action, cost, tiles, data }; }

  function normalizeCommand(command) {
    if (!command || typeof command !== "object" || Array.isArray(command)) return { error: "schema" };
    if (command.schemaVersion === 2) return { command: { schemaVersion: 2, type: command.type, payload: command.payload && typeof command.payload === "object" ? { ...command.payload } : {}, targetTick: command.targetTick, clientCommandId: typeof command.clientCommandId === "string" ? command.clientCommandId : "" }, originalType: command.type };
    if (command.schemaVersion !== 1) return { error: "schema-version" };
    const p = command.payload && typeof command.payload === "object" ? command.payload : {}; const common = { schemaVersion: 2, targetTick: command.targetTick, clientCommandId: typeof command.clientCommandId === "string" ? command.clientCommandId : "" };
    if (["road", "rail", "wire", "pipe", "park"].includes(command.type)) return { command: { ...common, type: "build-path", payload: { network: command.type, points: [{ x: p.x, y: p.y }] } }, originalType: command.type };
    if (["residential", "commercial", "industrial"].includes(command.type)) return { command: { ...common, type: "zone-area", payload: { zone: command.type, density: "low", x: p.x, y: p.y, width: 1, height: 1 } }, originalType: command.type };
    if (FACILITY_KINDS[command.type]) return { command: { ...common, type: "place-facility", payload: { kind: command.type, x: p.x, y: p.y } }, originalType: command.type };
    if (command.type === "bulldoze") return { command: { ...common, type: "demolish-area", payload: { x: p.x, y: p.y, width: 1, height: 1 } }, originalType: command.type };
    if (command.type === "set-tax") return { command: { ...common, type: "set-policy", payload: { policy: "tax-rate", taxRate: p.taxRate } }, originalType: command.type };
    if (command.type === "set-funding") return { command: { ...common, type: "set-policy", payload: { policy: "funding", service: p.service, level: p.level } }, originalType: command.type };
    if (command.type === "query") return { error: "view-only" }; return { error: "unknown-type" };
  }

  function unitCost(command) {
    if (!command || typeof command !== "object") return null;
    const payload = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "build-path") return Object.prototype.hasOwnProperty.call(NETWORK_COST, payload.network) ? NETWORK_COST[payload.network] : null;
    if (command.type === "zone-area") {
      if (payload.zone === "seaport" || payload.zone === ZONE_SEAPORT) return PORT_ZONE_COST.seaport;
      if (payload.zone === "airport" || payload.zone === ZONE_AIRPORT) return PORT_ZONE_COST.airport;
      return payload.density === "high" || payload.density === DENSITY_HIGH ? ZONE_COST.high : payload.density === "low" || payload.density == null || payload.density === DENSITY_LOW ? ZONE_COST.low : null;
    }
    if (command.type === "place-facility") return FACILITY_KINDS[payload.kind] ? FACILITY_KINDS[payload.kind].cost : null;
    if (command.type === "terraform-area") return Object.prototype.hasOwnProperty.call(TERRAFORM_COST, payload.mode) ? TERRAFORM_COST[payload.mode] : null;
    if (command.type === "demolish-area") return COSTS.demolish;
    if (command.type === "set-policy") return 0;
    return null;
  }

  function planCommand(state, command) {
    const { type, payload } = command;
    if (!["build-path", "zone-area", "place-facility", "terraform-area", "demolish-area", "set-policy", "trigger-disaster"].includes(type)) return reject("unknown-type");
    // Only sculpting and founding exist before the city does.
    if (!state.founded && type !== "terraform-area" && !(type === "set-policy" && payload.policy === "found-city")) return reject("not-founded");
    if (type === "trigger-disaster") {
      if (!DISASTER_KINDS[payload.kind]) return reject("disaster-kind");
      if (state.disaster) return reject("disaster-active");
      const x = Number.isInteger(payload.x) ? payload.x : Math.floor(state.size / 2);
      const y = Number.isInteger(payload.y) ? payload.y : Math.floor(state.size / 2);
      if (!inBounds(state, x, y)) return reject("bounds");
      return accept("trigger-disaster", 0, [], { kind: payload.kind, x, y });
    }
    if (type === "build-path") {
      const network = payload.network; const layer = state[network];
      // A highway is two tiles wide: every dragged point stamps a 2x2 pad,
      // pulled back inside the map at the far edges.
      const tiles = network === "highway" ? highwayStamp(state, pathTiles(payload)) : pathTiles(payload);
      if (!NETWORK_COST[network] || !layer || !tiles) return reject("payload"); const changed = [];
      for (const tile of tiles) {
        if (!inBounds(state, tile.x, tile.y)) return reject("bounds", tiles); const i = indexOf(state, tile.x, tile.y);
        // Roads, rails, power lines, and highways bridge water; pipes,
        // subways, and parks stop at the shore.
        if (state.water[i] && !BRIDGE_COST[network]) return reject("water", tiles);
        if ((network === "road" || network === "rail" || network === "park" || network === "highway" || network === "onramp") && (state.zone[i] || state.facilityAt[i] >= 0)) return reject("occupied", tiles);
        if (!layer[i]) changed.push(tile);
      }
      // An onramp is the joint between the two networks: it must touch a
      // road on one side and a highway on another before it can exist.
      if (network === "onramp") for (const tile of tiles) {
        let touchesRoad = false; let touchesHighway = false;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          if (!inBounds(state, tile.x + dx, tile.y + dy)) continue;
          const ni = indexOf(state, tile.x + dx, tile.y + dy);
          if (state.road[ni]) touchesRoad = true;
          if (state.highway[ni]) touchesHighway = true;
        }
        if (!touchesRoad || !touchesHighway) return reject("onramp-connection", tiles);
      }
      // Underground lines do not care about surface slopes, and a bridge
      // deck levels itself over the water; only land-to-land steps count.
      if (network !== "subway") for (let i = 1; i < tiles.length; i += 1) {
        const previous = indexOf(state, tiles[i - 1].x, tiles[i - 1].y);
        const current = indexOf(state, tiles[i].x, tiles[i].y);
        if (state.water[previous] || state.water[current]) continue;
        if (Math.abs(state.alt[previous] - state.alt[current]) > 1) return reject("slope", tiles);
      }
      if (!changed.length) return reject("empty", tiles);
      let cost = 0;
      for (const tile of changed) cost += state.water[indexOf(state, tile.x, tile.y)] ? BRIDGE_COST[network] : NETWORK_COST[network];
      return state.funds < cost ? reject("funds", tiles) : accept("build-path", cost, changed, { network });
    }
    if (type === "zone-area") {
      const area = normalizeArea(payload);
      const portKind = payload.zone === "seaport" || payload.zone === ZONE_SEAPORT ? "seaport" : payload.zone === "airport" || payload.zone === ZONE_AIRPORT ? "airport" : "";
      const military = payload.zone === "military" || payload.zone === ZONE_MILITARY;
      if (military && !state.rewardsOffered.includes("military-base")) return reject("reward-locked");
      const zone = payload.zone === "residential" || payload.zone === ZONE_R ? ZONE_R : payload.zone === "commercial" || payload.zone === ZONE_C ? ZONE_C : payload.zone === "industrial" || payload.zone === ZONE_I ? ZONE_I
        : portKind === "seaport" ? ZONE_SEAPORT : portKind === "airport" ? ZONE_AIRPORT : military ? ZONE_MILITARY : 0;
      const density = portKind || military ? DENSITY_LOW : payload.density === "high" || payload.density === DENSITY_HIGH ? DENSITY_HIGH : payload.density === "low" || payload.density == null || payload.density === DENSITY_LOW ? DENSITY_LOW : 0;
      if (!area || !zone || !density) return reject("payload");
      // A port needs room for its pieces before it can grow at all.
      if (portKind && area.width * area.height < PORT_MIN_TILES[portKind]) return reject("port-too-small");
      const requested = areaTiles(area);
      // A drag zones the land it legally can and steps over the rest, the way
      // build-path and demolish-area already do. Rejecting the whole rectangle
      // made zoning impossible the moment a road, a tree, or an earlier zone
      // stood inside it — which is exactly when a player wants to zone.
      const tiles = []; let blocked = ""; let baseAlt = -1;
      for (const tile of requested) {
        // Off the map is still a hard refusal: a drag is clamped to the map
        // before it gets here, so an out-of-bounds area is a malformed
        // command rather than a player running out of room.
        if (!inBounds(state, tile.x, tile.y)) return reject("bounds", requested); const i = indexOf(state, tile.x, tile.y);
        if (state.water[i]) { blocked ||= "water"; continue; }
        if (state.road[i] || state.rail[i] || state.park[i] || state.facilityAt[i] >= 0 || state.zone[i]) { blocked ||= "occupied"; continue; }
        // Zoned land stays flat: the first tile the drag accepts sets the
        // bench, and anything more than one step off it is left alone.
        const alt = state.alt[i]; if (baseAlt < 0) baseAlt = alt; else if (Math.abs(alt - baseAlt) > 1) { blocked ||= "slope"; continue; }
        tiles.push(tile);
      }
      if (!tiles.length) return reject(blocked || "empty", requested);
      if (portKind && tiles.length < PORT_MIN_TILES[portKind]) return reject("port-too-small", requested);
      // A military base is placed by the nation, not billed to the city.
      const cost = military ? 0 : tiles.length * (portKind ? PORT_ZONE_COST[portKind] : density === DENSITY_HIGH ? ZONE_COST.high : ZONE_COST.low);
      return state.funds < cost ? reject("funds", tiles) : accept("zone-area", cost, tiles, { zone, density });
    }
    if (type === "place-facility") {
      const spec = FACILITY_KINDS[payload.kind]; if (!spec || !Number.isInteger(payload.x) || !Number.isInteger(payload.y)) return reject("payload");
      const tiles = areaTiles({ x: payload.x, y: payload.y, width: spec.w, height: spec.h });
      if (spec.tech && dateOf(state).year < spec.tech) return reject("tech-year", tiles);
      if (payload.kind === "nuclear" && ordinanceOn(state, "nuclearFreeZone")) return reject("nuclear-free-zone", tiles);
      if (spec.reward) {
        if (!state.rewardsOffered.includes(payload.kind)) return reject("reward-locked", tiles);
        if (!spec.repeatable && state.facilities.some((item) => item.kind === payload.kind)) return reject("reward-placed", tiles);
      }
      const baseAlt = inBounds(state, payload.x, payload.y) ? state.alt[indexOf(state, payload.x, payload.y)] : -1;
      for (const tile of tiles) {
        if (!inBounds(state, tile.x, tile.y)) return reject("bounds", tiles); const i = indexOf(state, tile.x, tile.y);
        // A hydro plant sits on the waterfall itself; every other facility
        // needs dry, level ground.
        if (spec.needsWaterfall) { if (state.waterKind[i] !== 2) return reject("needs-waterfall", tiles); }
        else if (state.water[i]) return reject("water", tiles);
        if (!spec.needsWaterfall && state.alt[i] !== baseAlt) return reject("uneven", tiles);
        if (state.facilityAt[i] >= 0 || state.zone[i] || state.road[i] || state.rail[i] || state.park[i]) return reject("occupied", tiles);
      }
      if (payload.kind === "pump") {
        // Pumps need adjacent water, and salt water counts only once the
        // city runs a desalination plant.
        const desalinated = state.facilities.some((item) => FACILITY_KINDS[item.kind].desalinates);
        let nearUsableWater = false;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          if (!inBounds(state, payload.x + dx, payload.y + dy)) continue;
          const ni = indexOf(state, payload.x + dx, payload.y + dy);
          if (state.water[ni] && (!state.salt[ni] || desalinated)) nearUsableWater = true;
        }
        if (!nearUsableWater) return reject("needs-water", tiles);
      }
      if (payload.kind === "station") {
        let nearRail = false; let nearRoad = false;
        for (let y = payload.y - 1; y <= payload.y + spec.h; y += 1) for (let x = payload.x - 1; x <= payload.x + spec.w; x += 1) if (inBounds(state, x, y)) {
          const i = indexOf(state, x, y); if (state.rail[i]) nearRail = true; if (state.road[i]) nearRoad = true;
        }
        if (!nearRail || !nearRoad) return reject("needs-transport", tiles);
      }
      if (payload.kind === "subway-station") {
        let nearSubway = false; let nearRoad = false;
        for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
          if (!inBounds(state, payload.x + dx, payload.y + dy)) continue;
          const i = indexOf(state, payload.x + dx, payload.y + dy);
          if (state.subway[i]) nearSubway = true; if (state.road[i]) nearRoad = true;
        }
        if (!nearSubway || !nearRoad) return reject("needs-transport", tiles);
      }
      return state.funds < spec.cost ? reject("funds", tiles) : accept("place-facility", spec.cost, tiles, { kind: payload.kind, x: payload.x, y: payload.y });
    }
    if (type === "terraform-area") {
      const area = normalizeArea(payload); if (!area || !TERRAFORM_COST[payload.mode]) return reject("payload"); const tiles = areaTiles(area); const desired = new Map();
      const target = payload.mode === "level" && Number.isInteger(payload.targetAlt) ? payload.targetAlt : tiles.length && inBounds(state, tiles[0].x, tiles[0].y) ? state.alt[indexOf(state, tiles[0].x, tiles[0].y)] : 0;
      for (const tile of tiles) {
        if (!inBounds(state, tile.x, tile.y)) return reject("bounds", tiles); const i = indexOf(state, tile.x, tile.y);
        if (state.water[i]) return reject("water", tiles); if (state.facilityAt[i] >= 0 || state.zone[i] || state.road[i] || state.rail[i] || state.wire[i] || state.pipe[i]) return reject("occupied", tiles);
        const value = payload.mode === "raise" ? state.alt[i] + 1 : payload.mode === "lower" ? state.alt[i] - 1 : payload.mode === "level" ? target : state.alt[i];
        if (value < 1 || value > MAX_ALT) return reject("altitude", tiles); desired.set(i, value);
      }
      if (payload.mode !== "tree") for (const tile of tiles) {
        const i = indexOf(state, tile.x, tile.y); const value = desired.get(i);
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (inBounds(state, tile.x + dx, tile.y + dy)) {
          const ni = indexOf(state, tile.x + dx, tile.y + dy); const neighbor = desired.has(ni) ? desired.get(ni) : state.alt[ni];
          if (!state.water[ni] && Math.abs(value - neighbor) > 1) return reject("slope", tiles);
        }
      }
      const changed = tiles.filter((tile) => { const i = indexOf(state, tile.x, tile.y); return payload.mode === "tree" ? !state.tree[i] : desired.get(i) !== state.alt[i]; });
      if (!changed.length) return reject("empty", tiles);
      // Sculpting is free until the city is founded.
      const cost = state.founded ? changed.length * TERRAFORM_COST[payload.mode] : 0;
      return state.funds < cost ? reject("funds", changed) : accept("terraform-area", cost, changed, { mode: payload.mode, desired });
    }
    if (type === "demolish-area") {
      const area = normalizeArea(payload); if (!area) return reject("payload"); const requested = areaTiles(area); const expanded = new Map(); const facilityIds = new Set();
      for (const tile of requested) {
        if (!inBounds(state, tile.x, tile.y)) return reject("bounds", requested); const i = indexOf(state, tile.x, tile.y); expanded.set(`${tile.x},${tile.y}`, tile);
        if (state.facilityAt[i] >= 0) facilityIds.add(state.facilityAt[i]);
      }
      facilityIds.forEach((id) => { const facility = state.facilities[id]; const spec = FACILITY_KINDS[facility.kind]; areaTiles({ x: facility.x, y: facility.y, width: spec.w, height: spec.h }).forEach((tile) => expanded.set(`${tile.x},${tile.y}`, tile)); });
      const tiles = Array.from(expanded.values()); const changed = tiles.filter((tile) => {
        const i = indexOf(state, tile.x, tile.y); return state.facilityAt[i] >= 0 || state.road[i] || state.rail[i] || state.wire[i] || state.pipe[i] || state.park[i] || state.zone[i] || state.tree[i] || state.highway[i] || state.onramp[i];
      });
      if (!changed.length) return reject("empty", tiles); const cost = changed.length * 3;
      return state.funds < cost ? reject("funds", changed) : accept("demolish-area", cost, changed, { facilityIds: Array.from(facilityIds).sort((a, b) => a - b) });
    }
    if (payload.policy === "tax-rate") {
      if (!Number.isInteger(payload.taxRate) || payload.taxRate < 0 || payload.taxRate > MAX_TAX_RATE) return reject("tax-rate");
      return accept("set-policy", 0, [], { policy: "tax-rate", taxRate: payload.taxRate });
    }
    if (payload.policy === "tax-rates") {
      const rates = {};
      for (const key of ["r", "c", "i"]) {
        if (payload[key] == null) continue;
        if (!Number.isInteger(payload[key]) || payload[key] < 0 || payload[key] > MAX_TAX_RATE) return reject("tax-rate");
        rates[key] = payload[key];
      }
      if (!Object.keys(rates).length) return reject("tax-rate");
      return accept("set-policy", 0, [], { policy: "tax-rates", rates });
    }
    if (payload.policy === "funding") {
      if (!FUNDING_SERVICES.includes(payload.service) || !Number.isInteger(payload.level) || payload.level < 0 || payload.level > 100) return reject("funding");
      return accept("set-policy", 0, [], { policy: "funding", service: payload.service, level: payload.level });
    }
    if (payload.policy === "disasters" || payload.policy === "newspaper") {
      if (typeof payload.enabled !== "boolean") return reject("policy");
      return accept("set-policy", 0, [], { policy: payload.policy, enabled: payload.enabled });
    }
    if (payload.policy === "found-city") {
      if (state.founded) return reject("already-founded");
      return accept("set-policy", 0, [], { policy: "found-city" });
    }
    if (payload.policy === "ordinance") {
      if (!ORDINANCES[payload.id] || typeof payload.enacted !== "boolean") return reject("ordinance");
      return accept("set-policy", 0, [], { policy: "ordinance", id: payload.id, enacted: payload.enacted });
    }
    if (payload.policy === "bond") {
      if (payload.action === "issue") {
        if (state.bonds.length >= MAX_BONDS) return reject("bond-limit");
        return accept("set-policy", 0, [], { policy: "bond", action: "issue" });
      }
      if (payload.action === "repay") {
        if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index >= state.bonds.length) return reject("bond-index");
        if (state.funds < state.bonds[payload.index].principal) return reject("funds");
        return accept("set-policy", 0, [], { policy: "bond", action: "repay", index: payload.index });
      }
      return reject("bond-action");
    }
    if (payload.policy === "loan") {
      // Legacy alias: a loan is now a bond of the requested principal.
      if (![5000, 10000, 20000].includes(payload.amount)) return reject("loan-amount");
      if (state.bonds.length >= MAX_BONDS) return reject("bond-limit");
      return accept("set-policy", 0, [], { policy: "loan", amount: payload.amount });
    }
    return reject("policy");
  }

  function previewCommand(state, command) {
    const normalized = normalizeCommand(command); if (normalized.error) return receipt(reject(normalized.error));
    if (!Number.isInteger(normalized.command.targetTick) || normalized.command.targetTick < 0) return receipt(reject("target-tick"));
    if (normalized.command.targetTick < state.tick) return receipt(reject("stale")); return receipt(planCommand(state, normalized.command));
  }

  const UNDO_LAYERS = ["alt", "tree", "road", "rail", "wire", "pipe", "park", "zone", "density", "stage", "buildingState", "constructionTimer", "variant", "catalogId", "subway", "highway", "onramp"];
  function syncMeanTaxRate(state) { state.taxRate = Math.round((state.taxRates.r + state.taxRates.c + state.taxRates.i) / 3); }
  // A city already carrying debt, or broke, borrows at a worse rate.
  function bondRate(state) { return 5 + Math.floor(state.bonds.length / 4) + (state.funds < 0 ? 3 : 0); }
  function captureTransaction(state, tiles) {
    return { cells: tiles.map((tile) => { const i = indexOf(state, tile.x, tile.y); const values = {}; UNDO_LAYERS.forEach((key) => { values[key] = state[key][i]; }); return { x: tile.x, y: tile.y, values }; }),
      funds: state.funds, rngState: state.rngState, taxRate: state.taxRate, taxRates: { ...state.taxRates }, funding: { ...state.funding },
      ordinances: { ...state.ordinances }, bonds: state.bonds.map((item) => ({ ...item })), facilities: state.facilities.map((item) => ({ ...item })) };
  }
  function restoreTransaction(state, snapshot) {
    snapshot.cells.forEach((cell) => { const i = indexOf(state, cell.x, cell.y); UNDO_LAYERS.forEach((key) => { state[key][i] = cell.values[key]; }); });
    state.funds = snapshot.funds; state.rngState = snapshot.rngState; state.taxRate = snapshot.taxRate; state.taxRates = { ...snapshot.taxRates }; state.funding = { ...snapshot.funding };
    state.ordinances = { ...snapshot.ordinances }; state.bonds = snapshot.bonds.map((item) => ({ ...item }));
    state.facilities = snapshot.facilities.map((item) => ({ ...item })); markDerivedDirty(state); ensureDerived(state); state.rev += 1;
  }

  function applyPlan(state, plan, sequence, originalType, recordHistory = true) {
    const before = captureTransaction(state, plan.tiles); const domainEvents = []; state.funds -= plan.cost;
    if (plan.action === "build-path") {
      const layer = state[plan.data.network]; plan.tiles.forEach((tile) => { const i = indexOf(state, tile.x, tile.y); layer[i] = 1; state.tree[i] = 0; });
      domainEvents.push(["infrastructure-built", { network: plan.data.network, tiles: plan.tiles.length }]);
    } else if (plan.action === "zone-area") {
      plan.tiles.forEach((tile) => { const i = indexOf(state, tile.x, tile.y); state.tree[i] = 0; state.zone[i] = plan.data.zone; state.density[i] = plan.data.density;
        state.stage[i] = 0; state.buildingState[i] = 0; state.constructionTimer[i] = 0; state.catalogId[i] = 0; state.variant[i] = Math.floor(nextRandom(state) * 12); });
      domainEvents.push(["zone-designated", { zone: plan.data.zone, density: plan.data.density, tiles: plan.tiles.length }]);
    } else if (plan.action === "place-facility") {
      plan.tiles.forEach((tile) => { state.tree[indexOf(state, tile.x, tile.y)] = 0; }); state.facilities.push({ kind: plan.data.kind, x: plan.data.x, y: plan.data.y, builtTick: state.tick });
      domainEvents.push(["construction-started", { kind: plan.data.kind, x: plan.data.x, y: plan.data.y }], ["building-completed", { kind: plan.data.kind, x: plan.data.x, y: plan.data.y }]);
    } else if (plan.action === "terraform-area") {
      plan.tiles.forEach((tile) => { const i = indexOf(state, tile.x, tile.y); if (plan.data.mode === "tree") state.tree[i] = 1; else state.alt[i] = plan.data.desired.get(i); });
      recomputeTerrainEdges(state); domainEvents.push(["terrain-changed", { mode: plan.data.mode, tiles: plan.tiles.length }]);
    } else if (plan.action === "demolish-area") {
      const ids = new Set(plan.data.facilityIds); state.facilities = state.facilities.filter((_, id) => !ids.has(id));
      plan.tiles.forEach((tile) => { const i = indexOf(state, tile.x, tile.y); state.road[i] = 0; state.rail[i] = 0; state.wire[i] = 0; state.pipe[i] = 0; state.park[i] = 0;
        state.zone[i] = 0; state.density[i] = 0; state.stage[i] = 0; state.buildingState[i] = 0; state.constructionTimer[i] = 0; state.tree[i] = 0; state.catalogId[i] = 0; state.highway[i] = 0; state.onramp[i] = 0; });
      domainEvents.push(["area-demolished", { tiles: plan.tiles.length }]);
    } else if (plan.action === "trigger-disaster") {
      startDisaster(state, plan.data.kind, plan.data.x, plan.data.y, "menu");
      domainEvents.push(["disaster-started", { kind: plan.data.kind, x: plan.data.x, y: plan.data.y, cause: "menu" }]);
    } else {
      if (plan.data.policy === "tax-rate") { state.taxRates = { r: plan.data.taxRate, c: plan.data.taxRate, i: plan.data.taxRate }; syncMeanTaxRate(state); }
      else if (plan.data.policy === "tax-rates") { state.taxRates = { ...state.taxRates, ...plan.data.rates }; syncMeanTaxRate(state); }
      else if (plan.data.policy === "funding") state.funding[plan.data.service] = plan.data.level;
      else if (plan.data.policy === "disasters") state.disastersOff = !plan.data.enabled;
      else if (plan.data.policy === "ordinance") { state.ordinances = { ...state.ordinances, [plan.data.id]: plan.data.enacted }; if (plan.data.enacted) state.newsMemo.ordinance = plan.data.id; }
      else if (plan.data.policy === "newspaper") state.paperDelivery = plan.data.enabled;
      else if (plan.data.policy === "found-city") { state.founded = true; pushNotice(state, "bonsai_msg_city_founded"); }
      else if (plan.data.policy === "bond" && plan.data.action === "issue") { state.bonds.push({ principal: BOND_PRINCIPAL, rate: bondRate(state), issuedTick: state.tick }); state.funds += BOND_PRINCIPAL; }
      else if (plan.data.policy === "bond") { const bond = state.bonds[plan.data.index]; state.funds -= bond.principal; state.bonds = state.bonds.filter((_, index) => index !== plan.data.index); }
      else { state.bonds.push({ principal: plan.data.amount, rate: bondRate(state), issuedTick: state.tick }); state.funds += plan.data.amount; }
      domainEvents.push(["policy-changed", { ...plan.data }]);
    }
    markDerivedDirty(state); ensureDerived(state); state.rev += 1;
    const emitted = domainEvents.map(([type, payload]) => pushEvent(state, type, payload, sequence));
    emitted.push(pushEvent(state, "command-applied", { type: originalType || plan.action, commandType: plan.action, cost: plan.cost }, sequence));
    if (recordHistory) {
      const after = captureTransaction(state, plan.tiles); state.undoStack.push({ before, after, transactionId: `tx-${sequence}`, type: plan.action });
      if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
      state.redoStack = [];
    }
    return emitted;
  }

  function submitCommand(state, command) {
    const normalized = normalizeCommand(command); if (normalized.error) return receipt(reject(normalized.error)); const targetTick = normalized.command.targetTick;
    if (!Number.isInteger(targetTick) || targetTick < 0) return receipt(reject("target-tick")); if (targetTick < state.tick) return receipt(reject("stale"));
    const plan = planCommand(state, normalized.command); if (!plan.accepted) return receipt(plan);
    if (targetTick > state.tick) {
      if (state.pendingCommands.length >= MAX_PENDING_COMMANDS) return receipt(reject("queue-full", plan.tiles)); const sequence = state.nextCommandSequence++;
      state.pendingCommands.push({ ...normalized.command, sequence, originalType: normalized.originalType }); state.pendingCommands.sort((a, b) => (a.targetTick - b.targetTick) || (a.sequence - b.sequence));
      return receipt(plan, { sequence, queued: true, transactionId: `tx-${sequence}` });
    }
    const sequence = state.nextCommandSequence++;
    // A disaster is not an edit: it never enters the undo history.
    const events = applyPlan(state, plan, sequence, normalized.originalType, plan.action !== "trigger-disaster");
    return receipt(plan, { sequence, transactionId: `tx-${sequence}`, events });
  }
  function applyPendingCommands(state) {
    while (state.pendingCommands.length && state.pendingCommands[0].targetTick === state.tick) {
      const command = state.pendingCommands.shift(); const plan = planCommand(state, command);
      if (plan.accepted) applyPlan(state, plan, command.sequence, command.originalType, false); else pushEvent(state, "command-rejected", { type: command.originalType || command.type, code: plan.code }, command.sequence);
    }
  }
  function undo(state) {
    const item = state.undoStack.pop(); if (!item) return { accepted: false, code: "empty" }; restoreTransaction(state, item.before); state.redoStack.push(item);
    const event = pushEvent(state, "transaction-undone", { transactionId: item.transactionId }); return { accepted: true, code: "ok", transactionId: item.transactionId, events: [event] };
  }
  function redo(state) {
    const item = state.redoStack.pop(); if (!item) return { accepted: false, code: "empty" }; restoreTransaction(state, item.after); state.undoStack.push(item);
    const event = pushEvent(state, "transaction-redone", { transactionId: item.transactionId }); return { accepted: true, code: "ok", transactionId: item.transactionId, events: [event] };
  }
  function applyTool(state, toolId, x, y) {
    if (toolId === "query") return { ok: !!tileInfo(state, x, y), code: inBounds(state, x, y) ? "ok" : "bounds", cost: 0 };
    const result = submitCommand(state, { schemaVersion: 1, type: toolId, payload: { x, y }, targetTick: state.tick });
    return { ok: result.accepted, code: result.code, cost: result.cost, footprint: result.footprint };
  }

  function recomputeDemand(state) {
    ensureDerived(state); const month = Math.floor(state.tick / TICKS_PER_MONTH); state.economyIndex = Math.round((latticeHash(month, 0, state.seed) - 0.5) * 50);
    let pollution = 0; let happiness = 0; let occupied = 0;
    for (let i = 0; i < tileCount(state); i += 1) if (state.zone[i]) { pollution += state.pollution[i]; happiness += state.happiness[i]; occupied += 1; }
    const avgPollution = occupied ? pollution / occupied : 0; const avgHappiness = occupied ? happiness / occupied : 60;
    // Each market answers to its own tax rate.
    const taxBiasR = (DEFAULT_TAX - state.taxRates.r) * 4;
    const taxBiasC = (DEFAULT_TAX - state.taxRates.c) * 4;
    const taxBiasI = (DEFAULT_TAX - state.taxRates.i) * 4;
    const adBonus = (ordinanceOn(state, "touristAdvertising") ? 3 : 0) + (ordinanceOn(state, "businessAdvertising") ? 3 : 0);
    const cPoints = state.buildings.filter((item) => item.zone === ZONE_C).reduce((sum, item) => sum + item.stage * item.w * item.h, 0);
    const iPoints = state.buildings.filter((item) => item.zone === ZONE_I).reduce((sum, item) => sum + item.stage * item.w * item.h, 0);
    // A working port opens the external market: powered, road-served port
    // tiles lift industrial (seaport) and commercial (airport) demand.
    let seaportTiles = 0; let airportTiles = 0;
    for (let i = 0; i < tileCount(state); i += 1) {
      if (!state.powered[i] || !state.roadOk[i]) continue;
      if (state.zone[i] === ZONE_SEAPORT) seaportTiles += 1; else if (state.zone[i] === ZONE_AIRPORT) airportTiles += 1;
    }
    const seaportBonus = Math.min(15, Math.floor(seaportTiles / 4));
    const airportBonus = Math.min(15, Math.floor(airportTiles / 6));
    state.demand = { r: Math.max(-100, Math.min(100, 45 + Math.floor((state.jobs * 2 - state.population) / 8) + taxBiasR + Math.floor((avgHappiness - 50) / 2))),
      c: Math.max(-100, Math.min(100, 25 + Math.floor(state.population / 18) - cPoints * 3 + taxBiasC + Math.floor(state.economyIndex / 2) + airportBonus + adBonus)),
      i: Math.max(-100, Math.min(100, 30 + Math.floor(state.population / 24) - iPoints * 2 + taxBiasI + state.economyIndex - Math.floor(avgPollution / 8) + seaportBonus)) };
    state.derivedDirty = true;
  }

  function growthPass(state) {
    ensureDerived(state); const demandByZone = [0, state.demand.r, state.demand.c, state.demand.i]; let changed = false;
    for (let i = 0; i < tileCount(state); i += 1) {
      const zone = state.zone[i]; if (!zone) continue;
      // Port and military zones grow with the transport milestone, not here.
      if (zone > ZONE_I) continue;
      const pos = xyOf(state, i); const problem = state.problemCode[i];
      // Growth needs a clean tile. Decay needs a real service failure: a
      // satisfied market is not a reason to demolish a neighbourhood, and
      // treating NO_DEMAND as one made the city oscillate instead of grow
      // (stock rises -> demand turns negative -> every building declines ->
      // stock falls -> demand rebounds). Sustained oversupply still bites
      // through the demand < -40 rule in the ACTIVE branch below.
      // Congestion is a reason to grow slowly, not a reason to be demolished.
      // It counted as neither serviced nor supplied, so a congested tile fell
      // into the decline branch below: it could never upgrade, and after ten
      // ticks it declined. In a test city every one of 181 buildings sat at
      // stage 1 for ever. It is a supply problem the road network causes, not a
      // missing utility, so it slows the upgrade clock instead.
      const congested = problem === PROBLEM.CONGESTED;
      const serviced = !problem; const supplied = !problem || problem === PROBLEM.NO_DEMAND || congested;
      const current = state.buildingState[i];
      // Growth takes ownership of the tile's look: an explicit imported
      // catalog id is cleared the moment the sim changes what stands here.
      if (current === BUILDING_EMPTY && serviced && demandByZone[zone] > 0) { state.buildingState[i] = BUILDING_FOUNDATION; state.constructionTimer[i] = 0; state.catalogId[i] = 0; changed = true; pushEvent(state, "construction-started", { zone, x: pos.x, y: pos.y }); }
      else if (current === BUILDING_FOUNDATION && serviced && ++state.constructionTimer[i] >= 2) { state.buildingState[i] = BUILDING_CONSTRUCTION; state.constructionTimer[i] = 0; changed = true; }
      else if (current === BUILDING_CONSTRUCTION && serviced && ++state.constructionTimer[i] >= 5) {
        state.buildingState[i] = BUILDING_ACTIVE; state.stage[i] = 1; state.constructionTimer[i] = 0; state.catalogId[i] = 0; changed = true; pushEvent(state, "building-completed", { zone, stage: 1, x: pos.x, y: pos.y });
      } else if (current === BUILDING_ACTIVE) {
        if (!supplied) { if (++state.constructionTimer[i] >= 10) { state.buildingState[i] = BUILDING_DECLINING; state.constructionTimer[i] = 0; changed = true; } }
        else {
          state.constructionTimer[i] += 1; const maxStage = state.density[i] === DENSITY_HIGH ? MAX_STAGE : 1;
          const upgradeTicks = congested ? 90 : 45;
          if (state.stage[i] < maxStage && demandByZone[zone] > 20 && state.constructionTimer[i] >= upgradeTicks) { state.stage[i] += 1; state.constructionTimer[i] = 0; state.catalogId[i] = 0; state.variant[i] = latticeInt(pos.x, pos.y, state.seed + state.tick) % 12; changed = true; pushEvent(state, "building-completed", { zone, stage: state.stage[i], x: pos.x, y: pos.y }); }
          else if (demandByZone[zone] < -40 && state.constructionTimer[i] >= 30) { state.buildingState[i] = BUILDING_DECLINING; state.constructionTimer[i] = 0; changed = true; }
        }
      } else if (current === BUILDING_DECLINING) {
        // Hysteresis. Decline starts below -40 but recovery used to begin the
        // moment demand crossed zero, and demand rebounds as soon as stock
        // falls -- so a jobless district cycled full to empty and back. Leaving
        // decline now needs the same clearly positive market an abandoned tile
        // needs, which widens the band from [-40, 0] to [-40, 10] and stops the
        // two recovery paths disagreeing about what "recovered" means.
        if (serviced && demandByZone[zone] > 10) { state.buildingState[i] = BUILDING_RECOVERING; state.constructionTimer[i] = 0; changed = true; }
        else if (++state.constructionTimer[i] >= 10) { state.stage[i] = Math.max(0, state.stage[i] - 1); state.constructionTimer[i] = 0; state.catalogId[i] = 0; changed = true; if (!state.stage[i]) state.buildingState[i] = BUILDING_ABANDONED; }
      } else if (current === BUILDING_ABANDONED && serviced && demandByZone[zone] > 10) { state.buildingState[i] = BUILDING_RECOVERING; state.constructionTimer[i] = 0; changed = true; }
      else if (current === BUILDING_RECOVERING && serviced && ++state.constructionTimer[i] >= 3) { state.buildingState[i] = BUILDING_ACTIVE; state.stage[i] = Math.max(1, state.stage[i]); state.constructionTimer[i] = 0; changed = true; }
    }
    if (changed) { markDerivedDirty(state); ensureDerived(state); state.rev += 1; }
  }

  function ordinanceBudget(state) {
    let income = 0; let cost = 0;
    for (const id of ORDINANCE_IDS) {
      if (!ordinanceOn(state, id)) continue;
      const spec = ORDINANCES[id];
      if (spec.incomeDiv) income += Math.floor(state.population / spec.incomeDiv);
      if (spec.base || spec.costDiv) cost += (spec.base || 0) + (spec.costDiv ? Math.floor(state.population / spec.costDiv) : 0);
    }
    return { income, cost };
  }
  function settleBudget(state) {
    ensureDerived(state);
    let roadLand = 0; let railLand = 0; let bridgeTiles = 0; let subwayTiles = 0; let parkTiles = 0; let highwayLand = 0;
    for (let i = 0; i < tileCount(state); i += 1) {
      if (state.water[i]) { if (state.road[i] || state.rail[i] || state.highway[i]) bridgeTiles += 1; }
      else { if (state.road[i]) roadLand += 1; if (state.rail[i]) railLand += 1; if (state.highway[i] || state.onramp[i]) highwayLand += 1; }
      if (state.subway[i]) subwayTiles += 1; if (state.park[i]) parkTiles += 1;
    }
    // SC2K's income model: property taxes split across R, C, and I.
    const taxes = { r: Math.floor(state.population * state.taxRates.r / 8),
      c: Math.floor(state.cJobs * state.taxRates.c / 10), i: Math.floor(state.iJobs * state.taxRates.i / 10) };
    const ordinances = ordinanceBudget(state);
    const budget = makeEmptyBudget();
    budget.taxes = taxes; budget.ordinanceIncome = ordinances.income; budget.ordinanceCost = ordinances.cost;
    budget.income = taxes.r + taxes.c + taxes.i + ordinances.income;
    budget.roads = Math.floor((roadLand + parkTiles) * state.funding.roads / 200);
    budget.highways = Math.floor(highwayLand * state.funding.highways / 150);
    budget.bridges = Math.floor(bridgeTiles * state.funding.bridges / 100);
    budget.rail = Math.floor(railLand * state.funding.rail / 300);
    budget.subway = Math.floor(subwayTiles * state.funding.subway / 300);
    state.facilities.forEach((facility) => {
      const spec = FACILITY_KINDS[facility.kind];
      // SC2K power and water structures carry no monthly cost.
      if (spec.group === "utility") return;
      const key = spec.group === "transport"
        ? (facility.kind === "station" ? "rail" : facility.kind === "subway-station" ? "subway" : "roads")
        : spec.group;
      if (Object.prototype.hasOwnProperty.call(budget, key)) budget[key] += Math.floor(spec.upkeep * state.funding[key] / 100);
      else budget.roads += Math.floor(spec.upkeep * state.funding.roads / 100);
    });
    for (const bond of state.bonds) budget.bondInterest += Math.ceil(bond.principal * bond.rate / 100 / MONTHS_PER_YEAR);
    budget.expense = budget.roads + budget.highways + budget.bridges + budget.rail + budget.subway + budget.tunnels
      + budget.police + budget.fire + budget.health + budget.schools + budget.colleges + budget.bondInterest + budget.ordinanceCost;
    state.budget = budget; state.lastIncome = budget.income; state.lastExpense = budget.expense; state.funds += budget.income - budget.expense;
    pushEvent(state, "budget-settled", { ...budget, funds: state.funds }); pushEvent(state, "budget", { tick: state.tick, income: budget.income, expense: budget.expense, funds: state.funds });
    if (state.funds < 0 && !state.wasBroke) { state.wasBroke = true; pushNotice(state, "bonsai_msg_broke"); } if (state.funds >= 0) state.wasBroke = false;
    const report = cityReport(state); state.history.push({ tick: state.tick, population: state.population, jobs: state.jobs, funds: state.funds, demand: { ...state.demand }, pollution: report.pollution, crime: report.crime, fireRisk: report.fireRisk, happiness: report.happiness });
    if (state.history.length > MAX_HISTORY_MONTHS) state.history.shift(); state.rev += 1;
  }
  // Monthly demographics: EQ follows school coverage, LE follows health
  // coverage and pollution, both drifting one point toward their target.
  // The workforce share follows EQ; unemployment is workforce minus jobs.
  function updateDemographics(state) {
    ensureDerived(state);
    let zoned = 0; let schooled = 0; let doctored = 0; let pollutionSum = 0;
    for (let i = 0; i < tileCount(state); i += 1) {
      if (!state.zone[i]) continue;
      zoned += 1;
      if (state.educationCovered[i]) schooled += 1;
      if (state.healthCovered[i]) doctored += 1;
      pollutionSum += state.pollution[i];
    }
    const schoolShare = zoned ? Math.floor(schooled * 100 / zoned) : 0;
    const healthShare = zoned ? Math.floor(doctored * 100 / zoned) : 0;
    const avgPollution = zoned ? Math.floor(pollutionSum / zoned) : 0;
    const eqTarget = Math.max(0, Math.min(150, 60 + Math.floor(schoolShare * 2 / 5) + (ordinanceOn(state, "proReading") ? 5 : 0)));
    const leTarget = Math.max(20, Math.min(90, 55 + Math.floor(healthShare / 4) - Math.floor(avgPollution / 10)
      + (ordinanceOn(state, "cprTraining") ? 2 : 0) + (ordinanceOn(state, "freeClinics") ? 3 : 0) + (ordinanceOn(state, "publicSmokingBan") ? 2 : 0)));
    state.eq += Math.sign(eqTarget - state.eq);
    state.le += Math.sign(leTarget - state.le);
    state.workforcePercent = Math.max(30, Math.min(70, 35 + Math.floor(state.eq / 10)));
    state.unemployed = Math.max(0, Math.floor(state.population * state.workforcePercent / 100) - state.jobs);
    // The nation grows on its own clock; the fed rate follows the economy.
    state.nationalPopulation += 97 + (latticeInt(Math.floor(state.tick / TICKS_PER_MONTH), 7, state.seed) % 41);
  }
  function recordGraphs(state) {
    const month = Math.floor(state.tick / TICKS_PER_MONTH);
    const report = { traffic: 0, roads: 0 };
    for (let i = 0; i < tileCount(state); i += 1) if (state.road[i]) { report.roads += 1; report.traffic += state.traffic[i]; }
    let developed = 0;
    for (let i = 0; i < tileCount(state); i += 1) if (state.zone[i] || state.facilityAt[i] >= 0) developed += 1;
    const sample = {
      citySize: developed, residents: state.population, commerce: state.cJobs, industry: state.iJobs,
      traffic: report.roads ? Math.floor(report.traffic / report.roads) : 0,
      pollution: averageLayerOnZones(state, state.pollution), value: averageLayerOnZones(state, state.landValue),
      crime: averageLayerOnZones(state, state.crime),
      powerPercent: state.powerDemand ? Math.min(100, Math.floor(state.powerCapacity * 100 / state.powerDemand)) : 100,
      waterPercent: state.waterDemand ? Math.min(100, Math.floor(state.waterCapacity * 100 / state.waterDemand)) : 100,
      health: state.le, education: state.eq, unemployment: state.unemployed,
      gnp: state.budget.income, nationalPopulation: state.nationalPopulation, fedRate: bondRate(state),
    };
    const push = (tier, cap) => { for (const series of GRAPH_SERIES) { const list = state.graphs[tier][series]; list.push(sample[series]); if (list.length > cap) list.shift(); } };
    push("monthly", GRAPH_TIERS.monthly);
    if (month % 6 === 0) push("halfYearly", GRAPH_TIERS.halfYearly);
    if (month % 60 === 0) push("fiveYearly", GRAPH_TIERS.fiveYearly);
  }
  // --- Disasters -------------------------------------------------------------
  const isFlammable = (state, i) => !!(state.zone[i] && state.stage[i]) || !!state.tree[i] || state.catalogId[i] >= 0x70 || state.facilityAt[i] >= 0;
  function clearTileToRubble(state, i) {
    if (state.facilityAt[i] >= 0) {
      const id = state.facilityAt[i];
      state.facilities = state.facilities.filter((_, index) => index !== id);
      rebuildFacilityLayers(state);
    }
    state.zone[i] = 0; state.density[i] = 0; state.stage[i] = 0; state.buildingState[i] = 0;
    state.constructionTimer[i] = 0; state.tree[i] = 0; state.park[i] = 0;
    state.catalogId[i] = 1 + (i % 4);
  }
  function startDisaster(state, kind, x, y, cause) {
    const spec = DISASTER_KINDS[kind];
    state.disaster = { kind, x, y, ticksRemaining: spec.duration, cause };
    if (kind === "fire") {
      const i = indexOf(state, x, y);
      state.blaze[i] = 1;
      for (const [dx, dy] of [[1, 0], [0, 1]]) if (inBounds(state, x + dx, y + dy)) state.blaze[indexOf(state, x + dx, y + dy)] = 1;
    } else if (kind === "earthquake") {
      const count = Math.max(6, Math.floor(tileCount(state) * 0.012));
      for (let n = 0; n < count; n += 1) {
        const i = Math.floor(nextRandom(state) * tileCount(state));
        if (!state.water[i] && (state.zone[i] || state.tree[i] || state.catalogId[i])) clearTileToRubble(state, i);
      }
      for (let n = 0; n < 3; n += 1) {
        const i = Math.floor(nextRandom(state) * tileCount(state));
        if (!state.water[i] && isFlammable(state, i)) state.blaze[i] = 1;
      }
    } else if (kind === "flood") {
      const radius = DISASTER_KINDS.flood.radius;
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius || !inBounds(state, x + dx, y + dy)) continue;
        const i = indexOf(state, x + dx, y + dy);
        if (!state.water[i]) state.blaze[i] = 6;
      }
    }
    markDerivedDirty(state); ensureDerived(state); state.rev += 1;
    pushNotice(state, `bonsai_msg_disaster_${kind}`);
    publishNewspaper(state, [{ key: `disaster_${kind}`, x, y }], true);
  }
  function advanceDisaster(state) {
    const disaster = state.disaster;
    if (!disaster) return;
    const count = tileCount(state);
    let changed = false;
    if (disaster.kind === "fire" || disaster.kind === "earthquake") {
      // Burning tiles age; young fires jump to flammable neighbours unless
      // fire coverage damps them; burnt-out tiles fall to rubble.
      const spreadFrom = [];
      for (let i = 0; i < count; i += 1) if (state.blaze[i] >= 1 && state.blaze[i] <= 4) spreadFrom.push(i);
      for (const i of spreadFrom) {
        state.blaze[i] += 1; changed = true;
        if (state.blaze[i] === 5) { clearTileToRubble(state, i); state.blaze[i] = 0; continue; }
        const { x, y } = xyOf(state, i);
        for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
          if (!inBounds(state, nx, ny)) continue;
          const ni = indexOf(state, nx, ny);
          if (state.blaze[ni] || state.water[ni] || !isFlammable(state, ni)) continue;
          const chance = state.fireCovered[ni] ? 0.1 : 0.28;
          if (nextRandom(state) < chance) { state.blaze[ni] = 1; changed = true; }
        }
      }
      if (!spreadFrom.length && disaster.ticksRemaining < DISASTER_KINDS[disaster.kind].duration - 2) disaster.ticksRemaining = 0;
    } else if (disaster.kind === "tornado" || disaster.kind === "monster") {
      disaster.x = Math.max(0, Math.min(state.size - 1, disaster.x + Math.floor(nextRandom(state) * 3) - 1));
      disaster.y = Math.max(0, Math.min(state.size - 1, disaster.y + Math.floor(nextRandom(state) * 3) - 1));
      const targets = disaster.kind === "monster"
        ? [[0, 0], [1, 0], [0, 1]] : [[0, 0]];
      for (const [dx, dy] of targets) {
        if (!inBounds(state, disaster.x + dx, disaster.y + dy)) continue;
        const i = indexOf(state, disaster.x + dx, disaster.y + dy);
        if (!state.water[i] && (state.zone[i] || state.tree[i] || state.catalogId[i] || state.facilityAt[i] >= 0)) { clearTileToRubble(state, i); changed = true; }
      }
    }
    disaster.ticksRemaining -= 1;
    if (disaster.ticksRemaining <= 0) {
      if (disaster.kind === "flood") {
        for (let i = 0; i < count; i += 1) if (state.blaze[i] === 6) {
          if (state.zone[i] || state.tree[i] || state.catalogId[i]) clearTileToRubble(state, i);
          state.blaze[i] = 0; changed = true;
        }
      }
      for (let i = 0; i < count; i += 1) if (state.blaze[i]) { state.blaze[i] = 0; changed = true; }
      pushEvent(state, "disaster-ended", { kind: disaster.kind });
      pushNotice(state, "bonsai_msg_disaster_ended");
      state.disaster = null;
      publishNewspaper(state, [{ key: "disaster_over", kind: disaster.kind }], true);
    }
    if (changed) { markDerivedDirty(state); ensureDerived(state); state.rev += 1; }
  }
  function publishNewspaper(state, stories, extra) {
    state.newspaper = { edition: state.newspaper.edition + 1, extra: !!extra, stories: stories.slice(0, MAX_NEWS_STORIES) };
    if (state.paperDelivery) pushNotice(state, extra ? "bonsai_msg_paper_extra" : "bonsai_msg_paper_edition");
    pushEvent(state, "newspaper-published", { edition: state.newspaper.edition, extra: !!extra, stories: state.newspaper.stories.map((story) => story.key) });
  }
  function composeNewspaper(state) {
    const memo = state.newsMemo;
    const report = { crime: averageLayerOnZones(state, state.crime) };
    let congested = 0;
    for (let i = 0; i < tileCount(state); i += 1) if (state.road[i] && state.congested[i]) congested += 1;
    const stories = [];
    if (state.rewardTier > memo.rewardTier) stories.push({ key: "reward", tier: state.rewardTier });
    if (state.milestone > memo.milestone) stories.push({ key: "milestone", population: state.population });
    if (memo.plantExpired) stories.push({ key: "plant_expired" });
    if (state.funds < 0 && memo.funds >= 0) stories.push({ key: "deficit", funds: state.funds });
    if (state.brownout) stories.push({ key: "brownout", demand: state.powerDemand, capacity: state.powerCapacity });
    if (state.waterShortage) stories.push({ key: "water_shortage" });
    if (report.crime >= 90) stories.push({ key: "crime_high", crime: report.crime });
    if (congested >= 12) stories.push({ key: "congestion", roads: congested });
    if (state.population > memo.population + 120) stories.push({ key: "growth", gained: state.population - memo.population });
    else if (state.population < memo.population - 120) stories.push({ key: "decline", lost: memo.population - state.population });
    if (Math.max(state.taxRates.r, state.taxRates.c, state.taxRates.i) >= 15) stories.push({ key: "tax_high", rate: Math.max(state.taxRates.r, state.taxRates.c, state.taxRates.i) });
    if (memo.ordinance) stories.push({ key: "ordinance", id: memo.ordinance });
    if (state.bonds.length > memo.bonds) stories.push({ key: "bond", count: state.bonds.length });
    if (!stories.length) stories.push({ key: `quiet_${1 + (latticeInt(state.newspaper.edition, 53, state.seed) % 3)}` });
    publishNewspaper(state, stories, false);
    state.newsMemo = { funds: state.funds, population: state.population, milestone: state.milestone, rewardTier: state.rewardTier, plantExpired: false, ordinance: "", bonds: state.bonds.length };
  }
  function evaluateScenarioGoals(state) {
    const goals = state.scenario.goals || {};
    const value = averageLayerOnZones(state, state.landValue);
    const crime = averageLayerOnZones(state, state.crime);
    const pollution = averageLayerOnZones(state, state.pollution);
    let congested = 0;
    for (let i = 0; i < tileCount(state); i += 1) if (state.road[i] && state.congested[i]) congested += 1;
    const checks = {
      population: goals.population == null || state.population + state.arcoPopulation >= goals.population,
      funds: goals.funds == null || state.funds >= goals.funds,
      landValue: goals.landValue == null || value >= goals.landValue,
      crimeMax: goals.crimeMax == null || crime <= goals.crimeMax,
      pollutionMax: goals.pollutionMax == null || pollution <= goals.pollutionMax,
      trafficMax: goals.trafficMax == null || congested <= goals.trafficMax,
      bondsMax: goals.bondsMax == null || state.bonds.length <= goals.bondsMax,
    };
    return Object.values(checks).every(Boolean);
  }
  function advanceScenario(state) {
    const scenario = state.scenario;
    if (!scenario || scenario.status !== "active") return;
    scenario.elapsedMonths += 1;
    if (scenario.disaster && !scenario.disaster.fired && scenario.elapsedMonths >= scenario.disaster.delayMonths && !state.disaster) {
      scenario.disaster = { ...scenario.disaster, fired: true };
      const at = scenario.disaster.x != null ? { x: scenario.disaster.x, y: scenario.disaster.y } : state.spawnCenter;
      startDisaster(state, scenario.disaster.kind, at.x, at.y, "scenario");
      pushEvent(state, "disaster-started", { kind: scenario.disaster.kind, x: at.x, y: at.y, cause: "scenario" });
    }
    ensureDerived(state);
    if (evaluateScenarioGoals(state)) {
      scenario.status = "won";
      pushEvent(state, "scenario-won", { id: scenario.id || "", months: scenario.elapsedMonths });
      pushNotice(state, "bonsai_msg_scenario_won");
      publishNewspaper(state, [{ key: "scenario_won", months: scenario.elapsedMonths }], true);
    } else if (scenario.elapsedMonths >= scenario.months) {
      scenario.status = "lost";
      pushEvent(state, "scenario-lost", { id: scenario.id || "", months: scenario.elapsedMonths });
      pushNotice(state, "bonsai_msg_scenario_lost");
      publishNewspaper(state, [{ key: "scenario_lost", months: scenario.months }], true);
    }
  }
  function createScenarioCity(id) {
    const spec = SCENARIOS[id];
    if (!spec) throw new Error("bonsai-scenario-unknown");
    const state = createCity({ seed: spec.seed, size: spec.size, terrainPreset: spec.terrainPreset, yearFounded: spec.yearFounded, name: "" });
    for (let n = 0; n < (spec.startingBonds || 0); n += 1) {
      submitCommand(state, { schemaVersion: 2, type: "set-policy", payload: { policy: "bond", action: "issue" }, targetTick: 0, clientCommandId: `scenario-bond-${n}` });
    }
    state.undoStack = []; state.redoStack = [];
    state.scenario = { id, months: spec.months, elapsedMonths: 0, status: "active",
      goals: { ...spec.goals }, disaster: spec.disaster ? { ...spec.disaster, fired: false } : null };
    return state;
  }
  function maybeStartEmergentDisaster(state) {
    if (state.disaster || state.disastersOff || state.population < 500) return;
    const month = Math.floor(state.tick / TICKS_PER_MONTH);
    if (latticeInt(month, 977, state.seed) % 72 !== 0) return;
    const kinds = Object.keys(DISASTER_KINDS);
    const kind = kinds[latticeInt(month, 431, state.seed) % kinds.length];
    const i = Math.floor(nextRandom(state) * tileCount(state));
    const { x, y } = xyOf(state, i);
    startDisaster(state, kind, x, y, "emergent");
    pushEvent(state, "disaster-started", { kind, x, y, cause: "emergent" });
  }
  function retirePlants(state) {
    // A power plant serves 50 game years, then leaves the grid. The player
    // sees the notice and the dark map; rebuilding is a decision, not an
    // automatic replacement.
    const expired = state.facilities.filter((facility) => FACILITY_KINDS[facility.kind].lifespan
      && state.tick - (facility.builtTick || 0) >= PLANT_LIFESPAN_TICKS);
    if (!expired.length) return;
    state.facilities = state.facilities.filter((facility) => !expired.includes(facility));
    expired.forEach((facility) => pushEvent(state, "plant-expired", { kind: facility.kind, x: facility.x, y: facility.y }));
    pushNotice(state, "bonsai_msg_plant_expired");
    state.newsMemo.plantExpired = true;
    markDerivedDirty(state); ensureDerived(state); state.rev += 1;
  }
  function checkMilestones(state) {
    for (const [threshold, key] of [[250, "bonsai_msg_village"], [1000, "bonsai_msg_town"], [4000, "bonsai_msg_city"]]) if (state.population >= threshold && state.milestone < threshold) {
      state.milestone = threshold; pushNotice(state, key); pushEvent(state, "milestone", { threshold });
    }
    const total = state.population + state.arcoPopulation;
    for (const reward of REWARD_TIERS) {
      if (total < reward.threshold || state.rewardTier >= reward.tier) continue;
      state.rewardTier = reward.tier;
      state.rewardsOffered = [...state.rewardsOffered, reward.kind];
      pushNotice(state, "bonsai_msg_reward_offered");
      pushEvent(state, "reward-offered", { tier: reward.tier, kind: reward.kind, threshold: reward.threshold });
    }
  }
  // Microsims: one persistent headline figure per tracked facility,
  // refreshed monthly, pruned when the facility is gone.
  // Moving things: a working airport keeps one airplane aloft, an active
  // seaport keeps one ship on the water, and heavy congestion sends up a
  // traffic helicopter. Spawn checks are condition-driven and consume no
  // randomness, so a city without things keeps its exact event stream.
  function nearestWater(state, anchor) {
    if (!anchor) return null;
    for (let radius = 0; radius <= 10; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = anchor.x + dx; const y = anchor.y + dy;
        if (inBounds(state, x, y) && state.water[indexOf(state, x, y)]) return { x, y };
      }
    }
    return null;
  }
  function updateThings(state) {
    ensureDerived(state);
    const anchors = { airport: null, seaport: null };
    let airportTiles = 0; let seaportTiles = 0; let congested = 0; let congestedAt = -1;
    for (let i = 0; i < tileCount(state); i += 1) {
      if (state.road[i] && state.congested[i]) { congested += 1; if (congestedAt < 0) congestedAt = i; }
      if (!state.powered[i] || !state.roadOk[i]) continue;
      if (state.zone[i] === ZONE_AIRPORT) { airportTiles += 1; if (!anchors.airport) anchors.airport = xyOf(state, i); }
      else if (state.zone[i] === ZONE_SEAPORT) { seaportTiles += 1; if (!anchors.seaport) anchors.seaport = xyOf(state, i); }
    }
    const wants = {
      airplane: airportTiles >= PORT_MIN_TILES.airport ? anchors.airport : null,
      ship: seaportTiles >= PORT_MIN_TILES.seaport ? nearestWater(state, anchors.seaport) : null,
      helicopter: congested >= 8 ? xyOf(state, congestedAt) : null,
    };
    for (const kind of ["airplane", "ship", "helicopter"]) {
      const have = state.things.some((thing) => thing.kind === kind);
      if (wants[kind] && !have && state.things.length < MAX_THINGS) {
        state.things.push({ kind, x: wants[kind].x, y: wants[kind].y, z: kind === "airplane" ? 4 : kind === "helicopter" ? 2 : 0, dir: (state.seed + state.things.length) & 3 });
        pushEvent(state, "thing-appeared", { kind });
      } else if (!wants[kind] && have) {
        state.things = state.things.filter((thing) => thing.kind !== kind);
        pushEvent(state, "thing-departed", { kind });
      }
    }
  }
  const THING_DIRS = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0]]);
  function advanceThings(state) {
    if (!state.things.length) return;
    for (const thing of state.things) {
      const step = THING_STEP_TICKS[thing.kind] || 4;
      if (state.tick % step) continue;
      if (thing.kind === "ship" || thing.kind === "sailboat") {
        // Prefer sailing straight, then right, left, and about; only watery
        // neighbours qualify, and a landlocked boat waits where it is.
        const options = [];
        for (const turn of [0, 1, 3, 2]) {
          const dir = (thing.dir + turn) & 3;
          const nx = thing.x + THING_DIRS[dir][0]; const ny = thing.y + THING_DIRS[dir][1];
          if (inBounds(state, nx, ny) && state.water[indexOf(state, nx, ny)]) options.push({ dir, nx, ny });
        }
        if (!options.length) continue;
        const choice = options.length > 1 && nextRandom(state) < 0.25 ? options[1] : options[0];
        thing.dir = choice.dir; thing.x = choice.nx; thing.y = choice.ny;
        continue;
      }
      // Aircraft wander with a slight deterministic wobble and turn back
      // inside the map edge.
      if (nextRandom(state) < 0.2) thing.dir = (thing.dir + (nextRandom(state) < 0.5 ? 1 : 3)) & 3;
      let nx = thing.x + THING_DIRS[thing.dir][0]; let ny = thing.y + THING_DIRS[thing.dir][1];
      if (!inBounds(state, nx, ny)) { thing.dir = (thing.dir + 2) & 3; nx = thing.x + THING_DIRS[thing.dir][0]; ny = thing.y + THING_DIRS[thing.dir][1]; }
      if (inBounds(state, nx, ny)) { thing.x = nx; thing.y = ny; }
    }
  }
  function updateMicrosims(state) {
    const month = Math.floor(state.tick / TICKS_PER_MONTH);
    const alive = new Set(state.facilities.map((item) => `${item.kind}:${item.x}:${item.y}`));
    state.microsims = state.microsims.filter((record) => record.x < 0 || alive.has(`${record.kind}:${record.x}:${record.y}`));
    for (const facility of state.facilities) {
      const stat = MICROSIM_KINDS[facility.kind];
      if (!stat) continue;
      const key = `${facility.kind}:${facility.x}:${facility.y}`;
      if (!state.microsims.some((record) => `${record.kind}:${record.x}:${record.y}` === key)) {
        if (state.microsims.length >= MAX_MICROSIMS) continue;
        state.microsims.push({ slot: state.microsims.length, kind: facility.kind, stat, x: facility.x, y: facility.y, value: 0 });
      }
    }
    for (const record of state.microsims) {
      if (record.x < 0 || !record.stat) continue;
      const noise = latticeInt(record.slot + 1, month, state.seed + 31) % 13;
      const base = record.stat === "arrests" ? Math.floor(state.population / 60)
        : record.stat === "responses" ? Math.floor(state.population / 90)
        : record.stat === "students" ? Math.floor(state.population / 12)
        : record.stat === "patients" ? Math.floor(state.population / 25)
        : record.stat === "riders" ? Math.floor((state.railService.passengerCapacity + state.subwayService.passengerCapacity + state.busService.capacity) / 4)
        : record.stat === "visitors" ? Math.floor(state.population / 15)
        : record.stat === "events" ? 2
        : record.stat === "residents" ? (FACILITY_KINDS.arco.population || 0)
        : Math.floor(state.waterCapacity / 10);
      record.value = Math.max(0, base + noise);
    }
  }
  function serviceDispatch(state) {
    if (!state.problems.length || !state.services.length) return; const day = Math.floor(state.tick / TICKS_PER_DAY);
    const problem = state.problems[(day + state.seed) % state.problems.length]; const service = state.services[(day + state.seed) % state.services.length];
    pushEvent(state, "service-dispatched", { kind: service.kind, from: { x: service.x, y: service.y }, to: { x: problem.x, y: problem.y }, problem: problem.code });
  }
  function advanceTicks(state, count) {
    if (!Number.isInteger(count) || count < 0) throw new Error("bonsai-invalid-tick-count");
    // Before founding, the clock does not run: the terrain editor is a
    // timeless place. Immediate commands still apply through submitCommand.
    if (!state.founded) return;
    if (count && (state.undoStack.length || state.redoStack.length)) { state.undoStack = []; state.redoStack = []; pushEvent(state, "history-cleared", { reason: "simulation-advanced" }); }
    for (let step = 0; step < count; step += 1) {
      state.tick += 1; applyPendingCommands(state); advanceDisaster(state); advanceThings(state);
      if (state.tick % TICKS_PER_DAY === 0) { ensureDerived(state, true); growthPass(state); serviceDispatch(state); checkMilestones(state); }
      if (state.tick % TICKS_PER_MONTH === 0) { maybeStartEmergentDisaster(state); retirePlants(state); updateDemographics(state); updateMicrosims(state); updateThings(state); recomputeDemand(state); settleBudget(state); recordGraphs(state); composeNewspaper(state); advanceScenario(state); }
    }
  }
  function dateOf(state) {
    const days = Math.floor(state.tick / TICKS_PER_DAY); const months = Math.floor(days / DAYS_PER_MONTH);
    const yearFounded = Number.isInteger(state.yearFounded) ? state.yearFounded : START_YEAR;
    return { day: (days % DAYS_PER_MONTH) + 1, month: months % MONTHS_PER_YEAR, year: yearFounded + Math.floor(months / MONTHS_PER_YEAR) };
  }
  function averageLayerOnZones(state, layer) {
    let total = 0; let count = 0; for (let i = 0; i < tileCount(state); i += 1) if (state.zone[i]) { total += layer[i]; count += 1; } return count ? Math.round(total / count) : 0;
  }
  function cityReport(state) {
    ensureDerived(state); let congestedRoads = 0; let policeCovered = 0; let fireCovered = 0;
    for (let i = 0; i < tileCount(state); i += 1) { if (state.road[i] && state.congested[i]) congestedRoads += 1; if (state.policeCovered[i]) policeCovered += 1; if (state.fireCovered[i]) fireCovered += 1; }
    const pollution = averageLayerOnZones(state, state.pollution); const crime = averageLayerOnZones(state, state.crime); const fireRisk = averageLayerOnZones(state, state.fireRisk); const happiness = averageLayerOnZones(state, state.happiness);
    const rating = Math.max(0, Math.min(100, Math.round(45 + happiness * 0.4 + (state.funds >= 0 ? 10 : -15) - pollution * 0.12 - crime * 0.12 - fireRisk * 0.08 - congestedRoads * 0.2)));
    return { tick: state.tick, date: dateOf(state), population: state.population, jobs: state.jobs, cJobs: state.cJobs, iJobs: state.iJobs, funds: state.funds,
      eq: state.eq, le: state.le, workforcePercent: state.workforcePercent, unemployed: state.unemployed, nationalPopulation: state.nationalPopulation,
      graphs: cloneJson(state.graphs),
      taxRate: state.taxRate, taxRates: { ...state.taxRates }, bonds: state.bonds.map((item) => ({ ...item })), ordinances: { ...state.ordinances },
      rewardTier: state.rewardTier, rewardsOffered: state.rewardsOffered.slice(),
      arcoPopulation: state.arcoPopulation, totalPopulation: state.population + state.arcoPopulation,
      microsims: state.microsims.map((item) => ({ ...item })),
      newspaper: cloneJson(state.newspaper), paperDelivery: state.paperDelivery,
      scenario: state.scenario ? cloneJson(state.scenario) : null,
      demand: { ...state.demand }, economyIndex: state.economyIndex, rating,
      lastIncome: state.lastIncome, lastExpense: state.lastExpense, budget: cloneJson(state.budget), powerCapacity: state.powerCapacity, powerDemand: state.powerDemand,
      waterCapacity: state.waterCapacity, waterDemand: state.waterDemand, pollution, crime, fireRisk, happiness, policeCovered, fireCovered, congestedRoads,
      railService: { ...state.railService }, subwayService: { ...state.subwayService }, busService: { ...state.busService },
      services: state.services.map((item) => ({ ...item })), facilities: state.facilities.map((item) => ({ ...item })), funding: { ...state.funding },
      problems: state.problems.map((item) => ({ ...item })), history: state.history.map((item) => ({ ...item, demand: { ...item.demand } })) };
  }
  function tileInfo(state, x, y) {
    if (!inBounds(state, x, y)) return null; ensureDerived(state); const i = indexOf(state, x, y); const facility = state.facilityAt[i] >= 0 ? state.facilities[state.facilityAt[i]] : null; const code = state.problemCode[i];
    return { x, y, terrain: state.terrain[i], alt: state.alt[i], water: !!state.water[i], shore: !!state.shore[i], slope: state.slope[i], tree: !!state.tree[i],
      catalogId: state.catalogId[i], subway: state.subway[i], waterLevel: state.waterLevel[i], salt: !!state.salt[i], waterKind: state.waterKind[i],
      highway: !!state.highway[i], onramp: !!state.onramp[i],
      road: !!state.road[i], rail: !!state.rail[i], railConnected: !!state.railConnected[i], railOk: !!state.railOk[i], wire: !!state.wire[i], pipe: !!state.pipe[i], park: !!state.park[i], over: state.over[i], zone: state.zone[i], density: state.density[i],
      stage: state.stage[i], buildingState: state.buildingState[i], buildingId: state.buildingId[i], buildingAnchor: state.buildingAnchor[i], powered: !!state.powered[i], watered: !!state.watered[i], roadOk: !!state.roadOk[i],
      traffic: state.traffic[i], congested: !!state.congested[i], policeCovered: !!state.policeCovered[i], fireCovered: !!state.fireCovered[i], educationCovered: !!state.educationCovered[i], healthCovered: !!state.healthCovered[i],
      landValue: state.landValue[i], pollution: state.pollution[i], crime: state.crime[i], fireRisk: state.fireRisk[i], happiness: state.happiness[i], facility: facility ? facility.kind : null,
      microsim: facility ? (state.microsims.find((record) => record.kind === facility.kind && record.x === facility.x && record.y === facility.y) || null) : null,
      plant: facility && PLANT_KINDS[facility.kind] ? facility.kind : null, service: facility && SERVICE_KINDS[facility.kind] ? facility.kind : null,
      problem: code ? { code: PROBLEM_NAMES[code], x, y, action: PROBLEM_ACTIONS[code] } : null };
  }

  function serialize(state) {
    return { format: FORMAT, version: 3, rulesetVersion: 3, name: state.name, seed: state.seed, rngState: state.rngState | 0, size: state.size, terrainPreset: state.terrainPreset, yearFounded: state.yearFounded,
      tick: state.tick, funds: state.funds, taxRate: state.taxRate, taxRates: { ...state.taxRates }, bonds: state.bonds.map((item) => ({ ...item })), ordinances: { ...state.ordinances },
      eq: state.eq, le: state.le, workforcePercent: state.workforcePercent, unemployed: state.unemployed, nationalPopulation: state.nationalPopulation,
      graphs: cloneJson(state.graphs),
      rewardTier: state.rewardTier, rewardsOffered: state.rewardsOffered.slice(), microsims: state.microsims.map((item) => ({ ...item })),
      milestone: state.milestone, wasBroke: state.wasBroke, brownout: state.brownout, waterShortage: state.waterShortage,
      spawnCenter: { ...state.spawnCenter }, facilities: state.facilities.map((item) => ({ ...item })), funding: { ...state.funding }, budget: cloneJson(state.budget),
      things: state.things.map((item) => ({ ...item })),
      founded: state.founded,
      history: state.history.map((item) => ({ ...item, demand: { ...item.demand } })), nextCommandSequence: state.nextCommandSequence,
      pendingCommands: state.pendingCommands.map((item) => ({ schemaVersion: 2, type: item.type, payload: { ...item.payload }, targetTick: item.targetTick, clientCommandId: item.clientCommandId, sequence: item.sequence, originalType: item.originalType || item.type })),
      terrain: Array.from(state.terrain), alt: Array.from(state.alt), water: Array.from(state.water), shore: Array.from(state.shore), slope: Array.from(state.slope), tree: Array.from(state.tree),
      road: Array.from(state.road), rail: Array.from(state.rail), wire: Array.from(state.wire), pipe: Array.from(state.pipe), park: Array.from(state.park), zone: Array.from(state.zone), density: Array.from(state.density),
      stage: Array.from(state.stage), buildingState: Array.from(state.buildingState), constructionTimer: Array.from(state.constructionTimer), variant: Array.from(state.variant),
      catalogId: Array.from(state.catalogId), subway: Array.from(state.subway), waterLevel: Array.from(state.waterLevel), salt: Array.from(state.salt),
      highway: Array.from(state.highway), onramp: Array.from(state.onramp),
      rotate: Array.from(state.rotate), tunnel: Array.from(state.tunnel), waterKind: Array.from(state.waterKind), blaze: Array.from(state.blaze),
      disaster: state.disaster ? { ...state.disaster } : null, disastersOff: state.disastersOff,
      newspaper: cloneJson(state.newspaper), paperDelivery: state.paperDelivery, newsMemo: cloneJson(state.newsMemo),
      scenario: state.scenario ? cloneJson(state.scenario) : null,
      sc2Sidecar: state.sc2Sidecar ? cloneJson(state.sc2Sidecar) : null };
  }
  function readLayer(data, key, count, max, Type = Uint8Array) {
    const raw = data[key]; if (!Array.isArray(raw) || raw.length !== count) throw new Error(`bonsai-import-invalid: layer ${key}`); const layer = new Type(count);
    for (let i = 0; i < count; i += 1) { if (!Number.isInteger(raw[i]) || raw[i] < 0 || raw[i] > max) throw new Error(`bonsai-import-invalid: layer ${key}`); layer[i] = raw[i]; } return layer;
  }

  function migrateEngineV1(data) {
    if (!data || data.format !== FORMAT || data.version !== 1 || data.size !== 64) throw new Error("bonsai-import-invalid: v1"); const count = 4096;
    const over = Array.isArray(data.over) && data.over.length === count ? data.over : new Array(count).fill(0);
    const zone = Array.isArray(data.zone) && data.zone.length === count ? data.zone.slice() : new Array(count).fill(0);
    const stage = Array.isArray(data.stage) && data.stage.length === count ? data.stage.slice() : new Array(count).fill(0); const facilities = [];
    (Array.isArray(data.plants) ? data.plants : []).forEach((item) => { if (PLANT_KINDS[item.kind]) facilities.push({ kind: item.kind, x: item.x, y: item.y }); });
    (Array.isArray(data.services) ? data.services : []).forEach((item) => { if (SERVICE_KINDS[item.kind]) facilities.push({ kind: item.kind, x: item.x, y: item.y }); });
    const pendingCommands = (Array.isArray(data.pendingCommands) ? data.pendingCommands : []).map((item) => {
      const normalized = normalizeCommand(item);
      if (normalized.error) throw new Error("bonsai-import-invalid: pending-command");
      return {
        ...normalized.command,
        targetTick: normalized.command.targetTick * TICKS_PER_DAY,
        sequence: item.sequence,
        originalType: normalized.originalType,
      };
    });
    return { format: FORMAT, version: 2, rulesetVersion: 2, name: typeof data.name === "string" ? data.name : "", seed: Number.isInteger(data.seed) ? data.seed : 0,
      rngState: Number.isInteger(data.rngState) ? data.rngState : 0, size: 64, terrainPreset: "balanced", tick: (Number.isInteger(data.tick) ? data.tick : 0) * TICKS_PER_DAY,
      funds: Number.isInteger(data.funds) ? data.funds : START_FUNDS, taxRate: Number.isInteger(data.taxRate) ? data.taxRate : DEFAULT_TAX, speed: 0, milestone: data.milestone || 0,
      wasBroke: !!data.wasBroke, brownout: !!data.brownout, waterShortage: false, spawnCenter: { x: 32, y: 32 }, facilities,
      funding: { roads: (data.funding && data.funding.roads) ?? 100, utilities: 100, police: (data.funding && data.funding.police) ?? 100, fire: (data.funding && data.funding.fire) ?? 100, education: 100, health: 100 },
      budget: { income: 0, road: 0, utilities: 0, police: 0, fire: 0, education: 0, health: 0, debt: 0, expense: 0 }, loan: null, history: [],
      nextCommandSequence: Number.isInteger(data.nextCommandSequence) ? data.nextCommandSequence : 1, pendingCommands, terrain: Array.from({ length: count }, (_, i) => data.water && data.water[i] ? 0 : 1),
      alt: data.alt, water: data.water, shore: new Array(count).fill(0), slope: new Array(count).fill(0), tree: data.tree,
      road: over.map((value) => value === OVER_ROAD || value === OVER_ROADWIRE ? 1 : 0), rail: new Array(count).fill(0),
      wire: over.map((value) => value === OVER_WIRE || value === OVER_ROADWIRE ? 1 : 0), pipe: zone.map((value) => value ? 1 : 0), park: over.map((value) => value === OVER_PARK ? 1 : 0),
      zone, density: zone.map((value) => value ? DENSITY_LOW : 0), stage, buildingState: stage.map((value) => value ? BUILDING_ACTIVE : 0), constructionTimer: new Array(count).fill(0), variant: data.variant };
  }

  function migrateEngineV2To3(data) {
    if (!data || data.format !== FORMAT || data.version !== 2) throw new Error("bonsai-import-invalid: v2");
    if (!Number.isInteger(data.size) || data.size <= 0) throw new Error("bonsai-import-invalid: v2-size");
    const count = data.size * data.size; const zeros = () => new Array(count).fill(0);
    const water = Array.isArray(data.water) && data.water.length === count ? data.water : zeros();
    return { ...cloneJson(data), version: 3, rulesetVersion: 3, yearFounded: START_YEAR,
      catalogId: zeros(), subway: zeros(), waterLevel: zeros(), salt: zeros(), rotate: zeros(), tunnel: zeros(),
      highway: zeros(), onramp: zeros(),
      waterKind: water.map((value) => (value ? 1 : 0)), sc2Sidecar: null };
  }

  function deserialize(input) {
    let data = input && input.version === 1 ? migrateEngineV1(input) : input;
    if (data && data.version === 2) data = migrateEngineV2To3(data);
    if (!data || data.format !== FORMAT) throw new Error("bonsai-import-invalid: format"); if (data.version > 3) throw new Error("bonsai-import-version-too-new");
    if (data.version !== 3 || data.rulesetVersion !== 3) throw new Error("bonsai-import-version"); if (!SUPPORTED_SIZES.includes(data.size)) throw new Error("bonsai-import-invalid: size");
    if (!Number.isInteger(data.tick) || data.tick < 0 || !Number.isInteger(data.funds)) throw new Error("bonsai-import-invalid: scalar");
    const state = createCity({ seed: Number.isInteger(data.seed) ? data.seed : 0, size: data.size, terrainPreset: TERRAIN_PRESETS.includes(data.terrainPreset) ? data.terrainPreset : "balanced", name: typeof data.name === "string" ? data.name : "",
      yearFounded: Number.isInteger(data.yearFounded) && data.yearFounded >= 1000 && data.yearFounded <= 2999 ? data.yearFounded : START_YEAR });
    const count = data.size * data.size; state.rngState = Number.isInteger(data.rngState) ? data.rngState | 0 : state.seed | 0; state.tick = data.tick; state.funds = data.funds;
    state.taxRate = Number.isInteger(data.taxRate) ? data.taxRate : DEFAULT_TAX; state.speed = 0; state.milestone = data.milestone || 0;
    state.wasBroke = !!data.wasBroke; state.brownout = !!data.brownout; state.waterShortage = !!data.waterShortage;
    state.spawnCenter = data.spawnCenter && Number.isInteger(data.spawnCenter.x) && Number.isInteger(data.spawnCenter.y) ? { ...data.spawnCenter } : findSpawnCenter(state);
    state.terrain = readLayer(data, "terrain", count, 3); state.alt = readLayer(data, "alt", count, MAX_ALT); state.water = readLayer(data, "water", count, 1); state.shore = readLayer(data, "shore", count, 1);
    state.slope = readLayer(data, "slope", count, 15); state.tree = readLayer(data, "tree", count, 1); state.road = readLayer(data, "road", count, 1); state.rail = readLayer(data, "rail", count, 1);
    state.wire = readLayer(data, "wire", count, 1); state.pipe = readLayer(data, "pipe", count, 1); state.park = readLayer(data, "park", count, 1); state.zone = readLayer(data, "zone", count, MAX_ZONE);
    state.density = readLayer(data, "density", count, DENSITY_HIGH); state.stage = readLayer(data, "stage", count, MAX_STAGE); state.buildingState = readLayer(data, "buildingState", count, BUILDING_RECOVERING);
    state.constructionTimer = readLayer(data, "constructionTimer", count, 65535, Uint16Array); state.variant = readLayer(data, "variant", count, 255);
    state.catalogId = readLayer(data, "catalogId", count, 255); state.subway = readLayer(data, "subway", count, 63); state.waterLevel = readLayer(data, "waterLevel", count, MAX_ALT);
    state.highway = readLayer(data, "highway", count, 1); state.onramp = readLayer(data, "onramp", count, 1);
    state.salt = readLayer(data, "salt", count, 1); state.rotate = readLayer(data, "rotate", count, 1); state.tunnel = readLayer(data, "tunnel", count, 63); state.waterKind = readLayer(data, "waterKind", count, 7);
    state.blaze = Array.isArray(data.blaze) && data.blaze.length === count ? readLayer(data, "blaze", count, 7) : new Uint8Array(count);
    state.disaster = data.disaster && typeof data.disaster === "object" && DISASTER_KINDS[data.disaster.kind]
      ? { kind: data.disaster.kind, x: Number.isInteger(data.disaster.x) ? data.disaster.x : 0, y: Number.isInteger(data.disaster.y) ? data.disaster.y : 0,
        ticksRemaining: Number.isInteger(data.disaster.ticksRemaining) && data.disaster.ticksRemaining > 0 ? data.disaster.ticksRemaining : 1,
        cause: data.disaster.cause === "emergent" ? "emergent" : "menu" }
      : null;
    state.disastersOff = data.disastersOff === true;
    state.paperDelivery = data.paperDelivery !== false;
    state.scenario = null;
    if (data.scenario && typeof data.scenario === "object" && Number.isInteger(data.scenario.months) && data.scenario.months > 0) {
      const goals = {};
      if (data.scenario.goals && typeof data.scenario.goals === "object") {
        for (const key of SCENARIO_GOAL_KEYS) if (Number.isInteger(data.scenario.goals[key])) goals[key] = data.scenario.goals[key];
      }
      state.scenario = {
        id: typeof data.scenario.id === "string" ? data.scenario.id : "",
        months: data.scenario.months,
        elapsedMonths: Number.isInteger(data.scenario.elapsedMonths) && data.scenario.elapsedMonths >= 0 ? data.scenario.elapsedMonths : 0,
        status: ["active", "won", "lost"].includes(data.scenario.status) ? data.scenario.status : "active",
        goals,
        disaster: data.scenario.disaster && DISASTER_KINDS[data.scenario.disaster.kind]
          ? { kind: data.scenario.disaster.kind,
            delayMonths: Number.isInteger(data.scenario.disaster.delayMonths) ? data.scenario.disaster.delayMonths : 1,
            fired: data.scenario.disaster.fired === true,
            ...(Number.isInteger(data.scenario.disaster.x) ? { x: data.scenario.disaster.x, y: data.scenario.disaster.y | 0 } : {}) }
          : null,
      };
    }
    state.newspaper = data.newspaper && typeof data.newspaper === "object"
      ? { edition: Number.isInteger(data.newspaper.edition) && data.newspaper.edition >= 0 ? data.newspaper.edition : 0,
        extra: data.newspaper.extra === true,
        stories: Array.isArray(data.newspaper.stories)
          ? data.newspaper.stories.slice(0, MAX_NEWS_STORIES).filter((story) => story && NEWS_STORY_KEYS.includes(story.key)).map((story) => cloneJson(story))
          : [] }
      : { edition: 0, extra: false, stories: [] };
    state.newsMemo = data.newsMemo && typeof data.newsMemo === "object"
      ? { funds: Number.isInteger(data.newsMemo.funds) ? data.newsMemo.funds : state.funds,
        population: Number.isInteger(data.newsMemo.population) ? data.newsMemo.population : 0,
        milestone: Number.isInteger(data.newsMemo.milestone) ? data.newsMemo.milestone : 0,
        rewardTier: Number.isInteger(data.newsMemo.rewardTier) ? data.newsMemo.rewardTier : 0,
        plantExpired: data.newsMemo.plantExpired === true,
        ordinance: typeof data.newsMemo.ordinance === "string" && ORDINANCES[data.newsMemo.ordinance] ? data.newsMemo.ordinance : "",
        bonds: Number.isInteger(data.newsMemo.bonds) ? data.newsMemo.bonds : 0 }
      : { funds: state.funds, population: 0, milestone: 0, rewardTier: 0, plantExpired: false, ordinance: "", bonds: 0 };
    state.sc2Sidecar = data.sc2Sidecar && typeof data.sc2Sidecar === "object" ? cloneJson(data.sc2Sidecar) : null; state.facilities = [];
    for (const item of Array.isArray(data.facilities) ? data.facilities : []) {
      if (!FACILITY_KINDS[item.kind] || !Number.isInteger(item.x) || !Number.isInteger(item.y)) throw new Error("bonsai-import-invalid: facility");
      state.facilities.push({ kind: item.kind, x: item.x, y: item.y, builtTick: Number.isInteger(item.builtTick) ? item.builtTick : 0 });
    }
    // Funding accepts both the eleven-line shape and the legacy six-key
    // shape (education maps to schools; utilities had no SC2K line).
    const rawFunding = data.funding || {};
    const fundingLevel = (key, fallback) => {
      const value = rawFunding[key] != null ? rawFunding[key] : fallback;
      return Number.isInteger(value) && value >= 0 && value <= 100 ? value : 100;
    };
    state.funding = Object.fromEntries(FUNDING_SERVICES.map((service) => [service,
      fundingLevel(service, service === "schools" ? rawFunding.education : undefined)]));
    state.budget = { ...makeEmptyBudget(), ...(data.budget && typeof data.budget === "object" ? cloneJson(data.budget) : {}) };
    const rate = Number.isInteger(data.taxRate) ? data.taxRate : DEFAULT_TAX;
    state.taxRates = data.taxRates && typeof data.taxRates === "object"
      ? { r: Number.isInteger(data.taxRates.r) ? data.taxRates.r : rate, c: Number.isInteger(data.taxRates.c) ? data.taxRates.c : rate, i: Number.isInteger(data.taxRates.i) ? data.taxRates.i : rate }
      : { r: rate, c: rate, i: rate };
    syncMeanTaxRate(state);
    state.bonds = Array.isArray(data.bonds)
      ? data.bonds.slice(0, MAX_BONDS).map((item) => ({ principal: Number.isInteger(item.principal) ? item.principal : BOND_PRINCIPAL, rate: Number.isInteger(item.rate) ? item.rate : 5, issuedTick: Number.isInteger(item.issuedTick) ? item.issuedTick : 0 }))
      : data.loan && Number.isInteger(data.loan.balance) && data.loan.balance > 0
        ? [{ principal: data.loan.balance, rate: 5, issuedTick: 0 }]
        : [];
    state.ordinances = makeOrdinanceState();
    if (data.ordinances && typeof data.ordinances === "object") for (const id of ORDINANCE_IDS) if (typeof data.ordinances[id] === "boolean") state.ordinances[id] = data.ordinances[id];
    const scalar = (value, low, high, fallback) => (Number.isInteger(value) && value >= low && value <= high ? value : fallback);
    state.eq = scalar(data.eq, 0, 150, 60); state.le = scalar(data.le, 20, 90, 60);
    state.rewardTier = scalar(data.rewardTier, 0, 6, 0);
    state.rewardsOffered = Array.isArray(data.rewardsOffered)
      ? data.rewardsOffered.filter((kind) => REWARD_TIERS.some((reward) => reward.kind === kind)) : [];
    state.microsims = Array.isArray(data.microsims)
      ? data.microsims.slice(0, MAX_MICROSIMS).map((item, slot) => ({
        slot, kind: typeof item.kind === "string" ? item.kind : "",
        stat: typeof item.stat === "string" ? item.stat : (MICROSIM_KINDS[item.kind] || ""),
        x: Number.isInteger(item.x) ? item.x : -1, y: Number.isInteger(item.y) ? item.y : -1,
        value: Number.isInteger(item.value) ? item.value : 0,
        ...(Array.isArray(item.raw) ? { raw: item.raw.slice(0, 4).map((entry) => (Number.isInteger(entry) ? entry : 0)) } : {}),
      })) : [];
    state.things = Array.isArray(data.things)
      ? data.things.slice(0, MAX_THINGS).filter((item) => THING_ID_BY_KIND[item.kind]).map((item) => ({
        kind: item.kind,
        x: Number.isInteger(item.x) ? item.x : 0, y: Number.isInteger(item.y) ? item.y : 0,
        z: Number.isInteger(item.z) ? item.z : 0, dir: Number.isInteger(item.dir) ? item.dir & 3 : 0,
        ...(Array.isArray(item.raw) ? { raw: item.raw.slice(0, 12).map((entry) => (Number.isInteger(entry) ? entry & 255 : 0)) } : {}),
      })) : [];
    state.founded = data.founded !== false;
    state.workforcePercent = scalar(data.workforcePercent, 30, 70, 41);
    state.unemployed = Number.isInteger(data.unemployed) && data.unemployed >= 0 ? data.unemployed : 0;
    state.nationalPopulation = Number.isInteger(data.nationalPopulation) && data.nationalPopulation > 0 ? data.nationalPopulation : 120000;
    state.graphs = makeEmptyGraphs();
    if (data.graphs && typeof data.graphs === "object") for (const tier of Object.keys(GRAPH_TIERS)) {
      const source = data.graphs[tier];
      if (!source || typeof source !== "object") continue;
      for (const series of GRAPH_SERIES) if (Array.isArray(source[series])) {
        state.graphs[tier][series] = source[series].slice(-GRAPH_TIERS[tier]).map((value) => (Number.isFinite(value) ? Math.trunc(value) : 0));
      }
    }
    state.history = Array.isArray(data.history) ? data.history.slice(-MAX_HISTORY_MONTHS).map((item) => ({ ...item, demand: { ...(item.demand || {}) } })) : [];
    state.nextCommandSequence = Number.isInteger(data.nextCommandSequence) && data.nextCommandSequence > 0 ? data.nextCommandSequence : 1; state.pendingCommands = [];
    for (const item of Array.isArray(data.pendingCommands) ? data.pendingCommands : []) {
      if (!item || item.schemaVersion !== 2 || !Number.isInteger(item.targetTick) || !Number.isInteger(item.sequence)) throw new Error("bonsai-import-invalid: pending-command");
      state.pendingCommands.push({ schemaVersion: 2, type: item.type, payload: { ...(item.payload || {}) }, targetTick: item.targetTick, clientCommandId: typeof item.clientCommandId === "string" ? item.clientCommandId : "", sequence: item.sequence, originalType: item.originalType || item.type });
    }
    state.pendingCommands.sort((a, b) => (a.targetTick - b.targetTick) || (a.sequence - b.sequence)); state.events = []; state.notices = []; state.undoStack = []; state.redoStack = [];
    markDerivedDirty(state); ensureDerived(state); state.rev = 1; return state;
  }

  async function sha256Hex(text) {
    if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("bonsai-crypto-unavailable"); if (typeof TextEncoder === "undefined") throw new Error("bonsai-text-encoder-unavailable");
    const digest = await crypto.subtle.digest(INTEGRITY_ALGORITHM, new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function checkpoint(state) { return sha256Hex(canonicalStringify(serialize(state))); }
  function envelopeWithoutIntegrity(envelope) { return { format: envelope.format, formatVersion: envelope.formatVersion, metadata: envelope.metadata, engine: envelope.engine, simulation: envelope.simulation, payload: envelope.payload }; }
  async function encodeSave(state, metadata = {}) {
    const envelope = { format: FORMAT, formatVersion: SAVE_FORMAT_VERSION,
      metadata: { cityId: typeof metadata.cityId === "string" ? metadata.cityId : "", name: typeof metadata.name === "string" ? metadata.name : state.name, createdAt: typeof metadata.createdAt === "string" ? metadata.createdAt : "", updatedAt: typeof metadata.updatedAt === "string" ? metadata.updatedAt : "" },
      engine: { rulesetVersion: ENGINE_RULESET_VERSION, fixedTickHz: FIXED_TICK_HZ, ticksPerDay: TICKS_PER_DAY, daysPerMonth: DAYS_PER_MONTH }, simulation: { seed: state.seed, rng: { algorithm: "mulberry32-v1", state: [state.rngState | 0] } }, payload: serialize(state) };
    return { ...envelope, integrity: { algorithm: INTEGRITY_ALGORITHM, canonicalization: CANONICALIZATION, digest: await sha256Hex(canonicalStringify(envelope)) } };
  }
  function validateSaveEnvelope(envelope) {
    const errors = [];
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) errors.push("envelope"); else {
      if (envelope.format !== FORMAT) errors.push("format"); if (!Number.isInteger(envelope.formatVersion) || envelope.formatVersion < 1 || envelope.formatVersion > SAVE_FORMAT_VERSION) errors.push("format-version");
      if (!envelope.engine || ![1, 2, 3].includes(envelope.engine.rulesetVersion)) errors.push("ruleset-version"); if (!envelope.simulation || typeof envelope.simulation.seed !== "number") errors.push("simulation-seed");
      if (!envelope.payload || typeof envelope.payload !== "object") errors.push("payload"); if (!envelope.integrity || envelope.integrity.algorithm !== INTEGRITY_ALGORITHM) errors.push("integrity-algorithm");
      if (!envelope.integrity || envelope.integrity.canonicalization !== CANONICALIZATION) errors.push("integrity-canonicalization"); if (!envelope.integrity || !/^[a-f0-9]{64}$/i.test(String(envelope.integrity.digest))) errors.push("integrity-digest");
    }
    return { valid: !errors.length, errors };
  }
  function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
  function migrateSave(envelope) {
    if (!envelope || envelope.format !== FORMAT) throw new Error("bonsai-save-invalid: format"); if (envelope.formatVersion > SAVE_FORMAT_VERSION) throw new Error("bonsai-save-version-too-new");
    if (envelope.formatVersion === SAVE_FORMAT_VERSION) return envelope;
    if (![1, 2].includes(envelope.formatVersion)) throw new Error("bonsai-save-version-unsupported");
    const from = envelope.formatVersion; const out = cloneJson(envelope);
    if (out.formatVersion === 1) { out.formatVersion = 2; out.payload = migrateEngineV1(out.payload); }
    out.formatVersion = 3; out.payload = migrateEngineV2To3(out.payload);
    out.engine = { rulesetVersion: 3, fixedTickHz: 20, ticksPerDay: 5, daysPerMonth: 25 };
    out.simulation = { seed: out.payload.seed, rng: { algorithm: "mulberry32-v1", state: [out.payload.rngState | 0] } }; out.migratedFromFormatVersion = from; return out;
  }
  async function decodeSave(envelope) {
    if (envelope && envelope.formatVersion > SAVE_FORMAT_VERSION) throw new Error("bonsai-save-version-too-new"); const validation = validateSaveEnvelope(envelope);
    if (!validation.valid) throw new Error(`bonsai-save-invalid: ${validation.errors.join(",")}`); const digest = await sha256Hex(canonicalStringify(envelopeWithoutIntegrity(envelope)));
    if (digest.toLowerCase() !== String(envelope.integrity.digest).toLowerCase()) throw new Error("bonsai-save-integrity"); const migrated = migrateSave(envelope);
    return { state: deserialize(migrated.payload), metadata: migrated.metadata || {}, migratedFromFormatVersion: migrated.migratedFromFormatVersion || null };
  }

  function replayExampleCity(id) {
    const recipe = EXAMPLES[id];
    if (!recipe) throw new Error("bonsai-example-unknown");
    const state = createCity({ name: recipe.name, seed: recipe.seed, size: recipe.size, terrainPreset: recipe.terrainPreset });
    recipe.commandLog.forEach((command, commandIndex) => {
      if (command.targetTick < state.tick || command.targetTick > recipe.targetTick) throw new Error(`bonsai-example-tick:${id}:${commandIndex}`);
      advanceTicks(state, command.targetTick - state.tick);
      const result = submitCommand(state, { ...command, targetTick: state.tick });
      if (!result.accepted) throw new Error(`bonsai-example-command:${id}:${commandIndex}:${result.code}`);
    });
    advanceTicks(state, recipe.targetTick - state.tick);
    return state;
  }

  async function createExampleCity(id) {
    const recipe = EXAMPLES[id];
    if (!recipe) throw new Error("bonsai-example-unknown");
    const replayed = replayExampleCity(id);
    const envelope = await encodeSave(replayed, {
      cityId: `example-${id}`,
      name: recipe.name,
      createdAt: "example-v2",
      updatedAt: "example-v2",
    });
    return (await decodeSave(envelope)).state;
  }

  function derivedAgentFacts(state) {
    ensureDerived(state); const roads = []; const rails = []; const activeBuildings = [];
    for (let i = 0; i < tileCount(state); i += 1) { if (state.road[i]) roads.push(i); if (state.railConnected[i]) rails.push(i); if (state.buildingAnchor[i] === i) activeBuildings.push(i); }
    function facts(kind, source, count) {
      const out = []; if (!source.length) return out;
      for (let id = 0; id < count; id += 1) { const h = latticeInt(id, Math.floor(state.tick / 5), state.seed + kind.length * 97); const pos = xyOf(state, source[h % source.length]); out.push({ id: `${kind}-${id}`, x: pos.x, y: pos.y, phase: ((h >>> 8) % 1000) / 1000 }); }
      return out;
    }
    const coal = state.facilities.filter((item) => { const spec = FACILITY_KINDS[item.kind]; return spec.power && spec.pollution; }).map((item) => indexOf(state, item.x, item.y)); const serviceSources = state.services.map((item) => indexOf(state, item.x, item.y));
    return { vehicles: facts("vehicle", roads, Math.min(64, Math.floor(state.population / 40))), pedestrians: facts("pedestrian", activeBuildings, Math.min(48, Math.floor(state.population / 60))),
      trains: facts("train", rails, Math.min(8, state.railService.connectedStations * 2)), smoke: facts("smoke", coal, coal.length * 3),
      serviceVehicles: facts("service", serviceSources, Math.min(serviceSources.length, state.problems.length)) };
  }
  function buildRenderSnapshot(state) {
    ensureDerived(state); return { size: state.size, tick: state.tick, seed: state.seed, rev: state.rev, timeOfDay: (state.tick % 150) / 150, spawnCenter: { ...state.spawnCenter },
      terrain: state.terrain, alt: state.alt, water: state.water, shore: state.shore, slope: state.slope, tree: state.tree, road: state.road, rail: state.rail, wire: state.wire, pipe: state.pipe, park: state.park, over: state.over,
      zone: state.zone, density: state.density, stage: state.stage, buildingState: state.buildingState, variant: state.variant, traffic: state.traffic, congested: state.congested, powered: state.powered, watered: state.watered,
      railConnected: state.railConnected, railOk: state.railOk, landValue: state.landValue,
      policeCovered: state.policeCovered, fireCovered: state.fireCovered, educationCovered: state.educationCovered, healthCovered: state.healthCovered,
      pollution: state.pollution, crime: state.crime, fireRisk: state.fireRisk, happiness: state.happiness, problemCode: state.problemCode, buildingId: state.buildingId, buildingAnchor: state.buildingAnchor, buildings: state.buildings,
      catalogId: state.catalogId, subway: state.subway, waterLevel: state.waterLevel, salt: state.salt, rotate: state.rotate, tunnel: state.tunnel, waterKind: state.waterKind,
      highway: state.highway, onramp: state.onramp,
      blaze: state.blaze, disaster: state.disaster ? { ...state.disaster } : null,
      facilityAt: state.facilityAt, plantAt: state.plantAt, serviceAt: state.serviceAt, facilities: state.facilities, plants: state.plants, services: state.services,
      railService: { ...state.railService }, subwayService: { ...state.subwayService }, busService: { ...state.busService },
      things: state.things.map((item) => ({ kind: item.kind, x: item.x, y: item.y, z: item.z, dir: item.dir })),
      agents: derivedAgentFacts(state) };
  }

  window.AISystem6BonsaiSim = Object.freeze({
    SIZE, DEFAULT_SIZE, SUPPORTED_SIZES, TERRAIN_PRESETS, MAX_ALT, MAX_STAGE, FORMAT, SAVE_VERSION, COMMAND_SCHEMA_VERSION, EVENT_SCHEMA_VERSION, ENGINE_RULESET_VERSION,
    DAYS_PER_MONTH, MONTHS_PER_YEAR, YEAR_FOUNDED_CHOICES, ORDINANCES, ORDINANCE_IDS, BOND_PRINCIPAL, MAX_BONDS, GRAPH_SERIES, GRAPH_TIERS, REWARD_TIERS, MICROSIM_KINDS, DISASTER_KINDS, NEWS_STORY_KEYS,
    FIXED_TICK_HZ, TICKS_PER_DAY, SAVE_FORMAT_VERSION, INTEGRITY_ALGORITHM, CANONICALIZATION, CONGESTION_THRESHOLD, COSTS, unitCost, TOOLS, FACILITY_KINDS, SERVICE_KINDS, PLANT_KINDS, FUNDING_SERVICES,
    OVER: Object.freeze({ NONE: 0, ROAD: 1, WIRE: 2, PARK: 3, ROADWIRE: 4 }), ZONE: Object.freeze({ NONE: 0, R: 1, C: 2, I: 3, MILITARY: 4, AIRPORT: 5, SEAPORT: 6 }), DENSITY: Object.freeze({ NONE: 0, LOW: 1, HIGH: 2 }),
    BUILDING_STATE: Object.freeze({ EMPTY: 0, FOUNDATION: 1, CONSTRUCTION: 2, ACTIVE: 3, DECLINING: 4, ABANDONED: 5, RECOVERING: 6 }), PROBLEM,
    EXAMPLES, SCENARIOS, createScenarioCity, createCity, replayExampleCity, createExampleCity, advanceTicks, applyTool, previewCommand, submitCommand, undo, redo, drainEvents, canonicalStringify, checkpoint, encodeSave, decodeSave, validateSaveEnvelope, migrateSave,
    cityReport, tileInfo, ensureDerived, dateOf, drainNotices, derivedAgentFacts, buildRenderSnapshot, serialize, deserialize,
  });
})();
