// Bonsai City deterministic simulation core / 盆景城市确定性模拟核心.
// Original MIT-clean rules: the shell supplies a seed and advances whole ticks.
window.AISystem6BonsaiSimLoaded = true;

(function initBonsaiSim() {
  "use strict";

  const FORMAT = "bonsai-city";
  const SAVE_VERSION = 5;
  const SAVE_FORMAT_VERSION = 5;
  const ENGINE_RULESET_VERSION = 5;
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
  // SC2K's easy-difficulty treasury; money is the first constraint.
  const START_FUNDS = 20000;
  const DEFAULT_TAX = 7;
  const MAX_TAX_RATE = 20;
  const MAX_PENDING_COMMANDS = 256;
  // The event ring the shell drains once a frame and a headless driver once
  // a day. A development pass on a grown city emits a few hundred events in
  // one tick (construction, completions, rebuilds); at 128 the ring dropped
  // the oldest of them, a disaster's end and its extra edition among them.
  // Events are output only and never saved, so the size touches no replay.
  const MAX_EVENTS = 1024;
  const MAX_HISTORY_MONTHS = 120;
  const MAX_UNDO = 100;
  // Every building stands on a street: a lot works only while its footprint
  // has a street tile along a side (SC3K's rule, not SC2K's three tiles),
  // because that is the way in for the fire engine, the police car and the
  // people who live and work there. A block's inner cells are built only as
  // part of a bigger lot that reaches the street.
  const ROAD_REACH = 1;
  // An airport or seaport is one installation with roads of its own inside
  // its fence: its tiles work within PORT_REACH of a street, as in SC2K.
  const PORT_REACH = 3;
  // Road capacity in commuter trips per 4-day routing pass (our balance).
  const CONGESTION_THRESHOLD = 80;
  const HIGHWAY_CAPACITY = 320;
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

  const PROBLEM = Object.freeze({ NONE: 0, NO_ROAD: 1, NO_POWER: 2, NO_WATER: 3, CONGESTED: 4, NO_DEMAND: 5, POLLUTION: 6, NO_COMMUTE: 7 });
  const PROBLEM_NAMES = Object.freeze([null, "no-road", "no-power", "no-water", "congested", "no-demand", "pollution", "no-commute"]);
  const PROBLEM_ACTIONS = Object.freeze([null, "build-road", "connect-power", "connect-water", "add-transport-capacity", "rebalance-demand", "separate-industry", "connect-destinations"]);

  // --- Lots (ruleset 5) --------------------------------------------------
  // A lot is one whole building on a 1x1, 2x2 or 3x3 square of zoned land.
  // The persistent `lot` layer holds anchor index + 1 on every cell of the
  // lot (the anchor is its min-x, min-y cell); the anchor carries the lot's
  // size in `stage`, its state in `buildingState`, its day counter in
  // `constructionTimer` and its look in `variant` (1..24: 1-8 low, 9-16
  // middle, 17-24 high tier). Every cell mirrors `stage` and `buildingState`
  // so per-tile readers (codecs, minimap, overlays) keep working.
  // Capacities are our own balance, multiplied by the tier.
  const LOT_CAPACITY = Object.freeze([
    null,
    Object.freeze([0, 24, 16, 24]),
    Object.freeze([0, 220, 160, 200]),
    Object.freeze([0, 1100, 800, 700]),
  ]);
  // Capacity by tier. The tier is the look a lot's land value buys (low,
  // middle, high: houses and walk-ups up to towers); it no longer buys
  // people. The spec's 0.7 / 1.0 / 1.35 never came into play — the tier
  // thresholds sat above every land value the formula makes, so every lot
  // was low tier at 0.7 — and giving the middle and high tiers their
  // bonus now would grow cities a fifth and push money past its rules.
  // Every tier keeps the 0.7 the game has always run on.
  const LOT_TIER_MULTIPLIER = Object.freeze([1, 0.7, 0.7, 0.7]);
  const LOT_VARIANTS_PER_TIER = 8;
  const LOT_CONSTRUCTION_DAYS = Object.freeze([0, 8, 16, 24]);
  // Every cell is looked at once in DEV_SLICES days, so a lot's day counter
  // advances by DEV_SLICES per look.
  const DEV_SLICES = 4;
  const LOT_RULES = Object.freeze({
    foundationDays: 3, declineDays: 20, recoverDays: 10, abandonedClearDays: 300,
    // A blackout empties a town gradually: every look at a dark lot carries
    // powerDeclineChance of decline, and powerFuseDays in the dark brings it
    // down for certain, so a plant rebuilt within two months saves most of it.
    powerFuseDays: 90, powerDeclineChance: 0.03, roadFuseDays: 30, commuteFuseDays: 60, waterFuseDays: 60, nuisanceFuseDays: 60,
    growthBase: 0.006, growthSlope: 0.04, upgradeChance: 0.015, oversupplyChance: 0.1,
    // A 2x2 lot from land value 45: with every building on a street
    // (ROAD_REACH 1) a block's second row is only built as part of a 2x2
    // that reaches the street, and a young town's land is worth about 45.
    bigDemand: 30, bigLandValue: 90, midDemand: 15, midLandValue: 45, upgradeDemand: 25,
    // Tier thresholds on the land value the formula actually makes (a
    // mature city's median lot is about 50, its dearest blocks 70-95):
    // under 58 low, then middle, then high from the city's tower line —
    // the land value only its dearest downtownShare of dry land reaches,
    // never below tierHigh. How dear a downtown grows differs from
    // city to city, so the line follows the city: every city gets a
    // downtown on its own dearest streets. A working lot whose land has
    // risen over the line is rebuilt at the high tier, redevelopChance per
    // look while demand for its zone lasts, the SC2K way a block that grows
    // dear gets its towers.
    tierLow: 58, tierHigh: 66, downtownShare: 0.03, redevelopChance: 0.01,
    // The high tier is for lots on a street: a lot that touches no road
    // tops out at the middle tier, so towers line streets instead of
    // standing in the middle of a block. Within the high tier the land
    // value picks the height: every towerValueStep over the line is one of
    // the eight high variants taller, so a downtown peaks where land is
    // dearest and steps down toward its edges. A tower whose land has risen
    // two ranks since it was built is rebuilt taller, at redevelopChance.
    towerValueStep: 1.5,
    declineCrime: 30, crimeDeclineSlope: 0.02, crimeDeclineMax: 0.3, crimeRecoverSpan: 8, declinePollution: 150, pollutionProblem: 50,
  });
  // Commuting: every 4 days two distance fields are routed over the road
  // graph (to jobs, to homes). Costs are per tile entered; COMMUTE_LIMIT is
  // about 40 plain road tiles.
  // Grid units per plant megawatt: a 200 MW coal plant carries 400 zoned
  // tiles, roughly ten thousand people in a mixed town (our balance).
  const POWER_UNITS_PER_MW = 2;
  const ROUTE_DAYS = 4;
  const ROUTE_COST = Object.freeze({ road: 5, congested: 9, highway: 2, onramp: 3, rail: 2, subway: 2, station: 3 });
  const COMMUTE_LIMIT = 200;
  const ROUTE_UNREACHED = 65535;
  const ROUTE_MAX = 4000;
  const TRIPS_PER_RESIDENT = 1 / 8;
  // Derived systems are marked dirty separately; a command marks only what
  // it touches and ensureDerived recomputes only what is dirty.
  const DIRTY = Object.freeze({
    TERRAIN: 1, FACILITIES: 2, NETWORK: 4, POWER: 8, WATER: 16, COVERAGE: 32,
    LOTS: 64, ROUTES: 128, ENV: 256, PROBLEMS: 512,
  });
  const DIRTY_STRUCTURE = 1023 & ~DIRTY.ENV;
  const DIRTY_ALL = 1023;

  // Highway rides at SC2K's player-visible $100 per 2x2 section, charged as
  // $25 per tile; the onramp is the $25 joint piece [verify-during-impl].
  const NETWORK_COST = Object.freeze({ road: 10, rail: 25, wire: 5, pipe: 8, park: 20, subway: 100, highway: 25, onramp: 25 });
  // Crossing water builds a bridge (or a line over pylons): same layer,
  // higher per-tile price. Pipes and subways stay on land.
  const BRIDGE_COST = Object.freeze({ road: 50, rail: 75, wire: 25, highway: 100 });
  // SC2K-scale zoning: $5 a light tile, $10 a dense one.
  const ZONE_COST = Object.freeze({ low: 5, high: 10 });
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
  // owner's side-by-side sessions. The EQ/LE hooks landed with the
  // population model (M4b): updateDemographics reads proReading (EQ),
  // cprTraining, freeClinics, and publicSmokingBan (LE).
  const ORDINANCES = Object.freeze({
    salesTax: { section: "finance", incomeDiv: 20 },
    incomeTax: { section: "finance", incomeDiv: 25 },
    legalizedGambling: { section: "finance", incomeDiv: 16, crime: 5 },
    parkingFines: { section: "finance", incomeDiv: 40 },
    proReading: { section: "education", base: 20, costDiv: 50 },       // EQ +5
    antiDrug: { section: "safety", base: 20, costDiv: 50, crime: -8 },
    cprTraining: { section: "safety", base: 10, costDiv: 80 },         // LE +2
    neighborhoodWatch: { section: "safety", base: 10, costDiv: 60, crime: -6 },
    juniorSports: { section: "promotion", base: 20, costDiv: 60, happiness: 2 },
    publicSmokingBan: { section: "safety", base: 5, costDiv: 200 },    // LE +2
    freeClinics: { section: "safety", base: 25, costDiv: 40 },         // LE +3
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
    coal: { w: 4, h: 4, cost: 4000, upkeep: 60, power: 200, pollution: 70, tech: 1900, lifespan: true, group: "utility" },
    hydro: { w: 1, h: 1, cost: 400, upkeep: 8, power: 20, pollution: 0, tech: 1900, lifespan: true, needsWaterfall: true, group: "utility" },
    oil: { w: 4, h: 4, cost: 6600, upkeep: 70, power: 220, pollution: 60, tech: 1900, lifespan: true, group: "utility" },
    gas: { w: 4, h: 4, cost: 2000, upkeep: 40, power: 50, pollution: 20, tech: 1950, lifespan: true, group: "utility" },
    nuclear: { w: 4, h: 4, cost: 15000, upkeep: 100, power: 500, pollution: 5, tech: 1955, lifespan: true, group: "utility" },
    wind: { w: 1, h: 1, cost: 100, upkeep: 4, power: 4, pollution: 0, tech: 1900, lifespan: true, group: "utility" },
    solar: { w: 4, h: 4, cost: 1300, upkeep: 20, power: 50, pollution: 0, tech: 1990, lifespan: true, group: "utility" },
    microwave: { w: 4, h: 4, cost: 28000, upkeep: 120, power: 1600, pollution: 0, tech: 2020, lifespan: true, group: "utility" },
    fusion: { w: 4, h: 4, cost: 40000, upkeep: 150, power: 2500, pollution: 0, tech: 2050, lifespan: true, group: "utility" },
    // A pump yields its figure once per fresh-water tile it touches (the
    // SC2K rule: the more shoreline, the more water).
    pump: { w: 1, h: 1, cost: 450, upkeep: 15, water: 150, perShore: true, tech: 1900, group: "utility" },
    "water-tower": { w: 1, h: 1, cost: 300, upkeep: 8, water: 250, tech: 1900, group: "utility" },
    treatment: { w: 1, h: 1, cost: 500, upkeep: 30, water: 1000, tech: 1935, group: "utility" },
    desal: { w: 2, h: 2, cost: 1000, upkeep: 40, water: 500, tech: 1990, desalinates: true, group: "utility" },
    // Monthly upkeep at full funding is our balance (ruleset 5), tuned with
    // the scripted mayor so a 7% city with a sensible set of services
    // spends about what it earns (spec 3.7).
    // Police and fire reach sixteen tiles, fading with distance; schools,
    // clinics, hospitals and universities serve by capacity.
    police: { w: 1, h: 1, cost: 300, upkeep: 150, radius: 16, tech: 1900, group: "police" },
    fire: { w: 1, h: 1, cost: 250, upkeep: 150, radius: 16, tech: 1900, group: "fire" },
    school: { w: 1, h: 1, cost: 350, upkeep: 125, radius: 10, capacity: 1500, tech: 1900, group: "schools" },
    clinic: { w: 1, h: 1, cost: 400, upkeep: 120, radius: 10, capacity: 500, tech: 1900, group: "health" },
    hospital: { w: 3, h: 3, cost: 500, upkeep: 200, radius: 10, capacity: 3000, tech: 1900, group: "health" },
    university: { w: 3, h: 3, cost: 1000, upkeep: 375, radius: 12, capacity: 5000, tech: 1900, group: "colleges" },
    library: { w: 2, h: 2, cost: 500, upkeep: 75, radius: 8, eqBonus: 4, tech: 1900, group: "schools" },
    museum: { w: 3, h: 3, cost: 1000, upkeep: 150, radius: 10, eqBonus: 4, valueBonus: 6, tech: 1900, group: "schools" },
    prison: { w: 3, h: 3, cost: 3000, upkeep: 300, capacity: 2000, tech: 1900, group: "police" },
    zoo: { w: 3, h: 3, cost: 3000, upkeep: 150, valueBonus: 12, radius: 8, happiness: 3, tech: 1900, group: "recreation" },
    stadium: { w: 3, h: 3, cost: 5000, upkeep: 300, valueBonus: 10, radius: 8, happiness: 4, tech: 1900, group: "recreation" },
    marina: { w: 2, h: 2, cost: 1000, upkeep: 75, valueBonus: 10, radius: 6, needsShore: true, tech: 1900, group: "recreation" },
    "park-big": { w: 3, h: 3, cost: 150, upkeep: 6, valueBonus: 8, radius: 3, park: true, tech: 1900, group: "recreation" },
    station: { w: 2, h: 2, cost: 600, upkeep: 100, radius: 4, tech: 1900, group: "transport" },
    "subway-station": { w: 1, h: 1, cost: 250, upkeep: 75, radius: 4, tech: 1910, group: "transport" },
    bus: { w: 1, h: 1, cost: 250, upkeep: 60, radius: 8, tech: 1920, group: "transport" },
    // Rewards: offered by the population ladder, free to place, and they
    // lift land value around them. Arcologies repeat; the rest are one
    // each. Thresholds and arco capacity are tuned against the owner's
    // side-by-side sessions.
    "mayors-house": { w: 2, h: 2, cost: 0, upkeep: 0, reward: true, valueBonus: 10, radius: 6, group: "civic" },
    "city-hall": { w: 3, h: 3, cost: 0, upkeep: 0, reward: true, valueBonus: 12, radius: 8, group: "civic" },
    statue: { w: 1, h: 1, cost: 0, upkeep: 0, reward: true, valueBonus: 8, radius: 5, group: "civic" },
    dome: { w: 4, h: 4, cost: 0, upkeep: 0, reward: true, valueBonus: 10, radius: 6, group: "civic" },
    arco: { w: 4, h: 4, cost: 0, upkeep: 0, reward: true, repeatable: true, population: 30000, valueBonus: 6, radius: 4, tech: 2000, group: "civic" },
    // SC2K arco family (MISC 0738-0774). The reward offers a single arco at
    // tier 6 the SC2K way; the mayor chooses which kind. Each has its own
    // population, value bonus, and discovery year.
    "arco-plymouth": { w: 4, h: 4, cost: 0, upkeep: 0, reward: true, repeatable: true, population: 24000, valueBonus: 6, radius: 4, tech: 2000, group: "civic" },
    "arco-forest": { w: 4, h: 4, cost: 0, upkeep: 0, reward: true, repeatable: true, population: 22000, valueBonus: 6, radius: 4, tech: 2000, group: "civic" },
    "arco-darco": { w: 4, h: 4, cost: 0, upkeep: 0, reward: true, repeatable: true, population: 26000, valueBonus: 7, radius: 4, tech: 2000, group: "civic" },
    "arco-launch": { w: 4, h: 4, cost: 0, upkeep: 0, reward: true, repeatable: true, population: 32000, valueBonus: 8, radius: 4, tech: 2000, group: "civic" },
  });
  const PLANT_KINDS = Object.freeze(Object.fromEntries(Object.entries(FACILITY_KINDS).filter(([, spec]) => spec.power)));
  // Save rule 3.1: a facility record may carry its own `w`/`h`. A coal plant
  // was 2x2 until the SC2K 4x4 footprint landed; records without a footprint
  // keep the size they were built with, so an old save and a `.sc2` import
  // stand unchanged while a new placement takes the full pad. The query
  // panel names the older size. Only kinds listed here write w/h. Domes
  // and arcologies were 3x3 until their footprint matched their 4x4 art.
  const LEGACY_3X3 = Object.freeze({ w: 3, h: 3 });
  const LEGACY_FOOTPRINTS = Object.freeze({
    coal: Object.freeze({ w: 2, h: 2 }), dome: LEGACY_3X3, arco: LEGACY_3X3,
    "arco-plymouth": LEGACY_3X3, "arco-forest": LEGACY_3X3, "arco-darco": LEGACY_3X3, "arco-launch": LEGACY_3X3,
  });
  function footprintOf(facility) {
    if (Number.isInteger(facility.w) && Number.isInteger(facility.h) && facility.w > 0 && facility.h > 0) return { w: facility.w, h: facility.h };
    return LEGACY_FOOTPRINTS[facility.kind] || { w: FACILITY_KINDS[facility.kind].w, h: FACILITY_KINDS[facility.kind].h };
  }
  function facilityRecord(kind, x, y, builtTick) {
    const record = { kind, x, y, builtTick };
    if (LEGACY_FOOTPRINTS[kind]) { record.w = FACILITY_KINDS[kind].w; record.h = FACILITY_KINDS[kind].h; }
    return record;
  }
  const REWARD_TIERS = Object.freeze([
    { tier: 1, kind: "mayors-house", threshold: 2000 },
    { tier: 2, kind: "city-hall", threshold: 10000 },
    { tier: 3, kind: "statue", threshold: 30000 },
    { tier: 4, kind: "military-base", threshold: 60000 },
    { tier: 5, kind: "dome", threshold: 80000 },
    { tier: 6, kind: "arco", threshold: 120000 },
  ]);
  const ARCO_KINDS = Object.freeze([
    "arco-plymouth", "arco-forest", "arco-darco", "arco-launch",
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
    // SC2K disaster set (MISC 0070), clean-room from the public save spec.
    riot: { duration: 120 },
    "toxic-spill": { duration: 90, radius: 5 },
    meltdown: { duration: 300, radius: 4 },
    "microwave-spill": { duration: 120, radius: 4 },
    volcano: { duration: 160, radius: 7 },
    firestorm: { duration: 180, radius: 12 },
    "mass-floods": { duration: 80, radius: 9 },
    "pollution-accident": { duration: 100, radius: 5 },
    hurricane: { duration: 140, radius: 10 },
    "air-crash": { duration: 90, radius: 4 },
  });
  // Spec 3.12: some disasters need their cause on the map. High ground is
  // six steps above the plains; a riot needs a block whose crime is twice
  // the level where buildings start to decline.
  const DISASTER_RULES = Object.freeze({ volcanoAlt: 8, riotCrime: 60 });
  // SC2K technology discovery years (MISC 0738-0778); a network or zone is
  // refused until its gate. Facilities already carry `tech`; these are the
  // non-facility unlocks the player drags (highway, onramp, subway) or zones
  // (airport, seaport).
  const TECHS = Object.freeze({
    // Bonsai keeps these networks available from the start (they are its
    // baseline transport), so the gate exists and is exported, but does not
    // silently remove what a player already builds at 1900. Tune the years
    // here if the game should unlock them later.
    airport: 1900,
    highways: 1900,
    buses: 1900,
    subways: 1900,
  });
  // Each working facility kind reports one headline figure in the query
  // dialog; the label key names what the figure is.
  const MICROSIM_KINDS = Object.freeze({
    police: "arrests", fire: "responses", school: "students", clinic: "patients",
    hospital: "patients", university: "students", library: "visitors", museum: "visitors", prison: "arrests",
    zoo: "visitors", stadium: "events", marina: "visitors",
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

  // Example recipes (ruleset 5). Commands are written out so a replay is
  // exactly what a player would have clicked.
  const exampleCommand = (id, type, payload, targetTick = 0) => ({ schemaVersion: 2, type, payload, targetTick, clientCommandId: id });
  const pathCommand = (id, network, points, targetTick = 0) => exampleCommand(id, "build-path", { network, points }, targetTick);
  const zoneCommand = (id, zone, density, x, y, width, height, targetTick = 0) => exampleCommand(id, "zone-area", { zone, density, x, y, width, height }, targetTick);
  const placeCommand = (id, kind, x, y, targetTick = 0) => exampleCommand(id, "place-facility", { kind, x, y }, targetTick);
  // A 7-tile street grid from (x0, y0): road lines every seventh row and
  // column, each column also carrying power and water.
  function streetGrid(prefix, x0, y0, columns, rows, targetTick = 0) {
    const out = []; const x1 = x0 + columns * 7; const y1 = y0 + rows * 7;
    for (let r = 0; r <= rows; r += 1) out.push(pathCommand(`${prefix}-road-h${r}`, "road", [{ x: x0, y: y0 + r * 7 }, { x: x1, y: y0 + r * 7 }], targetTick));
    for (let c = 0; c <= columns; c += 1) out.push(pathCommand(`${prefix}-road-v${c}`, "road", [{ x: x0 + c * 7, y: y0 }, { x: x0 + c * 7, y: y1 }], targetTick));
    for (let c = 0; c <= columns; c += 1) {
      out.push(pathCommand(`${prefix}-wire-v${c}`, "wire", [{ x: x0 + c * 7, y: y0 }, { x: x0 + c * 7, y: y1 }], targetTick));
      out.push(pathCommand(`${prefix}-pipe-v${c}`, "pipe", [{ x: x0 + c * 7, y: y0 }, { x: x0 + c * 7, y: y1 }], targetTick));
    }
    return out;
  }

  // Every building stands on a street (ROAD_REACH 1), so an example's 6x6
  // block has a mid-block street on its fourth row and is zoned only along
  // its streets: a row on the north street, a row on the mid-block street,
  // and the two rows between the mid-block and south streets (where a dense
  // block's 2x2 lots reach both). The row left between is a garden strip.
  function blockZoneCommands(id, zone, density, x, y, targetTick = 0) {
    const strips = [[0, 1], [2, 1], [4, 2]];
    return strips.map(([row, height], index) => zoneCommand(`${id}-${index}`, zone, density, x, y + row, 6, height, targetTick));
  }

  const EXAMPLES = Object.freeze({
    // A healthy small town two and a half years in: a coal plant and water
    // tower, a street grid carrying power and water, homes, shops and
    // factories, and police, fire, a school and a park on the civic corner.
    "starter-town": freezeRecipe({
      id: "starter-town", name: "Starter Town", seed: 6101, size: 64, terrainPreset: "balanced", targetTick: 3750,
      commandLog: [
        placeCommand("starter-coal", "coal", 9, 17),
        placeCommand("starter-water", "water-tower", 14, 19),
        ...streetGrid("starter", 14, 21, 3, 2),
        pathCommand("starter-mid-1", "road", [{ x: 14, y: 25 }, { x: 35, y: 25 }]),
        pathCommand("starter-mid-2", "road", [{ x: 21, y: 32 }, { x: 35, y: 32 }]),
        pathCommand("starter-wire-plant", "wire", [{ x: 13, y: 20 }, { x: 14, y: 20 }, { x: 14, y: 21 }]),
        pathCommand("starter-pipe-tower", "pipe", [{ x: 15, y: 19 }, { x: 15, y: 20 }, { x: 14, y: 20 }]),
        ...blockZoneCommands("starter-r1", "residential", "high", 15, 22),
        ...blockZoneCommands("starter-c", "commercial", "high", 22, 22),
        ...blockZoneCommands("starter-i", "industrial", "low", 29, 22),
        ...blockZoneCommands("starter-r2", "residential", "low", 22, 29),
        ...blockZoneCommands("starter-r3", "residential", "high", 29, 29),
        placeCommand("starter-police", "police", 15, 29),
        placeCommand("starter-fire", "fire", 16, 29),
        placeCommand("starter-school", "school", 17, 29),
        placeCommand("starter-park", "park-big", 17, 31),
      ],
    }),
    // A town that grew and then was neglected: a neighbourhood on a road
    // that reaches no jobs, a dense block no pipe reaches, police funding cut
    // to nothing and taxes at 20% in its third year, and a few plots zoned in
    // its last days so construction shows.
    "troubled-mid-size": freezeRecipe({
      id: "troubled-mid-size", name: "Troubled Mid-size", seed: 6202, size: 64, terrainPreset: "balanced", targetTick: 4500,
      commandLog: [
        placeCommand("troubled-coal", "coal", 41, 0),
        placeCommand("troubled-water", "water-tower", 40, 5),
        ...streetGrid("troubled", 16, 6, 4, 1),
        pathCommand("troubled-mid", "road", [{ x: 16, y: 10 }, { x: 44, y: 10 }]),
        pathCommand("troubled-north-street", "road", [{ x: 16, y: 6 }, { x: 16, y: 2 }, { x: 30, y: 2 }]),
        pathCommand("troubled-wire-plant", "wire", [{ x: 41, y: 4 }, { x: 41, y: 5 }, { x: 44, y: 5 }, { x: 44, y: 6 }]),
        pathCommand("troubled-pipe-tower", "pipe", [{ x: 40, y: 6 }, { x: 44, y: 6 }]),
        ...blockZoneCommands("troubled-r1", "residential", "high", 17, 7),
        ...blockZoneCommands("troubled-c1", "commercial", "high", 24, 7),
        ...blockZoneCommands("troubled-r2", "residential", "high", 31, 7),
        ...blockZoneCommands("troubled-i1", "industrial", "high", 38, 7),
        // The north strip fronts the grid on its south side and a street
        // on its north side; its middle row is a garden strip.
        zoneCommand("troubled-r-north-a", "residential", "low", 17, 3, 12, 1),
        zoneCommand("troubled-r-north-b", "residential", "low", 17, 5, 12, 1),
        placeCommand("troubled-police", "police", 30, 4),
        placeCommand("troubled-fire", "fire", 31, 4),
        pathCommand("troubled-rail", "rail", [{ x: 17, y: 14 }, { x: 44, y: 14 }]),
        placeCommand("troubled-station", "station", 45, 13),
        // A second neighbourhood whose road never joins the town.
        pathCommand("troubled-island-road", "road", [{ x: 34, y: 34 }, { x: 44, y: 34 }], 750),
        pathCommand("troubled-island-wire", "wire", [{ x: 45, y: 7 }, { x: 47, y: 7 }, { x: 47, y: 35 }, { x: 44, y: 35 }], 750),
        zoneCommand("troubled-island-r", "residential", "low", 34, 35, 10, 1, 750),
        // A dense block past the end of the pipes.
        pathCommand("troubled-dry-road", "road", [{ x: 44, y: 6 }, { x: 48, y: 6 }], 1500),
        zoneCommand("troubled-dry-r", "residential", "high", 45, 7, 2, 4, 1500),
        exampleCommand("troubled-police-cut", "set-policy", { policy: "funding", service: "police", level: 0 }, 3750),
        exampleCommand("troubled-tax", "set-policy", { policy: "tax-rate", taxRate: 20 }, 3750),
        zoneCommand("troubled-late-r", "residential", "high", 17, 0, 6, 2, 4375),
        zoneCommand("troubled-late-c", "commercial", "high", 24, 0, 6, 2, 4375),
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
      police: 0, fire: 0, health: 0, schools: 0, colleges: 0, recreation: 0, bondInterest: 0, expense: 0 };
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
      // v5: lot anchor + 1 on every cell of a lot (0 = no lot).
      lot: new Uint16Array(count),
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
      // On wide plains many places score the same: the one nearest the
      // middle of the map wins, so a new city does not start in a corner.
      const middle = state.size / 2;
      const ranked = score * 1000 - (Math.abs(x - middle) + Math.abs(y - middle));
      if (ranked > best.score) best = { x, y, score: ranked };
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
        ? Math.max(0, 16 - Math.abs(x + y - state.size) * 32 / state.size) + (smoothNoise(x, y, 1 / 16, state.seed + 323) - 0.5) * 4 : 0;
      // SC2K ground (3.9): a wide base plain at altitude 2 with a few
      // terraces one to three steps up, so most land is buildable as it
      // lies. The mountain preset stacks its ridge in steps of two, which
      // keeps broad benches between the climbs.
      const plateau = smoothNoise(x, y, 1 / 22, state.seed + 303) * 0.7 + smoothNoise(x, y, 1 / 9, state.seed + 313) * 0.3;
      const terrace = state.terrainPreset === "mountain" ? 0 : plateau > 0.8 ? 3 : plateau > 0.72 ? 2 : plateau > 0.64 ? 1 : 0;
      state.alt[i] = wet ? 0 : Math.min(MAX_ALT - 1, 2 + terrace + Math.floor(Math.max(0, ridge) / 3) * 2);
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
    for (const key of ["over", "powered", "watered", "roadOk", "portOk", "railConnected", "railOk", "subwayConnected", "congested", "policeCovered", "fireCovered",
      "educationCovered", "healthCovered", "civicBonus", "landValue", "pollution", "crime", "fireRisk", "happiness", "problemCode", "lastProblemCode",
      "policeStrength", "fireStrength", "accessDist", "waterDist", "parkNear", "busRelief", "routeKind"]) state[key] = new Uint8Array(count);
    state.traffic = new Uint16Array(count);
    for (const key of ["facilityAt", "plantAt", "serviceAt"]) { state[key] = new Int16Array(count); state[key].fill(-1); }
    for (const key of ["buildingId", "buildingAnchor", "accessRoad"]) { state[key] = new Int32Array(count); state[key].fill(-1); }
    // Distance fields cover three node layers: roads, rail, subway.
    state.distJobs = new Uint16Array(count * 3); state.distJobs.fill(ROUTE_UNREACHED);
    state.distHomes = new Uint16Array(count * 3); state.distHomes.fill(ROUTE_UNREACHED);
    state.routeSources = { jobs: 0, homes: 0 };
    state.cityCenter = { x: Math.floor(state.size / 2), y: Math.floor(state.size / 2) };
    state.lotCounts = { total: 0, r: 0, c: 0, i: 0, working: 0, big: 0 };
    state.dirty = DIRTY_ALL;
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
      facilities: [], buildings: [], population: 0, jobs: 0, cJobs: 0, iJobs: 0, demand: { r: 25, c: 0, i: 70 }, economyIndex: 0,
      railService: { stations: 0, connectedStations: 0, connectedRailTiles: 0, passengerCapacity: 0, freightCapacity: 0, roadTrafficRelief: 0, jobs: 0, riders: 0 },
      subwayService: { stations: 0, connectedStations: 0, connectedSubwayTiles: 0, passengerCapacity: 0, roadTrafficRelief: 0, jobs: 0, riders: 0 },
      busService: { depots: 0, capacity: 0, roadTrafficRelief: 0, jobs: 0 },
      highwayService: { onramps: 0, connectedHighwayTiles: 0, roadTrafficRelief: 0 },
      things: [],
      funding: Object.fromEntries(FUNDING_SERVICES.map((service) => [service, 100])),
      budget: makeEmptyBudget(),
      // The mayor's camera and the month-by-month funding history are saved
      // city state (SC2K MISC 1014-101C and the budget service history). v4
      // carries them so a reopened city returns to its view and budget books.
      view: { panX: 0, panY: 0, zoom: 0.82 },
      budgetHistory: [],
      militaryBase: 0, // 0 none, 1 offered, 2 refused, 3 army, 4 air, 5 navy, 6 missile
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
    const road = state.road; const wire = state.wire; const park = state.park; const over = state.over;
    for (let i = 0, n = tileCount(state); i < n; i += 1) {
      over[i] = road[i] && wire[i] ? OVER_ROADWIRE : road[i] ? OVER_ROAD : wire[i] ? OVER_WIRE : park[i] ? OVER_PARK : OVER_NONE;
    }
    state.plants = state.facilities.filter((item) => PLANT_KINDS[item.kind]).map((item) => ({ kind: item.kind, x: item.x, y: item.y }));
    state.services = state.facilities.filter((item) => SERVICE_KINDS[item.kind]).map((item) => ({ kind: item.kind, x: item.x, y: item.y }));
  }
  // Structural edits (and anything that cannot say what it touched) mark
  // every derived system except the monthly environment.
  function markDerivedDirty(state, flags = DIRTY_STRUCTURE) { state.dirty |= flags; syncCompatibility(state); }

  function rebuildFacilityLayers(state) {
    state.facilityAt.fill(-1); state.plantAt.fill(-1); state.serviceAt.fill(-1);
    state.facilities.forEach((facility, id) => {
      const spec = footprintOf(facility);
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

  // Distance to the nearest water tile, capped at 4; recomputed only when
  // the terrain changes. Land value reads it every month.
  function recomputeWaterDistance(state) {
    const size = state.size; const n = size * size; const water = state.water; const dist = state.waterDist;
    dist.fill(255); const queue = new Int32Array(n); let tail = 0;
    for (let i = 0; i < n; i += 1) if (water[i]) { dist[i] = 0; queue[tail++] = i; }
    for (let head = 0; head < tail; head += 1) {
      const i = queue[head]; const d = dist[i]; if (d >= 4) continue;
      const x = i % size;
      if (x > 0 && dist[i - 1] === 255) { dist[i - 1] = d + 1; queue[tail++] = i - 1; }
      if (x < size - 1 && dist[i + 1] === 255) { dist[i + 1] = d + 1; queue[tail++] = i + 1; }
      if (i >= size && dist[i - size] === 255) { dist[i - size] = d + 1; queue[tail++] = i - size; }
      if (i + size < n && dist[i + size] === 255) { dist[i + size] = d + 1; queue[tail++] = i + size; }
    }
  }

  function recomputeRailService(state) {
    state.railConnected.fill(0); state.railOk.fill(0); state.subwayConnected.fill(0);
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
      riders: state.railService ? state.railService.riders || 0 : 0,
    };

    // Subway service: a station connects when it touches both a road and the
    // underground network; connected stations flood the subway layer.
    const subwayStations = state.facilities.filter((facility) => facility.kind === "subway-station");
    const subwaySeen = state.subwayConnected;
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
      roadTrafficRelief: 0,
      jobs: connectedSubwayStations * 8,
      riders: state.subwayService ? state.subwayService.riders || 0 : 0,
    };

    // A bus depot serves when it touches a road; each serving depot takes a
    // quarter of the car trips off the roads within eight tiles (at most
    // half, with two or more depots in reach).
    const depots = state.facilities.filter((facility) => facility.kind === "bus");
    const relief = state.busRelief; relief.fill(0);
    let servingDepots = 0;
    for (const depot of depots) {
      let serving = false;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        if (inBounds(state, depot.x + dx, depot.y + dy) && state.road[indexOf(state, depot.x + dx, depot.y + dy)]) { serving = true; break; }
      }
      if (!serving) continue;
      servingDepots += 1;
      for (let y = Math.max(0, depot.y - 8); y <= Math.min(state.size - 1, depot.y + 8); y += 1) {
        for (let x = Math.max(0, depot.x - 8); x <= Math.min(state.size - 1, depot.x + 8); x += 1) {
          const i = indexOf(state, x, y); if (relief[i] < 2) relief[i] += 1;
        }
      }
    }
    state.busService = {
      depots: depots.length,
      capacity: servingDepots * 40,
      roadTrafficRelief: servingDepots ? 25 : 0,
      jobs: servingDepots * 5,
    };

    // Highways carry traffic only where onramps join them to the road
    // network: flood the highway layer from every onramp that touches both
    // a road and a highway.
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
    // A highway needs an entrance and an exit before it carries anyone;
    // roadTrafficRelief counts the commuter trips it took off the roads at
    // the last routing pass.
    state.highwayService = {
      onramps: connectedOnramps,
      connectedHighwayTiles: highwayQueue.length,
      inService: connectedOnramps >= 2,
      roadTrafficRelief: state.highwayService ? state.highwayService.roadTrafficRelief || 0 : 0,
    };
  }

  // Road access: a four-way breadth-first search out of every street tile
  // (road, bridge, onramp), PORT_REACH steps deep. A highway is no way in to
  // a building, as in SC2K: traffic reaches it from the streets through an
  // onramp. accessRoad names the nearest street tile within ROAD_REACH (the
  // lot rule); -1 means none. portOk marks tiles within PORT_REACH.
  function recomputeAccess(state) {
    const size = state.size; const n = size * size;
    const road = state.road; const onramp = state.onramp;
    const access = state.accessRoad; const dist = state.accessDist; const roadOk = state.roadOk;
    access.fill(-1); dist.fill(255);
    const queue = new Int32Array(n); let tail = 0;
    for (let i = 0; i < n; i += 1) if (road[i] || onramp[i]) { access[i] = i; dist[i] = 0; queue[tail++] = i; }
    for (let head = 0; head < tail; head += 1) {
      const i = queue[head]; const d = dist[i]; if (d >= PORT_REACH) continue;
      const x = i % size; const from = access[i];
      if (x > 0 && dist[i - 1] === 255) { dist[i - 1] = d + 1; access[i - 1] = from; queue[tail++] = i - 1; }
      if (x < size - 1 && dist[i + 1] === 255) { dist[i + 1] = d + 1; access[i + 1] = from; queue[tail++] = i + 1; }
      if (i >= size && dist[i - size] === 255) { dist[i - size] = d + 1; access[i - size] = from; queue[tail++] = i - size; }
      if (i + size < n && dist[i + size] === 255) { dist[i + size] = d + 1; access[i + size] = from; queue[tail++] = i + size; }
    }
    const portOk = state.portOk;
    for (let i = 0; i < n; i += 1) {
      portOk[i] = access[i] >= 0 ? 1 : 0;
      if (dist[i] > ROAD_REACH) { access[i] = -1; dist[i] = 255; }
      roadOk[i] = access[i] >= 0 ? 1 : 0;
    }
  }

  // --- Commuting -------------------------------------------------------------
  // The commute graph has three node layers over the map: roads (with train
  // and subway stations as connectors), rail, and subway. Roads join onramps,
  // onramps join highways; a train station joins road and rail, a subway
  // station joins road and subway. Only rail and subway reached from a
  // working station carry anyone.
  const RK_ROAD = 1; const RK_HIGHWAY = 2; const RK_ONRAMP = 3; const RK_STATION = 4; const RK_SUBWAY_STATION = 5;
  function routeLinks(a, b) {
    if (a === RK_ROAD) return b === RK_ROAD || b === RK_ONRAMP || b === RK_STATION || b === RK_SUBWAY_STATION;
    if (a === RK_ONRAMP) return b === RK_ROAD || b === RK_ONRAMP || b === RK_HIGHWAY;
    if (a === RK_HIGHWAY) return b === RK_HIGHWAY || b === RK_ONRAMP;
    if (a === RK_STATION) return b === RK_ROAD || b === RK_STATION;
    if (a === RK_SUBWAY_STATION) return b === RK_ROAD;
    return false;
  }
  function routeGraph(state) {
    return { size: state.size, n: state.size * state.size, kinds: state.routeKind, rail: state.railConnected,
      subway: state.subwayConnected, congested: state.congested, out: new Int32Array(8) };
  }
  function routeNeighbors(graph, node) {
    const { size, n, kinds, rail, subway, out } = graph;
    const layer = node < n ? 0 : node < 2 * n ? 1 : 2; const i = node - layer * n; const x = i % size;
    let k = 0;
    for (let d = 0; d < 4; d += 1) {
      let ni;
      if (d === 0) { if (i < size) continue; ni = i - size; }
      else if (d === 1) { if (x === size - 1) continue; ni = i + 1; }
      else if (d === 2) { if (i + size >= n) continue; ni = i + size; }
      else { if (x === 0) continue; ni = i - 1; }
      if (layer === 0) {
        const a = kinds[i]; const b = kinds[ni];
        if (b && routeLinks(a, b)) out[k++] = ni;
        if (a === RK_STATION && rail[ni]) out[k++] = n + ni;
        if (a === RK_SUBWAY_STATION && subway[ni]) out[k++] = 2 * n + ni;
      } else if (layer === 1) {
        if (rail[ni]) out[k++] = n + ni;
        if (kinds[ni] === RK_STATION) out[k++] = ni;
      } else {
        if (subway[ni]) out[k++] = 2 * n + ni;
        if (kinds[ni] === RK_SUBWAY_STATION) out[k++] = ni;
      }
    }
    if (layer === 0 && kinds[i] === RK_SUBWAY_STATION && subway[i]) out[k++] = 2 * n + i;
    if (layer === 2 && kinds[i] === RK_SUBWAY_STATION) out[k++] = i;
    return k;
  }
  function routeCost(graph, node) {
    const n = graph.n;
    if (node >= n) return node >= 2 * n ? ROUTE_COST.subway : ROUTE_COST.rail;
    const kind = graph.kinds[node];
    if (kind === RK_ROAD) return graph.congested[node] ? ROUTE_COST.congested : ROUTE_COST.road;
    if (kind === RK_HIGHWAY) return ROUTE_COST.highway;
    if (kind === RK_ONRAMP) return ROUTE_COST.onramp;
    return ROUTE_COST.station;
  }
  // Dial's bucket-queue Dijkstra from every source node at distance 0.
  function routeField(graph, dist, sources) {
    dist.fill(ROUTE_UNREACHED);
    const buckets = [];
    for (const node of sources) if (dist[node] !== 0) { dist[node] = 0; (buckets[0] ||= []).push(node); }
    for (let d = 0; d < buckets.length; d += 1) {
      const list = buckets[d]; if (!list) continue; buckets[d] = null;
      for (let q = 0; q < list.length; q += 1) {
        const node = list[q]; if (dist[node] !== d) continue;
        const count = routeNeighbors(graph, node);
        for (let k = 0; k < count; k += 1) {
          const next = graph.out[k]; const nd = d + routeCost(graph, next);
          if (nd < dist[next] && nd <= ROUTE_MAX) { dist[next] = nd; (buckets[nd] ||= []).push(next); }
        }
      }
    }
  }
  const lotOccupied = (buildingState) => buildingState === BUILDING_ACTIVE || buildingState === BUILDING_RECOVERING || buildingState === BUILDING_DECLINING;
  function commuteOk(state, zone, access) {
    if (access < 0) return false;
    if (zone === ZONE_R) return !state.routeSources.jobs || state.distJobs[access] <= COMMUTE_LIMIT;
    return !state.routeSources.homes || state.distHomes[access] <= COMMUTE_LIMIT;
  }
  // Two distance fields (to working C/I lots, to working homes) and the
  // commuter flow: every occupied home lot sends residents/20 trips down the
  // job field's gradient; each road tile counts the trips that cross it.
  function recomputeRoutes(state) {
    const size = state.size; const n = size * size; const kinds = state.routeKind;
    const road = state.road; const highway = state.highway; const onramp = state.onramp;
    kinds.fill(0);
    for (let i = 0; i < n; i += 1) kinds[i] = road[i] ? RK_ROAD : onramp[i] ? RK_ONRAMP : highway[i] ? RK_HIGHWAY : 0;
    for (const facility of state.facilities) {
      const kind = facility.kind === "station" ? RK_STATION : facility.kind === "subway-station" ? RK_SUBWAY_STATION : 0;
      if (!kind) continue;
      const fp = footprintOf(facility);
      for (let dy = 0; dy < fp.h; dy += 1) for (let dx = 0; dx < fp.w; dx += 1) {
        if (inBounds(state, facility.x + dx, facility.y + dy)) kinds[indexOf(state, facility.x + dx, facility.y + dy)] = kind;
      }
    }
    const jobs = []; const homes = [];
    for (const building of state.buildings) {
      if (!lotOccupied(building.state) || building.access < 0) continue;
      if (building.zone === ZONE_R) homes.push(building.access); else jobs.push(building.access);
    }
    state.routeSources = { jobs: jobs.length, homes: homes.length };
    const graph = routeGraph(state);
    routeField(graph, state.distJobs, jobs);
    routeField(graph, state.distHomes, homes);
    const traffic = state.traffic; const congested = state.congested; const dist = state.distJobs;
    traffic.fill(0); congested.fill(0);
    let railRiders = 0; let subwayRiders = 0; let highwayTrips = 0;
    if (jobs.length) for (const building of state.buildings) {
      if (building.zone !== ZONE_R || !lotOccupied(building.state) || building.access < 0 || building.population <= 0) continue;
      let node = building.access; if (dist[node] >= ROUTE_UNREACHED) continue;
      const trips = Math.max(1, Math.round(building.population * TRIPS_PER_RESIDENT));
      let usedHighway = false; let usedRail = false; let usedSubway = false;
      for (let guard = 0; guard < 4096; guard += 1) {
        if (node < n) {
          const kind = kinds[node];
          if (kind !== RK_STATION && kind !== RK_SUBWAY_STATION) traffic[node] = Math.min(65535, traffic[node] + trips);
          if (kind === RK_HIGHWAY) usedHighway = true;
        } else if (node < 2 * n) usedRail = true; else usedSubway = true;
        const here = dist[node]; if (!here) break;
        const count = routeNeighbors(graph, node); let best = -1; let bestDist = here;
        for (let k = 0; k < count; k += 1) { const next = graph.out[k]; if (dist[next] < bestDist) { bestDist = dist[next]; best = next; } }
        if (best < 0) break; node = best;
      }
      if (usedHighway) highwayTrips += trips;
      if (usedRail) railRiders += trips;
      if (usedSubway) subwayRiders += trips;
    }
    const relief = state.busRelief;
    for (let i = 0; i < n; i += 1) {
      if (!traffic[i]) continue;
      if (relief[i]) traffic[i] = Math.floor(traffic[i] * (1 - 0.25 * Math.min(2, relief[i])));
      const capacity = kinds[i] === RK_HIGHWAY ? HIGHWAY_CAPACITY : CONGESTION_THRESHOLD;
      if (traffic[i] > capacity) congested[i] = 1;
    }
    state.railService = { ...state.railService, riders: railRiders, roadTrafficRelief: railRiders };
    state.subwayService = { ...state.subwayService, riders: subwayRiders, roadTrafficRelief: subwayRiders };
    state.highwayService = { ...state.highwayService, roadTrafficRelief: highwayTrips };
  }

  function recomputeUtility(state, kind) {
    const network = kind === "power" ? state.wire : state.pipe; const target = kind === "power" ? state.powered : state.watered;
    target.fill(0); const queue = []; const seen = new Uint8Array(tileCount(state)); let capacity = 0;
    const desalinated = state.facilities.some((item) => FACILITY_KINDS[item.kind].desalinates);
    state.facilities.forEach((facility) => {
      const spec = FACILITY_KINDS[facility.kind]; let amount = kind === "power" ? (spec.power || 0) : (spec.water || 0); if (!amount) return;
      if (kind === "water" && spec.perShore) {
        // A pump draws from each fresh-water tile it touches; salt water
        // counts only once the city runs a desalination plant.
        let shores = 0;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          if (!inBounds(state, facility.x + dx, facility.y + dy)) continue;
          const ni = indexOf(state, facility.x + dx, facility.y + dy);
          if (state.water[ni] && (!state.salt[ni] || desalinated)) shores += 1;
        }
        amount *= shores;
      }
      if (!amount) return;
      capacity += (amount + (facility.kind === "wind" ? state.alt[indexOf(state, facility.x, facility.y)] * 2 : 0)) * (kind === "power" ? POWER_UNITS_PER_MW : 1);
      const footprint = footprintOf(facility);
      for (let dy = 0; dy < footprint.h; dy += 1) for (let dx = 0; dx < footprint.w; dx += 1) {
        const i = indexOf(state, facility.x + dx, facility.y + dy); if (!seen[i]) { seen[i] = 1; queue.push(i); }
      }
    });
    // Conservation ordinances stretch the same supply further; the boost
    // lands before allocation so the meter and the served tiles agree.
    if (kind === "power" && ordinanceOn(state, "energyConservation")) capacity = Math.floor(capacity * 10 / 9);
    if (kind === "water" && ordinanceOn(state, "waterConservation")) capacity = Math.floor(capacity * 10 / 9);
    const zone = state.zone; const density = state.density; const facilityAt = state.facilityAt; const size = state.size;
    const conducts = (i) => !!network[i] || zone[i] !== ZONE_NONE || facilityAt[i] >= 0; const reached = [];
    for (let head = 0; head < queue.length; head += 1) {
      const i = queue[head]; reached.push(i); const x = i % size; const y = (i - x) / size;
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (!inBounds(state, nx, ny)) continue; const ni = ny * size + nx;
        if (!seen[ni] && conducts(ni)) { seen[ni] = 1; queue.push(ni); }
      }
    }
    // The grid is handed out against what each zoned tile will draw once
    // its lot stands (one unit a tile, light or dense), whether or not it has
    // grown yet. A saturated grid therefore refuses new blocks up front
    // instead of starting lots it cannot carry, and a lot changing state
    // never reshuffles who is lit. The meter reports the same figure it
    // allocates, so "supply 90 / demand 120" and the dark plots agree.
    const need = (i) => (zone[i] ? 1 : 0);
    let demand = 0; for (const i of reached) demand += need(i);
    let served = 0;
    for (const i of reached) {
      const amount = need(i);
      if (served + amount <= capacity) { target[i] = 1; served += amount; }
    }
    if (kind === "power") { state.powerCapacity = capacity; state.powerDemand = demand; state.brownout = demand > capacity; }
    else { state.waterCapacity = capacity; state.waterDemand = demand; state.waterShortage = demand > capacity; }
  }

  // Service reach and civic land-value bonuses, recomputed when a facility
  // or a funding level changes. Police and fire strength fade linearly to
  // nothing at the station's radius and scale with funding.
  function recomputeCoverage(state) {
    const size = state.size;
    for (const key of ["policeStrength", "fireStrength", "policeCovered", "fireCovered", "educationCovered", "healthCovered", "civicBonus", "parkNear"]) state[key].fill(0);
    const police = state.policeStrength; const fire = state.fireStrength;
    const stamp = (target, facility, radius, funding) => {
      const fp = footprintOf(facility); const cx = facility.x + (fp.w - 1) / 2; const cy = facility.y + (fp.h - 1) / 2;
      const r = Math.max(0, radius);
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(size - 1, Math.ceil(cy + r)); y += 1) {
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size - 1, Math.ceil(cx + r)); x += 1) {
          const d = Math.hypot(x - cx, y - cy); if (d > r) continue;
          const strength = Math.round(100 * funding * Math.max(0, 1 - d / (r + 1)));
          const i = y * size + x; if (strength > target[i]) target[i] = strength;
        }
      }
    };
    const paintNear = (target, facility, reach) => {
      const fp = footprintOf(facility);
      for (let y = Math.max(0, facility.y - reach); y <= Math.min(size - 1, facility.y + fp.h - 1 + reach); y += 1) {
        for (let x = Math.max(0, facility.x - reach); x <= Math.min(size - 1, facility.x + fp.w - 1 + reach); x += 1) target[y * size + x] = 1;
      }
    };
    for (const facility of state.facilities) {
      const spec = FACILITY_KINDS[facility.kind]; if (!spec) continue;
      const funding = spec.group && state.funding[spec.group] != null ? state.funding[spec.group] / 100 : 1;
      if (facility.kind === "police") stamp(police, facility, spec.radius, funding);
      else if (facility.kind === "fire") stamp(fire, facility, spec.radius, funding);
      else if (facility.kind === "school" || facility.kind === "library" || facility.kind === "university" || facility.kind === "museum") {
        const fp = footprintOf(facility); paintReach(state, state.educationCovered, facility.x + (fp.w >> 1), facility.y + (fp.h >> 1), Math.round(spec.radius * funding));
      } else if (facility.kind === "clinic" || facility.kind === "hospital") {
        const fp = footprintOf(facility); paintReach(state, state.healthCovered, facility.x + (fp.w >> 1), facility.y + (fp.h >> 1), Math.round(spec.radius * funding));
      }
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
      if (spec.park) paintNear(state.parkNear, facility, 2);
    }
    for (let i = 0, n = size * size; i < n; i += 1) {
      state.policeCovered[i] = police[i] > 0 ? 1 : 0; state.fireCovered[i] = fire[i] > 0 ? 1 : 0;
      if (!state.park[i]) continue;
      const x = i % size; const y = (i - x) / size;
      for (let yy = Math.max(0, y - 2); yy <= Math.min(size - 1, y + 2); yy += 1) for (let xx = Math.max(0, x - 2); xx <= Math.min(size - 1, x + 2); xx += 1) state.parkNear[yy * size + xx] = 1;
    }
  }

  // The sum of `values` over the (2r+1)-square around every cell, clipped at
  // the map edge: two one-dimensional running sums instead of a nested loop.
  function boxSum(size, values, r) {
    const n = size * size; const rows = new Float32Array(n); const out = new Float32Array(n);
    for (let y = 0; y < size; y += 1) {
      const base = y * size; let acc = 0;
      for (let x = 0; x <= Math.min(size - 1, r); x += 1) acc += values[base + x];
      for (let x = 0; x < size; x += 1) {
        rows[base + x] = acc;
        const add = x + r + 1; const drop = x - r;
        if (add < size) acc += values[base + add];
        if (drop >= 0) acc -= values[base + drop];
      }
    }
    for (let x = 0; x < size; x += 1) {
      let acc = 0;
      for (let y = 0; y <= Math.min(size - 1, r); y += 1) acc += rows[y * size + x];
      for (let y = 0; y < size; y += 1) {
        out[y * size + x] = acc;
        const add = y + r + 1; const drop = y - r;
        if (add < size) acc += rows[add * size + x];
        if (drop >= 0) acc -= rows[drop * size + x];
      }
    }
    return out;
  }

  // Residents (R) or jobs (C, I) per cell of each occupied lot.
  function lotDensityLayer(state) {
    const size = state.size; const out = new Float32Array(size * size);
    for (const building of state.buildings) {
      const load = building.zone === ZONE_R ? building.population : building.jobs; if (!load) continue;
      const perCell = load / (building.w * building.h);
      for (let dy = 0; dy < building.h; dy += 1) for (let dx = 0; dx < building.w; dx += 1) out[(building.y + dy) * size + building.x + dx] = perCell;
    }
    return out;
  }

  // The monthly environment (3.4): pollution spreads from industry, plants,
  // traffic and ports; land value rewards height, water, trees, parks,
  // services and (for shops) the town centre; crime follows density, cheap
  // land and unemployment, pushed back by police. Order matters: pollution,
  // then land value (reading last month's crime), then crime.
  function recomputeEnvironment(state) {
    const size = state.size; const n = size * size;
    const zone = state.zone; const density = state.density; const lot = state.lot; const buildingState = state.buildingState;
    const water = state.water; const alt = state.alt; const tree = state.tree; const park = state.park;
    const pollution = state.pollution; const landValue = state.landValue; const crime = state.crime;
    const traffic = state.traffic; const kinds = state.routeKind; const accessRoad = state.accessRoad; const congested = state.congested;
    // Pollution sources.
    let field = new Float32Array(n);
    const industry = ordinanceOn(state, "pollutionControls") ? 0.7 : 1;
    for (let i = 0; i < n; i += 1) {
      const z = zone[i];
      if (z === ZONE_I && lot[i] && lotOccupied(buildingState[i])) field[i] += (density[i] === DENSITY_HIGH ? 35 : 20) * industry;
      else if (z === ZONE_SEAPORT || z === ZONE_AIRPORT) field[i] += 15;
      if (traffic[i] && kinds[i]) field[i] += Math.min(60, traffic[i] / 4);
    }
    for (const facility of state.facilities) {
      const spec = FACILITY_KINDS[facility.kind]; if (!spec || !spec.pollution) continue;
      const fp = footprintOf(facility);
      for (let dy = 0; dy < fp.h; dy += 1) for (let dx = 0; dx < fp.w; dx += 1) if (inBounds(state, facility.x + dx, facility.y + dy)) field[indexOf(state, facility.x + dx, facility.y + dy)] += spec.pollution;
    }
    for (let pass = 0; pass < 2; pass += 1) {
      const next = new Float32Array(n);
      for (let i = 0; i < n; i += 1) {
        const x = i % size;
        const sum = field[i] + (x > 0 ? field[i - 1] : 0) + (x < size - 1 ? field[i + 1] : 0) + (i >= size ? field[i - size] : 0) + (i + size < n ? field[i + size] : 0);
        next[i] = 0.9 * sum / 5;
      }
      field = next;
    }
    for (let i = 0; i < n; i += 1) {
      let value = field[i];
      const facility = state.facilityAt[i] >= 0 ? state.facilities[state.facilityAt[i]] : null;
      if (tree[i] || park[i] || (facility && FACILITY_KINDS[facility.kind]?.park)) value -= 10;
      pollution[i] = water[i] ? 0 : Math.max(0, Math.min(255, Math.round(value)));
    }
    // Land value.
    const lotDensity = lotDensityLayer(state);
    const center = state.cityCenter;
    const waterDist = state.waterDist; const parkNear = state.parkNear; const civic = state.civicBonus;
    const raw = new Float32Array(n);
    const trees5 = boxSum(size, tree, 2);
    for (let i = 0; i < n; i += 1) {
      if (water[i]) continue;
      const x = i % size; const y = (i - x) / size;
      const trees = trees5[i];
      const wd = waterDist[i];
      let value = 40 + Math.min(20, 2 * alt[i]) + (wd === 1 ? 25 : wd === 2 ? 18 : wd === 3 ? 10 : 0) + Math.min(10, 2 * trees)
        + (parkNear[i] ? 15 : 0) + civic[i]
        + (state.policeCovered[i] ? 5 : 0) + (state.fireCovered[i] ? 5 : 0) + (state.educationCovered[i] ? 5 : 0) + (state.healthCovered[i] ? 5 : 0)
        - pollution[i] / 2 - crime[i] / 3;
      if (zone[i] === ZONE_C) { const dx = x - center.x; const dy = y - center.y; value += Math.max(0, 20 - Math.sqrt(dx * dx + dy * dy) / 3); }
      if (zone[i] === ZONE_R && accessRoad[i] >= 0 && congested[accessRoad[i]]) value -= 10;
      raw[i] = value;
    }
    // 3x3 smoothing over land only: the mean of the dry neighbours.
    const land = new Float32Array(n);
    for (let i = 0; i < n; i += 1) land[i] = water[i] ? 0 : 1;
    const sums = boxSum(size, raw, 1); const counts = boxSum(size, land, 1);
    for (let i = 0; i < n; i += 1) {
      landValue[i] = water[i] ? 0 : Math.max(0, Math.min(255, Math.round(sums[i] / counts[i])));
    }
    state.towerLine = null;
    // Crime.
    const workforce = Math.max(1, Math.floor(state.population * state.workforcePercent / 100));
    const unemploymentRate = Math.min(1, state.unemployed / workforce);
    const crimeShift = (ordinanceOn(state, "legalizedGambling") ? 5 : 0)
      - (ordinanceOn(state, "antiDrug") ? 8 : 0) - (ordinanceOn(state, "neighborhoodWatch") ? 6 : 0);
    let prisonCapacity = 0;
    for (const facility of state.facilities) if (facility.kind === "prison") prisonCapacity += FACILITY_KINDS.prison.capacity * state.funding.police / 100;
    const inmates = Math.max(1, state.population / 40);
    const prisonRelief = prisonCapacity ? Math.min(30, 30 * prisonCapacity / inmates) : 0;
    const police = state.policeStrength;
    for (let i = 0; i < n; i += 1) {
      const z = zone[i];
      if (z < ZONE_R || z > ZONE_I) { crime[i] = 0; continue; }
      const value = lotDensity[i] / 8 + (255 - landValue[i]) / 6 + unemploymentRate * 40 - police[i] + crimeShift - prisonRelief;
      crime[i] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }

  // Fire risk and happiness follow from the environment, coverage and lots;
  // cheap, so they refresh whenever any of those changes.
  function recomputeWellbeing(state) {
    const n = tileCount(state); const lotDensity = lotDensityLayer(state);
    const happinessShift = (ordinanceOn(state, "annualCarnival") ? 2 : 0) + (ordinanceOn(state, "juniorSports") ? 2 : 0);
    let recreation = 0;
    for (const facility of state.facilities) recreation += FACILITY_KINDS[facility.kind]?.happiness || 0;
    recreation = Math.min(8, recreation);
    const pollution = state.pollution; const crime = state.crime; const landValue = state.landValue;
    const fireRisk = state.fireRisk; const happiness = state.happiness; const fireCovered = state.fireStrength;
    const taxPenalty = Math.max(0, state.taxRate - DEFAULT_TAX) * 3;
    for (let i = 0; i < n; i += 1) {
      const activity = Math.min(24, Math.floor(lotDensity[i] / 5));
      fireRisk[i] = Math.max(0, Math.min(255, 8 + activity + Math.floor(pollution[i] / 5) - Math.floor(fireCovered[i] * 0.3)));
      happiness[i] = Math.max(0, Math.min(100, 58 + happinessShift + recreation + Math.floor(landValue[i] / 8) - Math.floor(crime[i] / 6)
        - Math.floor(fireRisk[i] / 8) - Math.floor(pollution[i] / 7) - taxPenalty));
    }
  }

  // --- Lots --------------------------------------------------------------------
  function lotTier(variant) { return variant ? Math.max(1, Math.min(3, 1 + Math.floor((variant - 1) / LOT_VARIANTS_PER_TIER))) : 2; }
  function lotCapacity(zone, size, variant, buildingState) {
    if (zone < ZONE_R || zone > ZONE_I || size < 1 || size > 3) return 0;
    const full = LOT_CAPACITY[size][zone] * LOT_TIER_MULTIPLIER[lotTier(variant)];
    if (buildingState === BUILDING_ACTIVE || buildingState === BUILDING_RECOVERING) return Math.floor(full);
    if (buildingState === BUILDING_DECLINING) return Math.floor(full / 2);
    return 0;
  }
  // One pass over the lot anchors: the building list the renderers draw,
  // population and jobs, the town centre, and each lot's best road access.
  function rebuildLotStats(state) {
    const size = state.size; const n = size * size;
    const lot = state.lot; const stage = state.stage; const zone = state.zone; const buildingState = state.buildingState; const variant = state.variant;
    const accessDist = state.accessDist; const accessRoad = state.accessRoad; const buildingId = state.buildingId; const buildingAnchor = state.buildingAnchor;
    buildingId.fill(-1); buildingAnchor.fill(-1);
    const buildings = []; let population = 0; let cJobs = 0; let iJobs = 0;
    const counts = { total: 0, r: 0, c: 0, i: 0, working: 0, big: 0 };
    let weight = 0; let sx = 0; let sy = 0;
    for (let a = 0; a < n; a += 1) {
      if (lot[a] !== a + 1) continue;
      const s = stage[a]; const z = zone[a]; const st = buildingState[a];
      const x = a % size; const y = (a - x) / size;
      const id = buildings.length; let bestDist = 255; let access = -1;
      for (let dy = 0; dy < s; dy += 1) for (let dx = 0; dx < s; dx += 1) {
        const c = a + dy * size + dx; buildingId[c] = id; buildingAnchor[c] = a;
        if (accessDist[c] < bestDist) { bestDist = accessDist[c]; access = accessRoad[c]; }
      }
      const load = lotCapacity(z, s, variant[a], st);
      buildings.push({ id, x, y, w: s, h: s, zone: z, stage: s, state: st, variant: variant[a], tier: lotTier(variant[a]),
        population: z === ZONE_R ? load : 0, jobs: z === ZONE_R ? 0 : load, access });
      if (z === ZONE_R) population += load; else if (z === ZONE_C) cJobs += load; else iJobs += load;
      counts.total += 1; counts[["", "r", "c", "i"][z] || "r"] += 1;
      if (lotOccupied(st)) counts.working += 1;
      if (s > 1) counts.big += 1;
      if (load) { weight += load; sx += load * (x + (s - 1) / 2); sy += load * (y + (s - 1) / 2); }
    }
    state.buildings = buildings; state.lotCounts = counts;
    state.cityCenter = weight ? { x: Math.round(sx / weight), y: Math.round(sy / weight) } : { ...state.spawnCenter };
    // Transit jobs count as commercial work; military tiles employ on the
    // industrial side; arcologies house their own population.
    let militaryTiles = 0;
    for (let i = 0; i < n; i += 1) if (zone[i] === ZONE_MILITARY) militaryTiles += 1;
    state.population = population; state.cJobs = cJobs + state.railService.jobs + state.subwayService.jobs + state.busService.jobs; state.iJobs = iJobs + militaryTiles * 2;
    state.jobs = state.cJobs + state.iJobs;
    state.arcoPopulation = state.facilities.reduce((sum, item) => {
      const spec = FACILITY_KINDS[item.kind];
      return sum + ((item.kind === "arco" || ARCO_KINDS.includes(item.kind)) ? (spec?.population || 0) : 0);
    }, 0);
  }

  // The problem a zoned tile shows, most blocking first: road, power, the
  // commute, congestion, demand, pollution, then (low priority) water.
  function recomputeProblems(state) {
    const problems = []; const n = tileCount(state);
    const problemCode = state.problemCode; problemCode.fill(PROBLEM.NONE);
    const demandByZone = [0, state.demand.r, state.demand.c, state.demand.i];
    const zone = state.zone; const density = state.density; const lot = state.lot; const stage = state.stage;
    const powered = state.powered; const watered = state.watered; const accessRoad = state.accessRoad; const congested = state.congested;
    const buildingId = state.buildingId; const buildings = state.buildings; const pollution = state.pollution;
    for (let i = 0; i < n; i += 1) {
      const z = zone[i]; if (z < ZONE_R || z > ZONE_I) continue;
      const building = lot[i] && buildingId[i] >= 0 ? buildings[buildingId[i]] : null;
      const access = building ? building.access : accessRoad[i];
      let code = PROBLEM.NONE;
      if (access < 0) code = PROBLEM.NO_ROAD;
      else if (!powered[i]) code = PROBLEM.NO_POWER;
      else if (!commuteOk(state, z, access)) code = PROBLEM.NO_COMMUTE;
      else if (congested[access]) code = PROBLEM.CONGESTED;
      else if (demandByZone[z] <= 0 && !building) code = PROBLEM.NO_DEMAND;
      else if (z === ZONE_R && pollution[i] >= LOT_RULES.pollutionProblem) code = PROBLEM.POLLUTION;
      else if (density[i] === DENSITY_HIGH && !watered[i]) code = PROBLEM.NO_WATER;
      problemCode[i] = code;
      if (code && problems.length < 64) { const x = i % state.size; problems.push({ code: PROBLEM_NAMES[code], x, y: (i - x) / state.size, action: PROBLEM_ACTIONS[code] }); }
    }
    state.problems = problems;
  }
  function publishProblemChanges(state) {
    const problemCode = state.problemCode; const last = state.lastProblemCode;
    for (let i = 0, n = tileCount(state); i < n; i += 1) if (problemCode[i] !== last[i]) {
      const code = problemCode[i]; const pos = xyOf(state, i);
      pushEvent(state, "problem-changed", { code: PROBLEM_NAMES[code], previousCode: PROBLEM_NAMES[last[i]], x: pos.x, y: pos.y, action: PROBLEM_ACTIONS[code] });
    }
    last.set(problemCode);
  }
  function ensureDerived(state, emitProblemChanges = false) {
    let dirty = state.dirty | 0;
    if (dirty) {
      // What each system feeds: facilities are stations, plants and service
      // reach; the network moves road access and so every lot's access.
      if (dirty & DIRTY.FACILITIES) dirty |= DIRTY.NETWORK | DIRTY.POWER | DIRTY.WATER | DIRTY.COVERAGE | DIRTY.LOTS;
      if (dirty & DIRTY.NETWORK) dirty |= DIRTY.LOTS | DIRTY.ROUTES;
      dirty |= DIRTY.PROBLEMS;
      if (dirty & DIRTY.TERRAIN) recomputeWaterDistance(state);
      if (dirty & DIRTY.FACILITIES) rebuildFacilityLayers(state);
      if (dirty & DIRTY.NETWORK) { recomputeRailService(state); recomputeAccess(state); }
      if (dirty & DIRTY.POWER) recomputeUtility(state, "power");
      if (dirty & DIRTY.WATER) recomputeUtility(state, "water");
      if (dirty & DIRTY.COVERAGE) recomputeCoverage(state);
      if (dirty & DIRTY.LOTS) rebuildLotStats(state);
      if (dirty & DIRTY.ROUTES) recomputeRoutes(state);
      if (dirty & DIRTY.ENV) recomputeEnvironment(state);
      if (dirty & (DIRTY.ENV | DIRTY.COVERAGE | DIRTY.LOTS)) recomputeWellbeing(state);
      recomputeProblems(state);
      state.dirty = 0;
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
      levelCost: plan && plan.data && plan.data.levelCost ? plan.data.levelCost : 0,
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
      // The nation places the base (planCommand bills it nothing); the tool
      // palette shows the same price.
      if (payload.zone === "military" || payload.zone === ZONE_MILITARY) return 0;
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
      ensureDerived(state);
      const site = disasterSite(state, payload.kind, { x, y });
      if (!site.ok) return reject(site.reason);
      return accept("trigger-disaster", 0, [], { kind: payload.kind, x: site.x, y: site.y });
    }
    if (type === "build-path") {
      const network = payload.network; const layer = state[network];
      // A highway is two tiles wide: every dragged point stamps a 2x2 pad,
      // pulled back inside the map at the far edges.
      const tiles = network === "highway" ? highwayStamp(state, pathTiles(payload)) : pathTiles(payload);
      if (!NETWORK_COST[network] || !layer || !tiles) return reject("payload");
      // Tech gate (MISC tech table): a network the city has not invented is
      // refused until its year — highway, onramp, and subway are the drag
      // networks SC2K gates; roads/rail/wire/pipe/park are year-1900.
      const techYear = network === "highway" ? TECHS.highways : network === "onramp" ? TECHS.highways
        : network === "subway" ? TECHS.subways : network === "bus" ? TECHS.buses : null;
      if (techYear && dateOf(state).year < techYear) return reject("tech-year", tiles);
      const changed = [];
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
      // Tech gate: an airport or seaport is locked until the year SC2K
      // unlocks it. A zone drag before that refuses before touching land.
      if (portKind && dateOf(state).year < TECHS[portKind]) return reject("tech-year", requested);
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
      // A reward landmark is earned by population, not unlocked by year, so
      // it ignores the tech gate (SC2K arcologies and statues arrive as
      // rewards regardless of the calendar).
      if (spec.tech && !spec.reward && dateOf(state).year < spec.tech) return reject("tech-year", tiles);
      if (payload.kind === "nuclear" && ordinanceOn(state, "nuclearFreeZone")) return reject("nuclear-free-zone", tiles);
      if (spec.reward) {
        // A concrete arco is unlocked by the tier-6 "arco" reward: the
        // mayor places one of the four after the reward fires.
        const unlock = ARCO_KINDS.includes(payload.kind) ? "arco" : payload.kind;
        if (!state.rewardsOffered.includes(unlock)) return reject("reward-locked", tiles);
        if (!spec.repeatable && state.facilities.some((item) => item.kind === payload.kind)) return reject("reward-placed", tiles);
      }
      const baseAlt = inBounds(state, payload.x, payload.y) ? state.alt[indexOf(state, payload.x, payload.y)] : -1;
      for (const tile of tiles) {
        if (!inBounds(state, tile.x, tile.y)) return reject("bounds", tiles); const i = indexOf(state, tile.x, tile.y);
        // A hydro plant sits on the waterfall itself; every other facility
        // needs dry, level ground.
        if (spec.needsWaterfall) { if (state.waterKind[i] !== 2) return reject("needs-waterfall", tiles); }
        else if (state.water[i]) return reject("water", tiles);
        if (state.facilityAt[i] >= 0 || state.zone[i] || state.road[i] || state.rail[i] || state.park[i]) return reject("occupied", tiles);
      }
      // Uneven ground is levelled to the anchor's height (the SC2K way) and
      // billed per tile at the terrain tool's level price; it is refused
      // only when the new pad would leave a neighbour more than a step off.
      const leveling = spec.needsWaterfall ? { code: "", cells: [] } : levelingFor(state, payload.x, payload.y, spec.w, spec.h, baseAlt);
      if (leveling.code) return reject(leveling.code, tiles);
      const levelCost = leveling.cells.length * TERRAFORM_COST.level;
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
      // A marina sits on the shore: at least one of its tiles touches water.
      if (spec.needsShore && !tiles.some((tile) => state.shore[indexOf(state, tile.x, tile.y)])) return reject("needs-water", tiles);
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
      const total = spec.cost + levelCost;
      return state.funds < total ? reject("funds", tiles) : accept("place-facility", total, tiles, { kind: payload.kind, x: payload.x, y: payload.y, level: leveling.cells, alt: baseAlt, levelCost });
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
      facilityIds.forEach((id) => { const facility = state.facilities[id]; const spec = footprintOf(facility); areaTiles({ x: facility.x, y: facility.y, width: spec.w, height: spec.h }).forEach((tile) => expanded.set(`${tile.x},${tile.y}`, tile)); });
      // Bulldozing any tile of a building brings the whole building down;
      // the rest of its lot stays zoned and empty.
      const requestedKeys = new Set(expanded.keys()); const lotAnchors = new Set();
      for (const tile of requested) { const i = indexOf(state, tile.x, tile.y); if (state.lot[i]) lotAnchors.add(state.lot[i] - 1); }
      lotAnchors.forEach((anchor) => { const { x, y } = xyOf(state, anchor); const side = Math.max(1, state.stage[anchor]); areaTiles({ x, y, width: side, height: side }).forEach((tile) => { if (!expanded.has(`${tile.x},${tile.y}`)) expanded.set(`${tile.x},${tile.y}`, tile); }); });
      const tiles = Array.from(expanded.values()); const changed = tiles.filter((tile) => {
        const i = indexOf(state, tile.x, tile.y); return state.facilityAt[i] >= 0 || state.road[i] || state.rail[i] || state.wire[i] || state.pipe[i] || state.park[i] || state.zone[i] || state.tree[i] || state.highway[i] || state.onramp[i] || state.lot[i];
      });
      if (!changed.length) return reject("empty", tiles); const cost = changed.length * 3;
      const cleared = changed.filter((tile) => requestedKeys.has(`${tile.x},${tile.y}`)).map((tile) => indexOf(state, tile.x, tile.y));
      return state.funds < cost ? reject("funds", changed) : accept("demolish-area", cost, changed, { facilityIds: Array.from(facilityIds).sort((a, b) => a - b), lotAnchors: Array.from(lotAnchors).sort((a, b) => a - b), cleared });
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

  const UNDO_LAYERS = ["alt", "tree", "road", "rail", "wire", "pipe", "park", "zone", "density", "stage", "buildingState", "constructionTimer", "variant", "catalogId", "subway", "highway", "onramp", "lot"];
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
    state.facilities = snapshot.facilities.map((item) => ({ ...item })); recomputeTerrainEdges(state); markDerivedDirty(state); repairLots(state); ensureDerived(state); state.rev += 1;
  }

  function applyPlan(state, plan, sequence, originalType, recordHistory = true) {
    const before = captureTransaction(state, plan.tiles); const domainEvents = []; state.funds -= plan.cost;
    // Each action marks only the derived systems it can move.
    let dirty = DIRTY.PROBLEMS;
    if (plan.action === "build-path") {
      const layer = state[plan.data.network]; plan.tiles.forEach((tile) => { const i = indexOf(state, tile.x, tile.y); layer[i] = 1; state.tree[i] = 0; });
      const network = plan.data.network;
      dirty |= network === "wire" ? DIRTY.POWER : network === "pipe" ? DIRTY.WATER : network === "park" ? DIRTY.COVERAGE : DIRTY.NETWORK;
      domainEvents.push(["infrastructure-built", { network: plan.data.network, tiles: plan.tiles.length }]);
    } else if (plan.action === "zone-area") {
      plan.tiles.forEach((tile) => { const i = indexOf(state, tile.x, tile.y); state.tree[i] = 0; state.zone[i] = plan.data.zone; state.density[i] = plan.data.density;
        state.stage[i] = 0; state.buildingState[i] = 0; state.constructionTimer[i] = 0; state.catalogId[i] = 0; state.variant[i] = 0; state.lot[i] = 0; });
      dirty |= DIRTY.POWER | DIRTY.WATER | DIRTY.LOTS;
      domainEvents.push(["zone-designated", { zone: plan.data.zone, density: plan.data.density, tiles: plan.tiles.length }]);
    } else if (plan.action === "place-facility") {
      plan.tiles.forEach((tile) => { state.tree[indexOf(state, tile.x, tile.y)] = 0; }); state.facilities.push(facilityRecord(plan.data.kind, plan.data.x, plan.data.y, state.tick));
      dirty |= DIRTY.FACILITIES;
      if (plan.data.level && plan.data.level.length) { plan.data.level.forEach((i) => { state.alt[i] = plan.data.alt; }); recomputeTerrainEdges(state); dirty |= DIRTY.TERRAIN; }
      domainEvents.push(["construction-started", { kind: plan.data.kind, x: plan.data.x, y: plan.data.y }], ["building-completed", { kind: plan.data.kind, x: plan.data.x, y: plan.data.y }]);
    } else if (plan.action === "terraform-area") {
      plan.tiles.forEach((tile) => { const i = indexOf(state, tile.x, tile.y); if (plan.data.mode === "tree") state.tree[i] = 1; else state.alt[i] = plan.data.desired.get(i); });
      recomputeTerrainEdges(state); dirty |= DIRTY.TERRAIN; domainEvents.push(["terrain-changed", { mode: plan.data.mode, tiles: plan.tiles.length }]);
    } else if (plan.action === "demolish-area") {
      const ids = new Set(plan.data.facilityIds); state.facilities = state.facilities.filter((_, id) => !ids.has(id));
      plan.data.lotAnchors.forEach((anchor) => clearLot(state, anchor));
      plan.data.cleared.forEach((i) => { state.road[i] = 0; state.rail[i] = 0; state.wire[i] = 0; state.pipe[i] = 0; state.park[i] = 0;
        state.zone[i] = 0; state.density[i] = 0; state.stage[i] = 0; state.buildingState[i] = 0; state.constructionTimer[i] = 0; state.tree[i] = 0; state.catalogId[i] = 0; state.highway[i] = 0; state.onramp[i] = 0; state.lot[i] = 0; state.variant[i] = 0; });
      dirty |= DIRTY_STRUCTURE;
      domainEvents.push(["area-demolished", { tiles: plan.tiles.length }]);
    } else if (plan.action === "trigger-disaster") {
      startDisaster(state, plan.data.kind, plan.data.x, plan.data.y, "menu");
      domainEvents.push(["disaster-started", { kind: plan.data.kind, x: plan.data.x, y: plan.data.y, cause: "menu" }]);
    } else {
      if (plan.data.policy === "tax-rate") { state.taxRates = { r: plan.data.taxRate, c: plan.data.taxRate, i: plan.data.taxRate }; syncMeanTaxRate(state); }
      else if (plan.data.policy === "tax-rates") { state.taxRates = { ...state.taxRates, ...plan.data.rates }; syncMeanTaxRate(state); }
      else if (plan.data.policy === "funding") { state.funding[plan.data.service] = plan.data.level; dirty |= DIRTY.COVERAGE; }
      else if (plan.data.policy === "disasters") state.disastersOff = !plan.data.enabled;
      else if (plan.data.policy === "ordinance") { state.ordinances = { ...state.ordinances, [plan.data.id]: plan.data.enacted }; if (plan.data.enacted) state.newsMemo.ordinance = plan.data.id; dirty |= DIRTY.POWER | DIRTY.WATER | DIRTY.COVERAGE; }
      else if (plan.data.policy === "newspaper") state.paperDelivery = plan.data.enabled;
      else if (plan.data.policy === "found-city") { state.founded = true; pushNotice(state, "bonsai_msg_city_founded"); }
      else if (plan.data.policy === "bond" && plan.data.action === "issue") { state.bonds.push({ principal: BOND_PRINCIPAL, rate: bondRate(state), issuedTick: state.tick }); state.funds += BOND_PRINCIPAL; }
      else if (plan.data.policy === "bond") { const bond = state.bonds[plan.data.index]; state.funds -= bond.principal; state.bonds = state.bonds.filter((_, index) => index !== plan.data.index); }
      else { state.bonds.push({ principal: plan.data.amount, rate: bondRate(state), issuedTick: state.tick }); state.funds += plan.data.amount; }
      domainEvents.push(["policy-changed", { ...plan.data }]);
    }
    markDerivedDirty(state, dirty); ensureDerived(state); state.rev += 1;
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

  // Weighted links to the neighbouring cities: a road tile on the map edge
  // counts 1, rail 2, highway 4, capped at 10 (3.2).
  function edgeLinkWeight(state) {
    const last = state.size - 1; let total = 0;
    const weight = (i) => (state.highway[i] ? 4 : state.rail[i] ? 2 : state.road[i] ? 1 : 0);
    for (let k = 0; k < state.size; k += 1) {
      total += weight(indexOf(state, k, 0)) + weight(indexOf(state, k, last));
      if (k > 0 && k < last) total += weight(indexOf(state, 0, k)) + weight(indexOf(state, last, k));
    }
    return Math.min(10, total);
  }
  function workingPortTiles(state) {
    let seaport = 0; let airport = 0;
    for (let i = 0, n = tileCount(state); i < n; i += 1) {
      if (!state.powered[i] || !state.portOk[i]) continue;
      if (state.zone[i] === ZONE_SEAPORT) seaport += 1; else if (state.zone[i] === ZONE_AIRPORT) airport += 1;
    }
    return { seaport, airport };
  }
  // SC2K-scale demand (3.2): an internal -2000..+2000 per market, shown as
  // -100..+100. Residents follow jobs against the workforce, taxes and the
  // city's appeal; commerce follows residents, industry and trade; industry
  // follows the outside market and residents. A city short of workers
  // loses commercial and industrial demand.
  const clampRange = (value, low, high) => Math.max(low, Math.min(high, value));
  function demandInternals(state) {
    ensureDerived(state);
    let pollution = 0; let happiness = 0; let crime = 0; let occupied = 0;
    for (let i = 0, n = tileCount(state); i < n; i += 1) if (state.zone[i]) { pollution += state.pollution[i]; happiness += state.happiness[i]; crime += state.crime[i]; occupied += 1; }
    const avgPollution = occupied ? pollution / occupied : 0; const avgHappiness = occupied ? happiness / occupied : 60; const avgCrime = occupied ? crime / occupied : 0;
    const workforce = state.population * state.workforcePercent / 100;
    const jobs = state.cJobs + state.iJobs;
    const links = edgeLinkWeight(state);
    const ports = workingPortTiles(state);
    const airport = ports.airport >= PORT_MIN_TILES.airport ? 400 : 0;
    const seaport = ports.seaport >= PORT_MIN_TILES.seaport ? 400 : 0;
    const advertising = (ordinanceOn(state, "touristAdvertising") ? 150 : 0) + (ordinanceOn(state, "businessAdvertising") ? 150 : 0);
    const r = 400 + 1200 * clampRange((jobs - workforce) / Math.max(workforce, 200), -1.5, 1.5) - 60 * (state.taxRates.r - DEFAULT_TAX)
      + 5 * (avgHappiness - 50) - 3 * avgCrime / 10 - 2 * avgPollution / 10 + 100;
    const trade = 150 * links + airport + advertising;
    const expectedC = 0.30 * state.population + 0.15 * state.iJobs + trade;
    let c = 1400 * clampRange((expectedC - state.cJobs) / Math.max(expectedC, 200), -1.5, 1) - 60 * (state.taxRates.c - DEFAULT_TAX);
    const market = 200 + state.economyIndex + 60 * links + seaport;
    const expectedI = market + 0.25 * state.population;
    let i = 1400 * clampRange((expectedI - state.iJobs) / Math.max(expectedI, 200), -1.5, 1) - 60 * (state.taxRates.i - DEFAULT_TAX);
    if (workforce > 0 && jobs > 1.2 * workforce) { const shortage = 600 * (jobs / workforce - 1.2); c -= shortage; i -= shortage; }
    return { r, c, i, workforce, jobs, expectedC, expectedI, trade, market, links, avgHappiness, avgCrime, avgPollution };
  }
  function recomputeDemand(state) {
    const month = Math.floor(state.tick / TICKS_PER_MONTH); state.economyIndex = Math.round((latticeHash(month, 0, state.seed) - 0.5) * 50);
    const inside = demandInternals(state);
    const shown = (value) => clampRange(Math.round(clampRange(value, -2000, 2000) / 20), -100, 100);
    state.demand = { r: shown(inside.r), c: shown(inside.c), i: shown(inside.i) };
    state.dirty |= DIRTY.PROBLEMS;
  }

  // Oversupply must hold for three settled months before a working building
  // declines for it. Demand refreshes monthly and the stock terms answer
  // immediately, so one bad month used to empty a district: the two-hour
  // playthrough measured a serviced 6 000-resident city falling to 16 in
  // two months and cycling for ever. Service failures keep their fuse.
  function oversuppliedFor(state, zone, months) {
    const key = ["", "r", "c", "i"][zone];
    if (!key || state.history.length < months) return false;
    for (let n = 1; n <= months; n += 1) if (state.history[state.history.length - n].demand[key] >= -40) return false;
    return true;
  }

  function setLot(state, anchor, size, buildingState) {
    const n = state.size; const lot = state.lot; const stage = state.stage; const bs = state.buildingState; const timer = state.constructionTimer; const catalog = state.catalogId;
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) {
      const c = anchor + dy * n + dx; lot[c] = anchor + 1; stage[c] = size; bs[c] = buildingState; timer[c] = 0; catalog[c] = 0;
    }
  }
  function setLotState(state, anchor, buildingState) {
    const n = state.size; const size = state.stage[anchor]; const bs = state.buildingState;
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) bs[anchor + dy * n + dx] = buildingState;
    state.constructionTimer[anchor] = 0;
  }
  // Clears a lot back to empty zoned land (the zone stays).
  function clearLot(state, anchor) {
    const n = state.size; const size = Math.max(1, state.stage[anchor]);
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) {
      const c = anchor + dy * n + dx; if (c >= state.lot.length || state.lot[c] !== anchor + 1) continue;
      state.lot[c] = 0; state.stage[c] = 0; state.buildingState[c] = 0; state.constructionTimer[c] = 0; state.variant[c] = 0; state.catalogId[c] = 0;
    }
  }
  function lotAverage(state, layer, anchor, size) {
    const n = state.size; let sum = 0;
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) sum += layer[anchor + dy * n + dx];
    return sum / (size * size);
  }
  // The look: land value picks the tier (low, middle, high), a stable hash
  // picks one of its eight buildings.
  // The land value at which the high tier starts in this city (see
  // LOT_RULES): the value its dearest downtownShare of dry land reaches,
  // never below tierHigh. It reads the saved land value layer alone, which
  // only the monthly pass changes, so a city loaded mid-month draws the
  // same line as one that kept running; never saved itself.
  function towerLine(state) {
    if (state.towerLine != null) return state.towerLine;
    const counts = new Uint32Array(256); let total = 0;
    for (let i = 0, n = tileCount(state); i < n; i += 1) {
      if (!state.water[i]) { counts[state.landValue[i]] += 1; total += 1; }
    }
    let line = 255;
    for (let v = 255, seen = 0; v >= 0; v -= 1) { seen += counts[v]; if (seen > total * LOT_RULES.downtownShare) { line = v; break; } }
    state.towerLine = Math.max(LOT_RULES.tierHigh, total ? line : 255);
    return state.towerLine;
  }
  function lotTierFor(state, value) { return value < LOT_RULES.tierLow ? 1 : value < towerLine(state) ? 2 : 3; }
  function towerRank(state, value) { return Math.max(0, Math.min(LOT_VARIANTS_PER_TIER - 1, Math.floor((value - towerLine(state)) / LOT_RULES.towerValueStep))); }
  function pickLotVariant(state, anchor, size) {
    const value = lotAverage(state, state.landValue, anchor, size);
    let tier = lotTierFor(state, value);
    if (tier === 3 && !lotFrontsRoad(state, anchor, size)) tier = 2;
    if (tier === 3) return 2 * LOT_VARIANTS_PER_TIER + 1 + towerRank(state, value);
    const x = anchor % state.size; const y = (anchor - x) / state.size;
    return (tier - 1) * LOT_VARIANTS_PER_TIER + 1 + (latticeInt(x, y, state.seed + state.tick) % LOT_VARIANTS_PER_TIER);
  }
  // Whether a lot's footprint has a road along any of its four sides.
  function lotFrontsRoad(state, anchor, size) {
    const n = state.size; const x = anchor % n; const y = (anchor - x) / n;
    for (let k = 0; k < size; k += 1) {
      for (const [tx, ty] of [[x + k, y - 1], [x + k, y + size], [x - 1, y + k], [x + size, y + k]]) {
        if (tx >= 0 && ty >= 0 && tx < n && ty < n && state.road[ty * n + tx]) return true;
      }
    }
    return false;
  }
  // A square of `size` at `anchor` that a new lot may take: same zone, dense,
  // untouched, watered, and enough demand and land value for its size.
  // Ground a step off the anchor is levelled (3.9) when the treasury can pay
  // the terrain tool's price for it; the answer is the cells to level, or
  // null when the square will not do.
  function blockFree(state, anchor, size, zone, demand) {
    const n = state.size; const x = anchor % n; const y = (anchor - x) / n;
    if (x + size > n || y + size > n) return null;
    if (size === 3 && demand <= LOT_RULES.bigDemand) return null;
    if (size === 2 && demand <= LOT_RULES.midDemand) return null;
    const base = state.alt[anchor];
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) {
      const c = anchor + dy * n + dx;
      if (state.zone[c] !== zone || state.density[c] !== DENSITY_HIGH || state.lot[c] || state.buildingState[c] || Math.abs(state.alt[c] - base) > 1 || !state.watered[c]) return null;
    }
    const value = lotAverage(state, state.landValue, anchor, size);
    if (size === 3 && value < LOT_RULES.bigLandValue) return null;
    if (size === 2 && value < LOT_RULES.midLandValue) return null;
    return affordableLeveling(state, x, y, size, base);
  }
  function affordableLeveling(state, x, y, size, base) {
    const leveling = levelingFor(state, x, y, size, size, base);
    if (leveling.code || leveling.cells.length * TERRAFORM_COST.level > Math.max(0, state.funds)) return null;
    return leveling.cells;
  }
  function applyLeveling(state, cells, alt) {
    if (!cells || !cells.length) return;
    for (const i of cells) state.alt[i] = alt;
    const cost = cells.length * TERRAFORM_COST.level;
    state.funds -= cost;
    recomputeTerrainEdges(state); state.dirty |= DIRTY.TERRAIN;
  }
  // Which cells of a w x h pad at (x, y) must change height to sit at
  // `target`, or why it cannot: every dry neighbour outside the pad has to
  // stay within one step of the new level.
  function levelingFor(state, x, y, w, h, target) {
    const n = state.size; const cells = [];
    for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) {
      const i = (y + dy) * n + x + dx; if (state.alt[i] !== target) cells.push(i);
    }
    if (!cells.length) return { code: "", cells };
    for (let yy = y - 1; yy <= y + h; yy += 1) for (let xx = x - 1; xx <= x + w; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
      if ((xx < x || xx >= x + w) && (yy < y || yy >= y + h)) continue; // corners do not touch
      const i = yy * n + xx; if (!state.water[i] && Math.abs(state.alt[i] - target) > 1) return { code: "slope", cells: [] };
    }
    return { code: "", cells };
  }
  function levelEnough(state, i) {
    const n = state.size; const x = i % n; const alt = state.alt[i];
    const near = (j) => !state.water[j] && Math.abs(state.alt[j] - alt) > 1;
    return !((x > 0 && near(i - 1)) || (x < n - 1 && near(i + 1)) || (i >= n && near(i - n)) || (i + n < state.alt.length && near(i + n)));
  }
  function tryStartLot(state, i, demand) {
    const zone = state.zone[i];
    if (demand <= 0 || state.accessRoad[i] < 0 || !state.powered[i] || !levelEnough(state, i)) return false;
    if (!commuteOk(state, zone, state.accessRoad[i])) return false;
    const chance = LOT_RULES.growthBase + LOT_RULES.growthSlope * clampRange(demand / 100, 0, 1);
    if (nextRandom(state) >= chance) return false;
    let size = 1; let leveling = null;
    if (state.density[i] === DENSITY_HIGH) {
      leveling = blockFree(state, i, 3, zone, demand);
      if (leveling) size = 3; else { leveling = blockFree(state, i, 2, zone, demand); if (leveling) size = 2; }
    }
    applyLeveling(state, leveling, state.alt[i]);
    setLot(state, i, size, BUILDING_FOUNDATION);
    state.variant[i] = pickLotVariant(state, i, size);
    const x = i % state.size;
    pushEvent(state, "construction-started", { zone, x, y: (i - x) / state.size, size });
    return true;
  }
  // What is wrong with a standing lot, as the number of days it may last so;
  // 0 when nothing is.
  function lotTrouble(state, anchor, building) {
    const size = state.stage[anchor]; const zone = state.zone[anchor];
    if (!building || building.access < 0) return LOT_RULES.roadFuseDays;
    if (!state.powered[anchor]) return LOT_RULES.powerFuseDays;
    let fuse = 0;
    if (!commuteOk(state, zone, building.access)) fuse = LOT_RULES.commuteFuseDays;
    if (size > 1 && lotAverage(state, state.watered, anchor, size) < 1) fuse = LOT_RULES.waterFuseDays;
    if (zone === ZONE_R && state.pollution[anchor] > LOT_RULES.declinePollution) fuse = LOT_RULES.nuisanceFuseDays;
    return fuse;
  }
  // Crime drives people out gradually: past the threshold, every look at a
  // home or shop carries a chance of decline that grows with the excess,
  // and a building in decline is not reoccupied until crime falls back.
  function crimeExcess(state, anchor) {
    return state.zone[anchor] === ZONE_I ? 0 : Math.max(0, state.crime[anchor] - LOT_RULES.declineCrime);
  }
  // The chance a building in decline is taken up again falls with the crime
  // around it; past crimeRecoverSpan over the threshold nobody moves in.
  function crimeLetsBack(state, anchor) {
    const excess = crimeExcess(state, anchor);
    return !excess || nextRandom(state) >= excess / LOT_RULES.crimeRecoverSpan;
  }
  // A dense working lot may be rebuilt as the next size up when a square
  // around it holds only its own zone: empty cells, or smaller working lots
  // wholly inside the square. The old buildings come down; the new one
  // starts at construction, so its people are gone until it opens.
  function tryUpgradeLot(state, anchor, demand) {
    const n = state.size; const size = state.stage[anchor]; const zone = state.zone[anchor];
    if (size >= 3 || state.density[anchor] !== DENSITY_HIGH || demand <= LOT_RULES.upgradeDemand) return false;
    if (lotAverage(state, state.watered, anchor, size) < 1) return false;
    const target = size + 1; const ax = anchor % n; const ay = (anchor - ax) / n; const base = state.alt[anchor];
    for (let oy = 0; oy <= target - size; oy += 1) for (let ox = 0; ox <= target - size; ox += 1) {
      const bx = ax - ox; const by = ay - oy;
      if (bx < 0 || by < 0 || bx + target > n || by + target > n) continue;
      let fits = true;
      for (let dy = 0; dy < target && fits; dy += 1) for (let dx = 0; dx < target; dx += 1) {
        const c = (by + dy) * n + bx + dx;
        if (state.zone[c] !== zone || state.density[c] !== DENSITY_HIGH || Math.abs(state.alt[c] - base) > 1 || !state.watered[c]) { fits = false; break; }
        if (!state.lot[c]) { if (state.buildingState[c]) { fits = false; break; } continue; }
        const other = state.lot[c] - 1; const otherSize = state.stage[other]; const ox2 = other % n; const oy2 = (other - ox2) / n;
        if (otherSize >= target || state.buildingState[other] !== BUILDING_ACTIVE
          || ox2 < bx || oy2 < by || ox2 + otherSize > bx + target || oy2 + otherSize > by + target) { fits = false; break; }
      }
      if (!fits) continue;
      // A bigger building needs the land value its size asks of new lots.
      const value = lotAverage(state, state.landValue, by * n + bx, target);
      if (value < (target === 3 ? LOT_RULES.bigLandValue : LOT_RULES.midLandValue)) continue;
      const leveling = affordableLeveling(state, bx, by, target, base);
      if (!leveling) continue;
      if (nextRandom(state) >= LOT_RULES.upgradeChance) return false;
      applyLeveling(state, leveling, base);
      for (let dy = 0; dy < target; dy += 1) for (let dx = 0; dx < target; dx += 1) {
        const c = (by + dy) * n + bx + dx; if (state.lot[c]) clearLot(state, state.lot[c] - 1);
      }
      const newAnchor = by * n + bx;
      setLot(state, newAnchor, target, BUILDING_CONSTRUCTION);
      state.variant[newAnchor] = pickLotVariant(state, newAnchor, target);
      pushEvent(state, "construction-started", { zone, x: bx, y: by, size: target, rebuild: true });
      return true;
    }
    return false;
  }
  // A working lot on a street whose land has risen over the tower line
  // since it was built comes down and goes up again at the high tier, the
  // same size; a tower whose land has risen two height ranks is rebuilt
  // taller.
  function tryRedevelopLot(state, anchor, demand) {
    if (demand <= 0) return false;
    const size = state.stage[anchor];
    if (!lotFrontsRoad(state, anchor, size)) return false;
    const value = lotAverage(state, state.landValue, anchor, size);
    if (value < towerLine(state)) return false;
    if (lotTier(state.variant[anchor]) >= 3 && towerRank(state, value) < state.variant[anchor] - 2 * LOT_VARIANTS_PER_TIER - 1 + 2) return false;
    if (nextRandom(state) >= LOT_RULES.redevelopChance) return false;
    const zone = state.zone[anchor]; const x = anchor % state.size; const y = (anchor - x) / state.size;
    clearLot(state, anchor);
    setLot(state, anchor, size, BUILDING_CONSTRUCTION);
    state.variant[anchor] = pickLotVariant(state, anchor, size);
    pushEvent(state, "construction-started", { zone, x, y, size, rebuild: true });
    return true;
  }
  function stepLot(state, anchor, demand) {
    const building = state.buildingId[anchor] >= 0 ? state.buildings[state.buildingId[anchor]] : null;
    const size = state.stage[anchor]; const current = state.buildingState[anchor]; const zone = state.zone[anchor];
    const days = Math.min(65535, state.constructionTimer[anchor] + DEV_SLICES);
    const x = anchor % state.size; const y = (anchor - x) / state.size;
    if (current === BUILDING_FOUNDATION) {
      if (days >= LOT_RULES.foundationDays && state.powered[anchor]) { setLotState(state, anchor, BUILDING_CONSTRUCTION); return true; }
      state.constructionTimer[anchor] = days; return false;
    }
    if (current === BUILDING_CONSTRUCTION) {
      if (days >= LOT_CONSTRUCTION_DAYS[size]) {
        setLotState(state, anchor, BUILDING_ACTIVE);
        pushEvent(state, "building-completed", { zone, stage: size, size, x, y });
        return true;
      }
      state.constructionTimer[anchor] = days; return false;
    }
    const trouble = lotTrouble(state, anchor, building);
    if (current === BUILDING_ACTIVE) {
      if (trouble) {
        if (days >= trouble || (!state.powered[anchor] && nextRandom(state) < LOT_RULES.powerDeclineChance)) { setLotState(state, anchor, BUILDING_DECLINING); return true; }
        state.constructionTimer[anchor] = days; return false;
      }
      state.constructionTimer[anchor] = 0;
      if (demand < -40 && oversuppliedFor(state, zone, 3) && nextRandom(state) < LOT_RULES.oversupplyChance) { setLotState(state, anchor, BUILDING_DECLINING); return true; }
      const excess = crimeExcess(state, anchor);
      if (excess && nextRandom(state) < Math.min(LOT_RULES.crimeDeclineMax, excess * LOT_RULES.crimeDeclineSlope)) { setLotState(state, anchor, BUILDING_DECLINING); return true; }
      if (tryUpgradeLot(state, anchor, demand)) return true;
      return tryRedevelopLot(state, anchor, demand);
    }
    if (current === BUILDING_DECLINING) {
      if (!trouble && demand > 10 && crimeLetsBack(state, anchor)) { setLotState(state, anchor, BUILDING_RECOVERING); return true; }
      if (days >= LOT_RULES.declineDays) { setLotState(state, anchor, BUILDING_ABANDONED); return true; }
      state.constructionTimer[anchor] = days; return false;
    }
    if (current === BUILDING_ABANDONED) {
      if (!trouble && demand > 10 && crimeLetsBack(state, anchor)) { setLotState(state, anchor, BUILDING_RECOVERING); return true; }
      if (days >= LOT_RULES.abandonedClearDays) { clearLot(state, anchor); return true; }
      state.constructionTimer[anchor] = days; return false;
    }
    if (current === BUILDING_RECOVERING) {
      if (days >= LOT_RULES.recoverDays) { setLotState(state, anchor, BUILDING_ACTIVE); return true; }
      state.constructionTimer[anchor] = days; return false;
    }
    return false;
  }
  // One slice of the map per day: every fourth cell, so each cell is looked
  // at every four days. Only empty zoned cells and lot anchors do anything.
  function developmentPass(state, day) {
    ensureDerived(state);
    const n = tileCount(state); const zone = state.zone; const lot = state.lot; const buildingState = state.buildingState;
    const demandByZone = [0, state.demand.r, state.demand.c, state.demand.i];
    let changed = false;
    for (let i = day % DEV_SLICES; i < n; i += DEV_SLICES) {
      const z = zone[i]; if (z < ZONE_R || z > ZONE_I) continue;
      const anchor = lot[i];
      if (!anchor) { if (!buildingState[i] && tryStartLot(state, i, demandByZone[z])) changed = true; continue; }
      if (anchor !== i + 1) continue;
      if (stepLot(state, i, demandByZone[z])) changed = true;
    }
    if (changed) { state.dirty |= DIRTY.LOTS; state.rev += 1; }
  }

  // Groups per-tile buildings into lots: the v4 migration and the imports
  // that arrive without a lot layer. A 3x3 or 2x2 square of dense, working
  // tiles of one zone at that growth stage becomes one lot of that size; any
  // other standing tile becomes a 1x1 lot. Sizes are written back to stage.
  function inferLots(size, layers) {
    const n = size * size; const lot = new Uint16Array(n);
    const { zone, density, stage, buildingState } = layers;
    const canGroup = (x, y, side, z, level) => {
      if (x + side > size || y + side > size) return false;
      for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) {
        const i = (y + dy) * size + x + dx;
        if (lot[i] || zone[i] !== z || density[i] !== DENSITY_HIGH || stage[i] < level || buildingState[i] !== BUILDING_ACTIVE) return false;
      }
      return true;
    };
    const stageOut = new Uint8Array(n);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const i = y * size + x; const z = zone[i];
      if (lot[i] || z < ZONE_R || z > ZONE_I) continue;
      if (!stage[i] && !buildingState[i]) continue;
      let side = 1;
      if (stage[i] >= 3 && canGroup(x, y, 3, z, 3)) side = 3;
      else if (stage[i] >= 2 && canGroup(x, y, 2, z, 2)) side = 2;
      for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) { const c = (y + dy) * size + x + dx; lot[c] = i + 1; stageOut[c] = side; }
    }
    return { lot, stage: stageOut };
  }
  // Keeps the lot layer honest after a load or an import: an anchor must
  // name itself, sit on R/C/I land, and own a whole square of its size.
  // Anything else is cleared back to empty zoned land.
  function repairLots(state) {
    const n = state.size; const count = n * n; const lot = state.lot;
    const valid = new Uint8Array(count);
    for (let a = 0; a < count; a += 1) {
      if (lot[a] !== a + 1) continue;
      const s = state.stage[a]; const z = state.zone[a]; const x = a % n; const y = (a - x) / n;
      let ok = s >= 1 && s <= 3 && z >= ZONE_R && z <= ZONE_I && x + s <= n && y + s <= n;
      for (let dy = 0; dy < s && ok; dy += 1) for (let dx = 0; dx < s; dx += 1) {
        const c = a + dy * n + dx; if (lot[c] !== a + 1 || state.zone[c] !== z) { ok = false; break; }
      }
      if (!ok) continue;
      for (let dy = 0; dy < s; dy += 1) for (let dx = 0; dx < s; dx += 1) {
        const c = a + dy * n + dx; valid[c] = 1; state.stage[c] = s; state.buildingState[c] = state.buildingState[a];
      }
    }
    for (let i = 0; i < count; i += 1) {
      if (valid[i]) continue;
      if (lot[i] || ((state.zone[i] >= ZONE_R && state.zone[i] <= ZONE_I) && (state.stage[i] || state.buildingState[i]))) {
        lot[i] = 0; state.stage[i] = 0; state.buildingState[i] = 0; state.constructionTimer[i] = 0;
      }
    }
  }

  // Ordinance money follows the ruleset-5 tax scale, about a tenth of the
  // old per-resident figures; the per-ordinance divisors keep their ratios.
  const ORDINANCE_MONEY_SCALE = 10;
  // Monthly property tax per resident (R) or job (C, I) and per point of the
  // rate, before the land-value weight (0.5 + value/255): about $1.5-2 a
  // resident a year at 7% (spec 3.7).
  const TAX_FACTOR = Object.freeze({ r: 0.026, c: 0.024, i: 0.024 });
  // Network upkeep: tiles x funding% / divisor each month.
  const NETWORK_UPKEEP_DIVISOR = Object.freeze({ roads: 300, highways: 100, bridges: 30, rail: 200, subway: 60 });
  function ordinanceBudget(state) {
    let income = 0; let cost = 0;
    for (const id of ORDINANCE_IDS) {
      if (!ordinanceOn(state, id)) continue;
      const spec = ORDINANCES[id];
      if (spec.incomeDiv) income += Math.floor(state.population / (spec.incomeDiv * ORDINANCE_MONEY_SCALE));
      if (spec.base || spec.costDiv) cost += (spec.base || 0) + (spec.costDiv ? Math.floor(state.population / (spec.costDiv * ORDINANCE_MONEY_SCALE)) : 0);
    }
    return { income, cost };
  }
  // The monthly books (3.7): each market pays on its residents or jobs,
  // weighted by the land they stand on; services and networks cost their
  // upkeep scaled by funding. Power and water structures cost nothing.
  function settleBudget(state) {
    ensureDerived(state);
    let roadLand = 0; let railLand = 0; let bridgeTiles = 0; let subwayTiles = 0; let parkTiles = 0; let highwayLand = 0;
    for (let i = 0, n = tileCount(state); i < n; i += 1) {
      if (state.water[i]) { if (state.road[i] || state.rail[i] || state.highway[i]) bridgeTiles += 1; }
      else { if (state.road[i]) roadLand += 1; if (state.rail[i]) railLand += 1; if (state.highway[i] || state.onramp[i]) highwayLand += 1; }
      if (state.subway[i]) subwayTiles += 1; if (state.park[i]) parkTiles += 1;
    }
    let taxR = 0; let taxC = 0; let taxI = 0;
    for (const building of state.buildings) {
      const load = building.population + building.jobs; if (!load) continue;
      const weight = 0.5 + lotAverage(state, state.landValue, indexOf(state, building.x, building.y), building.w) / 255;
      if (building.zone === ZONE_R) taxR += load * weight * state.taxRates.r * TAX_FACTOR.r;
      else if (building.zone === ZONE_C) taxC += load * weight * state.taxRates.c * TAX_FACTOR.c;
      else taxI += load * weight * state.taxRates.i * TAX_FACTOR.i;
    }
    const taxes = { r: Math.floor(taxR), c: Math.floor(taxC), i: Math.floor(taxI) };
    const ordinances = ordinanceBudget(state);
    const budget = makeEmptyBudget();
    budget.taxes = taxes; budget.ordinanceIncome = ordinances.income; budget.ordinanceCost = ordinances.cost;
    budget.income = taxes.r + taxes.c + taxes.i + ordinances.income;
    budget.roads = Math.floor((roadLand + parkTiles) * state.funding.roads / NETWORK_UPKEEP_DIVISOR.roads);
    budget.highways = Math.floor(highwayLand * state.funding.highways / NETWORK_UPKEEP_DIVISOR.highways);
    budget.bridges = Math.floor(bridgeTiles * state.funding.bridges / NETWORK_UPKEEP_DIVISOR.bridges);
    budget.rail = Math.floor(railLand * state.funding.rail / NETWORK_UPKEEP_DIVISOR.rail);
    budget.subway = Math.floor(subwayTiles * state.funding.subway / NETWORK_UPKEEP_DIVISOR.subway);
    state.facilities.forEach((facility) => {
      const spec = FACILITY_KINDS[facility.kind];
      // SC2K power and water structures carry no monthly cost.
      if (spec.group === "utility" || !spec.upkeep) return;
      if (spec.group === "recreation") { budget.recreation += spec.upkeep; return; }
      const key = spec.group === "transport"
        ? (facility.kind === "station" ? "rail" : facility.kind === "subway-station" ? "subway" : "roads")
        : spec.group;
      if (Object.prototype.hasOwnProperty.call(budget, key) && state.funding[key] != null) budget[key] += Math.floor(spec.upkeep * state.funding[key] / 100);
      else budget.roads += Math.floor(spec.upkeep * state.funding.roads / 100);
    });
    for (const bond of state.bonds) budget.bondInterest += Math.ceil(bond.principal * bond.rate / 100 / MONTHS_PER_YEAR);
    budget.expense = budget.roads + budget.highways + budget.bridges + budget.rail + budget.subway + budget.tunnels
      + budget.police + budget.fire + budget.health + budget.schools + budget.colleges + budget.recreation + budget.bondInterest + budget.ordinanceCost;
    state.budget = budget; state.lastIncome = budget.income; state.lastExpense = budget.expense; state.funds += budget.income - budget.expense;
    pushEvent(state, "budget-settled", { ...budget, funds: state.funds }); pushEvent(state, "budget", { tick: state.tick, income: budget.income, expense: budget.expense, funds: state.funds });
    if (state.funds < 0 && !state.wasBroke) { state.wasBroke = true; pushNotice(state, "bonsai_msg_broke"); } if (state.funds >= 0) state.wasBroke = false;
    const report = cityReport(state); state.history.push({ tick: state.tick, population: state.population, jobs: state.jobs, funds: state.funds, demand: { ...state.demand }, pollution: report.pollution, crime: report.crime, fireRisk: report.fireRisk, happiness: report.happiness });
    if (state.history.length > MAX_HISTORY_MONTHS) state.history.shift();
    // Month-by-month funding history (SC2K budget service history): one record
    // per settlement, so the budget window can show each line's rate over time.
    state.budgetHistory.push({ month: Math.floor(state.tick / TICKS_PER_MONTH), funding: { ...state.funding }, income: budget.income, expense: budget.expense, funds: state.funds });
    if (state.budgetHistory.length > 60) state.budgetHistory.shift();
    state.rev += 1;
  }
  // Education and health by capacity (3.6): EQ and LE drift toward targets
  // set by how much of the demand the schools, universities, clinics and
  // hospitals can take at their funding; libraries and museums add a little.
  function serviceCapacity(state) {
    const out = { school: 0, university: 0, health: 0, eqBonus: 0 };
    for (const facility of state.facilities) {
      const spec = FACILITY_KINDS[facility.kind]; if (!spec) continue;
      const funding = spec.group && state.funding[spec.group] != null ? state.funding[spec.group] / 100 : 1;
      if (facility.kind === "school") out.school += spec.capacity * funding;
      else if (facility.kind === "university") out.university += spec.capacity * funding;
      else if (facility.kind === "clinic" || facility.kind === "hospital") out.health += spec.capacity * funding;
      if (spec.eqBonus) out.eqBonus += spec.eqBonus;
    }
    out.eqBonus = Math.min(15, out.eqBonus);
    return out;
  }
  function updateDemographics(state) {
    ensureDerived(state);
    let zoned = 0; let pollutionSum = 0;
    for (let i = 0, n = tileCount(state); i < n; i += 1) if (state.zone[i]) { zoned += 1; pollutionSum += state.pollution[i]; }
    const avgPollution = zoned ? Math.floor(pollutionSum / zoned) : 0;
    const capacity = serviceCapacity(state); const people = Math.max(1, state.population);
    const schoolShare = Math.min(1, capacity.school / (people * 0.18));
    const collegeShare = Math.min(1, capacity.university / (people * 0.08));
    const healthShare = Math.min(1, capacity.health / (people * 0.10));
    const eqTarget = Math.max(0, Math.min(150, Math.round(40 + 50 * schoolShare + 30 * collegeShare + capacity.eqBonus + (ordinanceOn(state, "proReading") ? 5 : 0))));
    const leTarget = Math.max(20, Math.min(90, Math.round(45 + 35 * healthShare - avgPollution / 10
      + (ordinanceOn(state, "cprTraining") ? 2 : 0) + (ordinanceOn(state, "freeClinics") ? 3 : 0) + (ordinanceOn(state, "publicSmokingBan") ? 2 : 0))));
    state.eq += Math.max(-2, Math.min(2, eqTarget - state.eq));
    state.le += Math.max(-2, Math.min(2, leTarget - state.le));
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
    // A building hit anywhere falls as a whole; the rest of its lot is left
    // as empty zoned land.
    if (state.lot[i]) clearLot(state, state.lot[i] - 1);
    state.zone[i] = 0; state.density[i] = 0; state.stage[i] = 0; state.buildingState[i] = 0;
    state.constructionTimer[i] = 0; state.tree[i] = 0; state.park[i] = 0;
    state.catalogId[i] = 1 + (i % 4);
  }
  // Where a disaster of this kind can happen, or why it cannot: a plant for
  // a meltdown or microwave spill, high ground for a volcano, salt water for
  // a hurricane, an airport for an air crash, a high-crime block for a riot.
  // Other kinds happen at the hint. Ties go to the tile nearest the hint.
  function disasterSite(state, kind, hint) {
    const hx = hint.x; const hy = hint.y;
    const nearest = (test) => {
      let best = -1; let bestDistance = Infinity;
      for (let i = 0, n = tileCount(state); i < n; i += 1) {
        if (!test(i)) continue;
        const { x, y } = xyOf(state, i); const distance = (x - hx) * (x - hx) + (y - hy) * (y - hy);
        if (distance < bestDistance) { best = i; bestDistance = distance; }
      }
      return best < 0 ? null : xyOf(state, best);
    };
    const plant = (plantKind) => {
      let best = null; let bestDistance = Infinity;
      for (const facility of state.facilities) {
        if (facility.kind !== plantKind) continue;
        const spec = FACILITY_KINDS[plantKind];
        const x = facility.x + (spec.w >> 1); const y = facility.y + (spec.h >> 1);
        const distance = (x - hx) * (x - hx) + (y - hy) * (y - hy);
        if (distance < bestDistance) { best = { x, y }; bestDistance = distance; }
      }
      return best;
    };
    let site = { x: hx, y: hy }; let reason = "";
    if (kind === "meltdown") { site = plant("nuclear"); reason = "needs-nuclear"; }
    else if (kind === "microwave-spill") { site = plant("microwave"); reason = "needs-microwave"; }
    else if (kind === "volcano") {
      let top = 0;
      for (let i = 0, n = tileCount(state); i < n; i += 1) if (!state.water[i] && state.alt[i] > top) top = state.alt[i];
      site = top >= DISASTER_RULES.volcanoAlt ? nearest((i) => !state.water[i] && state.alt[i] === top) : null;
      reason = "needs-high-ground";
    } else if (kind === "hurricane") { site = nearest((i) => state.water[i] && state.salt[i]); reason = "needs-coast"; }
    else if (kind === "air-crash") { site = nearest((i) => state.zone[i] === ZONE_AIRPORT); reason = "needs-airport"; }
    else if (kind === "riot") {
      let worst = 0;
      for (let i = 0, n = tileCount(state); i < n; i += 1) if (state.crime[i] > worst) worst = state.crime[i];
      site = worst >= DISASTER_RULES.riotCrime ? nearest((i) => state.crime[i] === worst) : null;
      reason = "needs-crime";
    }
    return site ? { ok: true, x: site.x, y: site.y } : { ok: false, reason };
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
    } else if (kind === "riot" || kind === "mass-floods") {
      // A riot ignites and burns the block it starts on; mass floods are
      // flood water over a wide area.
      const i = indexOf(state, x, y);
      if (kind === "riot") {
        const c = Math.max(6, Math.floor(tileCount(state) * 0.004));
        for (let n = 0; n < c; n += 1) {
          const j = Math.floor(nextRandom(state) * tileCount(state));
          if (!state.water[j] && (state.zone[j] || state.tree[j] || state.catalogId[j])) state.blaze[j] = 1;
        }
        if (!state.water[i]) state.blaze[i] = 1;
      } else {
        for (let dy = -8; dy <= 8; dy += 1) for (let dx = -8; dx <= 8; dx += 1) {
          if (Math.abs(dx) + Math.abs(dy) > 9 || !inBounds(state, x + dx, y + dy)) continue;
          const j = indexOf(state, x + dx, y + dy);
          if (!state.water[j] && Math.abs(state.alt[j] - state.alt[i]) <= 2) state.blaze[j] = 6;
        }
      }
    } else if (kind === "toxic-spill" || kind === "meltdown" || kind === "microwave-spill" || kind === "pollution-accident") {
      // A contamination ring: the affected tiles become toxic rubble and a
      // pollution plume is painted onto the pollution layer.
      const radius = spec.radius || 4;
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius || !inBounds(state, x + dx, y + dy)) continue;
        const j = indexOf(state, x + dx, y + dy);
        if (!state.water[j] && (state.zone[j] || state.tree[j] || state.catalogId[j] || state.facilityAt[j] >= 0)) clearTileToRubble(state, j);
        if (!state.water[j]) state.pollution[j] = Math.min(255, state.pollution[j] + 120);
      }
      state.blaze[indexOf(state, x, y)] = kind === "meltdown" ? 5 : 1;
    } else if (kind === "volcano") {
      // A volcano throws lava in a wide radius and ignites the ring.
      const radius = spec.radius;
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius || !inBounds(state, x + dx, y + dy)) continue;
        const j = indexOf(state, x + dx, y + dy);
        if (!state.water[j] && (state.zone[j] || state.tree[j] || state.catalogId[j] || state.facilityAt[j] >= 0)) clearTileToRubble(state, j);
        if (!state.water[j]) state.blaze[j] = (Math.abs(dx) + Math.abs(dy) <= 2) ? 5 : 1;
      }
    } else if (kind === "firestorm") {
      // A firestorm lights every flammable tile within its radius, then
      // burns and spreads like any fire; it no longer takes the whole map.
      const radius = spec.radius;
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius || !inBounds(state, x + dx, y + dy)) continue;
        const j = indexOf(state, x + dx, y + dy);
        if (!state.water[j] && isFlammable(state, j)) state.blaze[j] = 1;
      }
    } else if (kind === "hurricane") {
      // A hurricane floods the shoreline and clears the coast.
      for (let j = 0; j < tileCount(state); j += 1) {
        if (state.water[j]) continue;
        if (state.shore[j] || state.waterKind[j] === 4) state.blaze[j] = 6;
      }
    } else if (kind === "air-crash") {
      const radius = spec.radius;
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius || !inBounds(state, x + dx, y + dy)) continue;
        const j = indexOf(state, x + dx, y + dy);
        if (!state.water[j] && (state.zone[j] || state.tree[j] || state.catalogId[j] || state.facilityAt[j] >= 0)) clearTileToRubble(state, j);
        if (!state.water[j]) state.blaze[j] = 1;
      }
    }
    markDerivedDirty(state); ensureDerived(state); state.rev += 1;
    const kindKey = kind.replaceAll("-", "_");
    pushNotice(state, `bonsai_msg_disaster_${kindKey}`);
    publishNewspaper(state, [{ key: `disaster_${kindKey}`, x, y }], true);
  }
  function advanceDisaster(state) {
    const disaster = state.disaster;
    if (!disaster) return;
    const count = tileCount(state);
    let changed = false;
    if (disaster.kind === "fire" || disaster.kind === "earthquake" || disaster.kind === "firestorm") {
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
    } else if (disaster.kind === "tornado" || disaster.kind === "monster" || disaster.kind === "riot" || disaster.kind === "meltdown") {
      disaster.x = Math.max(0, Math.min(state.size - 1, disaster.x + Math.floor(nextRandom(state) * 3) - 1));
      disaster.y = Math.max(0, Math.min(state.size - 1, disaster.y + Math.floor(nextRandom(state) * 3) - 1));
      const targets = disaster.kind === "monster"
        ? [[0, 0], [1, 0], [0, 1]] : [[0, 0]];
      for (const [dx, dy] of targets) {
        if (!inBounds(state, disaster.x + dx, disaster.y + dy)) continue;
        const i = indexOf(state, disaster.x + dx, disaster.y + dy);
        if (disaster.kind === "meltdown") {
          if (!state.water[i]) state.pollution[i] = Math.min(255, state.pollution[i] + 40);
        } else if (!state.water[i] && (state.zone[i] || state.tree[i] || state.catalogId[i] || state.facilityAt[i] >= 0)) {
          clearTileToRubble(state, i); changed = true;
        }
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
    // Only a disaster whose cause is on the map can happen by itself.
    const i = Math.floor(nextRandom(state) * tileCount(state));
    const hint = xyOf(state, i);
    const kinds = Object.keys(DISASTER_KINDS).filter((kind) => disasterSite(state, kind, hint).ok);
    const kind = kinds[latticeInt(month, 431, state.seed) % kinds.length];
    const { x, y } = disasterSite(state, kind, hint);
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
      if (!state.powered[i] || !state.portOk[i]) continue;
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
      // Every tick: queued commands, disasters and moving things. Every day:
      // one development slice, then whatever it dirtied. Every four days: the
      // commute routing. Every month: environment, demand, books, charts.
      state.tick += 1; applyPendingCommands(state); advanceDisaster(state); advanceThings(state);
      if (state.tick % TICKS_PER_DAY === 0) {
        const day = state.tick / TICKS_PER_DAY;
        if (day % ROUTE_DAYS === 0) state.dirty |= DIRTY.ROUTES;
        developmentPass(state, day); ensureDerived(state, true); serviceDispatch(state); checkMilestones(state);
      }
      if (state.tick % TICKS_PER_MONTH === 0) {
        state.dirty |= DIRTY.ENV; maybeStartEmergentDisaster(state); retirePlants(state); updateDemographics(state); updateMicrosims(state); updateThings(state);
        recomputeDemand(state); settleBudget(state); recordGraphs(state); composeNewspaper(state); advanceScenario(state);
      }
    }
  }
  function dateOf(state) {
    const days = Math.floor(state.tick / TICKS_PER_DAY); const months = Math.floor(days / DAYS_PER_MONTH);
    const yearFounded = Number.isInteger(state.yearFounded) ? state.yearFounded : START_YEAR;
    return { day: (days % DAYS_PER_MONTH) + 1, month: months % MONTHS_PER_YEAR, year: yearFounded + Math.floor(months / MONTHS_PER_YEAR) };
  }

  // Deterministic weather, clean-room from the SC2K MISC weather field (12
  // types: cold, clear, hot, foggy, chilly, overcast, snow, rain, windy,
  // blizzard, hurricane, tornado). Pure: derived only from seed and tick, so
  // two runs with the same seed produce the same forecast. The type is
  // season-weighted so snowy months read cold, summer reads hot.
  const WEATHER_TYPES = Object.freeze([
    "cold", "clear", "hot", "foggy", "chilly", "overcast",
    "snow", "rain", "windy", "blizzard", "hurricane", "tornado",
  ]);
  // Season-weighted candidate pools: month 0=Jan .. 11=Dec.
  const SEASON_WEATHER = Object.freeze({
    winter: ["snow", "blizzard", "cold", "chilly", "overcast", "clear"],
    spring: ["rain", "windy", "overcast", "clear", "foggy", "cold"],
    summer: ["clear", "hot", "rain", "overcast", "windy", "foggy"],
    autumn: ["rain", "windy", "overcast", "clear", "chilly", "foggy"],
  });
  const seasonOf = (month) => (month < 2 || month === 11 ? "winter" : month < 5 ? "spring" : month < 8 ? "summer" : "autumn");
  const hashInt = (a, b, c) => {
    let h = (a * 0x9e3779b1) ^ (b * 0x85ebca6b) ^ (c * 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) >>> 0;
  };
  function weatherOf(state) {
    const date = dateOf(state);
    const pool = SEASON_WEATHER[seasonOf(date.month)];
    // Two stable hashes over (seed, year, month) and (seed, year, month, day)
    // give a type and a stability/intensity value; the day hash nudges the
    // type within a narrow band so a month does not read as one weather.
    const h0 = hashInt((state.seed ?? 0) >>> 0, date.year, date.month + 1);
    const h1 = hashInt((state.seed ?? 0) >>> 0, date.year * 13 + date.month, date.day + 1);
    const pick = pool[h0 % pool.length];
    // A day can shift one season-neighbour, so long stretches vary but stay
    // climatologically honest.
    const nudged = (h1 % 5 === 0) ? pool[(h0 + 1) % pool.length] : pick;
    return {
      type: nudged,
      temperature: weatherTemp(nudged, date.month),
      wind: 2 + (h1 % 38),
      humidity: 20 + (h1 % 70),
      season: seasonOf(date.month),
    };
  }
  function weatherTemp(type, month) {
    const base = [ -6, 2, 30, 10, 0, 8, -4, 12, 6, -8, 16, 10 ][month]; // avg Feb..Jan-ish by month index
    switch (type) {
      case "hot": return base + 14;
      case "snow":
      case "blizzard": return -12;
      case "cold": return base - 12;
      case "chilly": return base - 6;
      default: return base;
    }
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
  // --- City data windows: pure read models ------------------------------------
  // The Population, Industry, and Neighbors windows read these derivations.
  // All three are pure functions of saved state: no RNG state draws, no
  // mutation, nothing new enters a save. latticeInt is a stateless hash.
  const POPULATION_COHORTS = 10;
  function populationBreakdown(state) {
    const total = state.population + state.arcoPopulation;
    // Growth over the last budget year widens the young end of the pyramid;
    // life expectancy stretches the old end.
    const reference = state.history.length ? state.history[Math.max(0, state.history.length - 13)].population : state.population;
    const growthBias = reference > 0
      ? Math.max(-20, Math.min(20, Math.round((state.population - reference) * 100 / reference)))
      : (state.population > 0 ? 20 : 0);
    const weights = []; let weightSum = 0;
    for (let cohort = 0; cohort < POPULATION_COHORTS; cohort += 1) {
      const midAge = cohort * 10 + 5;
      const survival = Math.max(0, state.le + 8 - midAge);
      const youth = (POPULATION_COHORTS - 1 - cohort) * growthBias;
      const weight = Math.max(cohort === POPULATION_COHORTS - 1 ? 0 : 1, survival * 10 + youth);
      weights.push(weight); weightSum += weight;
    }
    let assigned = 0;
    const cohorts = weights.map((weight, cohort) => {
      const share = weightSum ? Math.floor(total * weight / weightSum) : 0;
      assigned += share;
      return { cohort, fromAge: cohort * 10, toAge: cohort === POPULATION_COHORTS - 1 ? null : cohort * 10 + 9, population: share };
    });
    cohorts[0].population += total - assigned;
    const workforce = Math.floor(state.population * state.workforcePercent / 100);
    return { total, cityPopulation: state.population, arcoPopulation: state.arcoPopulation,
      eq: state.eq, le: state.le, workforcePercent: state.workforcePercent, workforce,
      unemployed: state.unemployed, employed: Math.max(0, workforce - state.unemployed), growthBias, cohorts };
  }
  // Ten original industry sectors ride era curves over the city's current
  // year: each rises, peaks, and hands over to later technology. The ids are
  // ours; the shell owns the words for them.
  const INDUSTRY_SECTORS = Object.freeze([
    { id: "farming", rise: 1800, peak: 1900, fall: 2150, pollution: 2, cyclical: 1 },
    { id: "textiles", rise: 1840, peak: 1920, fall: 2080, pollution: 4, cyclical: 2 },
    { id: "steelworks", rise: 1870, peak: 1950, fall: 2090, pollution: 9, cyclical: 4 },
    { id: "chemicals", rise: 1890, peak: 1970, fall: 2150, pollution: 8, cyclical: 3 },
    { id: "machinery", rise: 1900, peak: 1980, fall: 2200, pollution: 6, cyclical: 4 },
    { id: "shipping", rise: 1850, peak: 1990, fall: 2400, pollution: 3, cyclical: 3 },
    { id: "media", rise: 1920, peak: 2020, fall: 2500, pollution: 1, cyclical: 2 },
    { id: "electronics", rise: 1950, peak: 2040, fall: 2500, pollution: 2, cyclical: 5 },
    { id: "aerospace", rise: 1960, peak: 2070, fall: 2600, pollution: 5, cyclical: 5 },
    { id: "biotech", rise: 1990, peak: 2100, fall: 2700, pollution: 1, cyclical: 3 },
  ]);
  function sectorEraWeight(year, sector) {
    if (year <= sector.rise || year >= sector.fall) return 0;
    return year <= sector.peak
      ? Math.round(100 * (year - sector.rise) / (sector.peak - sector.rise))
      : Math.round(100 * (sector.fall - year) / (sector.fall - sector.peak));
  }
  function industryBreakdown(state) {
    const year = dateOf(state).year;
    const clean = ordinanceOn(state, "pollutionControls");
    const raw = INDUSTRY_SECTORS.map((sector, index) => {
      let weight = sectorEraWeight(year, sector) + (latticeInt(index + 1, 11, state.seed) % 15);
      // The pollution-controls ordinance moves work from dirty stacks to
      // clean floors without inventing or destroying the total.
      if (clean) weight = Math.max(0, weight + (sector.pollution >= 6 ? -Math.floor(weight / 4) : Math.floor(weight / 6)));
      return weight;
    });
    const weightSum = raw.reduce((sum, weight) => sum + weight, 0) || 1;
    let assigned = 0;
    const sectors = INDUSTRY_SECTORS.map((sector, index) => {
      const jobs = Math.floor(state.iJobs * raw[index] / weightSum);
      assigned += jobs;
      const demand = Math.max(-100, Math.min(100, state.demand.i + Math.round(state.economyIndex * sector.cyclical / 5) - (clean && sector.pollution >= 6 ? 10 : 0)));
      return { id: sector.id, ratio: Math.round(raw[index] * 100 / weightSum), jobs, demand, pollution: sector.pollution };
    });
    sectors[0].jobs += Math.max(0, state.iJobs - assigned);
    return { year, iJobs: state.iJobs, cJobs: state.cJobs, economyIndex: state.economyIndex, demand: { ...state.demand }, cleanIndustry: clean, sectors };
  }
  // The four neighbouring cities ride the national clock (M4b-1). Each holds
  // its own steady share of the national population plus the pull of our own
  // growth; trade follows the road, rail, and highway tiles the player
  // actually built to that map edge, and every working port serves all four.
  const NEIGHBOR_DIRECTIONS = Object.freeze(["north", "east", "south", "west"]);
  const NEIGHBOR_NAME_COUNT = 12;
  function edgeConnections(state) {
    const last = state.size - 1;
    const out = { north: 0, east: 0, south: 0, west: 0 };
    const carries = (i) => (state.road[i] || state.rail[i] || state.highway[i] ? 1 : 0);
    for (let x = 0; x < state.size; x += 1) { out.north += carries(indexOf(state, x, 0)); out.south += carries(indexOf(state, x, last)); }
    for (let y = 0; y < state.size; y += 1) { out.west += carries(indexOf(state, 0, y)); out.east += carries(indexOf(state, last, y)); }
    return out;
  }
  // --- Advisors (3.12) ---------------------------------------------------------
  // Six advisors each name the one or two things that matter most right now.
  // The core only says which (a key), how bad (0 fine .. 3 urgent), the
  // numbers behind it and where to look; the shell owns the words.
  const ADVISOR_IDS = Object.freeze(["finance", "planning", "transport", "utilities", "safety", "health"]);
  function advisorReport(state) {
    ensureDerived(state);
    const n = tileCount(state); const size = state.size;
    const out = Object.fromEntries(ADVISOR_IDS.map((id) => [id, []]));
    const say = (advisor, key, severity, values = {}, at = null) => out[advisor].push({ advisor, key, severity, values, at });
    const where = (i) => (i >= 0 ? { x: i % size, y: Math.floor(i / size) } : null);
    // Finance: this year's books from the monthly history.
    const recent = state.budgetHistory.slice(-MONTHS_PER_YEAR);
    const income = recent.reduce((sum, item) => sum + (item.income || 0), 0);
    const expense = recent.reduce((sum, item) => sum + (item.expense || 0), 0);
    const net = income - expense;
    if (state.funds < 0) say("finance", "finance_in_debt", 3, { funds: state.funds, net });
    else if (recent.length && net < 0 && state.funds < -net * 2) say("finance", "finance_deficit", 3, { net, funds: state.funds, months: Math.floor(state.funds / Math.max(1, -net / 12)) });
    else if (recent.length && net < 0) say("finance", "finance_deficit", 2, { net, funds: state.funds, months: Math.floor(state.funds / Math.max(1, -net / 12)) });
    else if (recent.length >= 6 && income > 0 && net > income * 0.25) say("finance", "finance_surplus", 1, { net, income, funds: state.funds });
    const topTax = Math.max(state.taxRates.r, state.taxRates.c, state.taxRates.i);
    if (topTax >= 12) say("finance", "finance_tax_high", 2, { rate: topTax });
    if (state.bonds.length) say("finance", "finance_bonds", state.bonds.length >= 5 ? 2 : 1, { bonds: state.bonds.length, principal: state.bonds.reduce((sum, bond) => sum + bond.principal, 0) });
    // Planning and the rest walk the zoned land once.
    let zoned = 0; let empty = [0, 0, 0, 0]; let noRoad = 0; let noRoadAt = -1; let noCommute = 0; let noCommuteAt = -1;
    let unpowered = 0; let unpoweredAt = -1; let dry = 0; let dryAt = -1; let crimeSum = 0; let pollutionSum = 0; let valueSum = 0;
    let crimeWorst = -1; let crimeWorstAt = -1; let unpoliced = 0; let unpolicedAt = -1; let unfired = 0; let polluted = 0; let pollutedAt = -1;
    for (let i = 0; i < n; i += 1) {
      const z = state.zone[i]; if (z < ZONE_R || z > ZONE_I) continue;
      zoned += 1; crimeSum += state.crime[i]; pollutionSum += state.pollution[i]; valueSum += state.landValue[i];
      if (!state.lot[i]) empty[z] += 1;
      const code = state.problemCode[i];
      if (code === PROBLEM.NO_ROAD) { noRoad += 1; if (noRoadAt < 0) noRoadAt = i; }
      else if (code === PROBLEM.NO_COMMUTE) { noCommute += 1; if (noCommuteAt < 0) noCommuteAt = i; }
      else if (code === PROBLEM.NO_POWER) { unpowered += 1; if (unpoweredAt < 0) unpoweredAt = i; }
      if (state.density[i] === DENSITY_HIGH && !state.watered[i]) { dry += 1; if (dryAt < 0) dryAt = i; }
      if (state.crime[i] > crimeWorst) { crimeWorst = state.crime[i]; crimeWorstAt = i; }
      if (state.lot[i] && !state.policeStrength[i]) { unpoliced += 1; if (unpolicedAt < 0) unpolicedAt = i; }
      if (state.lot[i] && !state.fireStrength[i]) unfired += 1;
      if (z === ZONE_R && state.pollution[i] >= LOT_RULES.pollutionProblem) { polluted += 1; if (pollutedAt < 0) pollutedAt = i; }
    }
    const built = state.buildings.length;
    const avgCrime = zoned ? Math.round(crimeSum / zoned) : 0; const avgPollution = zoned ? Math.round(pollutionSum / zoned) : 0; const avgValue = zoned ? Math.round(valueSum / zoned) : 0;
    const demandKeys = ["", "r", "c", "i"];
    for (const z of [ZONE_R, ZONE_C, ZONE_I]) {
      const demand = state.demand[demandKeys[z]];
      if (demand >= 30 && empty[z] < 18) say("planning", `planning_zone_${demandKeys[z]}`, demand >= 60 ? 2 : 1, { demand, empty: empty[z] });
    }
    if (noCommute) say("planning", "planning_no_commute", noCommute >= 18 ? 3 : 2, { tiles: noCommute }, where(noCommuteAt));
    if (noRoad) say("planning", "planning_no_road", 2, { tiles: noRoad }, where(noRoadAt));
    if (built >= 20 && avgValue < LOT_RULES.midLandValue) say("planning", "planning_land_value_low", 1, { value: avgValue, needed: LOT_RULES.midLandValue });
    // Transport.
    let congestedRoads = 0; let congestedAt = -1; let roads = 0;
    for (let i = 0; i < n; i += 1) { if (state.road[i]) roads += 1; if (state.congested[i]) { congestedRoads += 1; if (congestedAt < 0) congestedAt = i; } }
    let homes = 0; let longCommutes = 0; let longAt = -1;
    for (const building of state.buildings) {
      if (building.zone !== ZONE_R || !lotOccupied(building.state) || building.access < 0) continue;
      homes += 1; const distance = state.distJobs[building.access];
      if (distance < ROUTE_UNREACHED && distance > COMMUTE_LIMIT * 0.75) { longCommutes += 1; if (longAt < 0) longAt = indexOf(state, building.x, building.y); }
    }
    if (congestedRoads) say("transport", "transport_congested", congestedRoads >= Math.max(12, roads / 10) ? 3 : 2, { roads: congestedRoads, share: roads ? Math.round(congestedRoads * 100 / roads) : 0 }, where(congestedAt));
    if (homes && longCommutes * 5 >= homes) say("transport", "transport_long_commutes", 2, { homes: longCommutes, share: Math.round(longCommutes * 100 / homes) }, where(longAt));
    const transit = state.busService.depots + state.railService.connectedStations + state.subwayService.connectedStations + (state.highwayService.inService ? 1 : 0);
    if (state.population >= 10000 && !transit) say("transport", "transport_no_transit", 2, { population: state.population });
    // Utilities.
    // No plant at all: the grid reports neither supply nor demand, so this
    // has to be told before "short" or "not connected" can mean anything.
    if (!state.powerCapacity) { if (zoned) say("utilities", "utilities_no_plant", 3, { tiles: zoned }, where(unpoweredAt)); }
    else if (state.powerDemand > state.powerCapacity) say("utilities", "utilities_power_short", 3, { demand: state.powerDemand, capacity: state.powerCapacity }, where(unpoweredAt));
    else if (state.powerCapacity && state.powerDemand > state.powerCapacity * 0.9) say("utilities", "utilities_power_tight", 2, { demand: state.powerDemand, capacity: state.powerCapacity });
    // Enough power, but some zones are not on the grid: SC2K's "some zones
    // have no power" — a line is missing, not a plant.
    if (unpowered && state.powerCapacity && state.powerDemand <= state.powerCapacity) say("utilities", "utilities_unconnected", unpowered >= 18 ? 3 : 2, { tiles: unpowered }, where(unpoweredAt));
    if (state.waterDemand > state.waterCapacity && dry) say("utilities", "utilities_water_short", 2, { demand: state.waterDemand, capacity: state.waterCapacity }, where(dryAt));
    else if (dry >= 9) say("utilities", "utilities_dense_dry", 1, { tiles: dry }, where(dryAt));
    const aging = state.facilities.filter((facility) => FACILITY_KINDS[facility.kind].lifespan && state.tick - (facility.builtTick || 0) >= PLANT_LIFESPAN_TICKS - 5 * MONTHS_PER_YEAR * TICKS_PER_MONTH);
    if (aging.length) say("utilities", "utilities_plant_aging", 2, { plants: aging.length }, { x: aging[0].x, y: aging[0].y });
    // Safety.
    if (built >= 10 && avgCrime >= 45) say("safety", "safety_crime_high", avgCrime >= 70 ? 3 : 2, { crime: avgCrime }, where(crimeWorstAt));
    const zonedBuilt = state.buildings.reduce((sum, building) => sum + building.w * building.h, 0);
    if (zonedBuilt >= 20 && unpoliced * 3 >= zonedBuilt) say("safety", "safety_no_police", 2, { share: Math.round(unpoliced * 100 / zonedBuilt) }, where(unpolicedAt));
    if (zonedBuilt >= 20 && unfired * 3 >= zonedBuilt) say("safety", "safety_no_fire", 1, { share: Math.round(unfired * 100 / zonedBuilt) });
    // Health and education.
    const capacity = serviceCapacity(state); const people = state.population;
    if (people >= 2000 && capacity.school < people * 0.18) say("health", "health_schools_short", people >= 8000 ? 2 : 1, { seats: Math.round(capacity.school), needed: Math.round(people * 0.18), eq: state.eq });
    if (people >= 2000 && capacity.health < people * 0.10) say("health", "health_hospitals_short", people >= 8000 ? 2 : 1, { beds: Math.round(capacity.health), needed: Math.round(people * 0.10), le: state.le });
    if (people >= 20000 && capacity.university < people * 0.08) say("health", "health_university_short", 1, { seats: Math.round(capacity.university), needed: Math.round(people * 0.08) });
    if (polluted) say("health", "health_pollution", polluted >= 18 ? 2 : 1, { tiles: polluted, pollution: avgPollution }, where(pollutedAt));
    const advisors = ADVISOR_IDS.map((id) => {
      const items = out[id].sort((a, b) => b.severity - a.severity).slice(0, 2);
      return { id, severity: items.length ? items[0].severity : 0, items: items.length ? items : [{ advisor: id, key: `${id}_ok`, severity: 0, values: {}, at: null }] };
    });
    const top = advisors.flatMap((advisor) => advisor.items).sort((a, b) => b.severity - a.severity)[0];
    return { advisors, top, figures: { income, expense, net, population: people, avgCrime, avgPollution, avgValue, congestedRoads, longCommutes, homes } };
  }

  function neighborsReport(state) {
    ensureDerived(state);
    const connections = edgeConnections(state);
    let seaportTiles = 0; let airportTiles = 0;
    for (let i = 0; i < tileCount(state); i += 1) {
      if (!state.powered[i] || !state.portOk[i]) continue;
      if (state.zone[i] === ZONE_SEAPORT) seaportTiles += 1; else if (state.zone[i] === ZONE_AIRPORT) airportTiles += 1;
    }
    const portTrade = Math.floor(seaportTiles / 2) * 5 + Math.floor(airportTiles / 3) * 4;
    const takenNames = new Set();
    const neighbors = NEIGHBOR_DIRECTIONS.map((direction, index) => {
      const salt = latticeInt(index + 1, 23, state.seed);
      let nameIndex = salt % NEIGHBOR_NAME_COUNT;
      while (takenNames.has(nameIndex)) nameIndex = (nameIndex + 1) % NEIGHBOR_NAME_COUNT;
      takenNames.add(nameIndex);
      const population = Math.floor(state.nationalPopulation * (30 + (salt % 45)) / 1000)
        + Math.floor(state.population * (10 + ((salt >> 8) % 12)) / 64);
      const linked = connections[direction] > 0;
      const trade = (linked ? connections[direction] * 6 + Math.floor(Math.min(state.railService.freightCapacity, 400) / 8) : 0) + portTrade;
      return { direction, nameIndex, population, connections: connections[direction], linked, trade };
    });
    return { nationalPopulation: state.nationalPopulation, months: Math.floor(state.tick / TICKS_PER_MONTH),
      seaportTiles, airportTiles, neighborTotal: neighbors.reduce((sum, item) => sum + item.population, 0), neighbors };
  }
  function tileInfo(state, x, y) {
    if (!inBounds(state, x, y)) return null; ensureDerived(state); const i = indexOf(state, x, y); const facility = state.facilityAt[i] >= 0 ? state.facilities[state.facilityAt[i]] : null; const code = state.problemCode[i];
    return { x, y, terrain: state.terrain[i], alt: state.alt[i], water: !!state.water[i], shore: !!state.shore[i], slope: state.slope[i], tree: !!state.tree[i],
      catalogId: state.catalogId[i], subway: state.subway[i], waterLevel: state.waterLevel[i], salt: !!state.salt[i], waterKind: state.waterKind[i],
      highway: !!state.highway[i], onramp: !!state.onramp[i],
      road: !!state.road[i], rail: !!state.rail[i], railConnected: !!state.railConnected[i], railOk: !!state.railOk[i], wire: !!state.wire[i], pipe: !!state.pipe[i], park: !!state.park[i], over: state.over[i], zone: state.zone[i], density: state.density[i],
      stage: state.stage[i], buildingState: state.buildingState[i], buildingId: state.buildingId[i], buildingAnchor: state.buildingAnchor[i], powered: !!state.powered[i], watered: !!state.watered[i], roadOk: !!state.roadOk[i],
      traffic: state.traffic[i], congested: !!state.congested[i], policeCovered: !!state.policeCovered[i], fireCovered: !!state.fireCovered[i],
      policeStrength: state.policeStrength[i], fireStrength: state.fireStrength[i], educationCovered: !!state.educationCovered[i], healthCovered: !!state.healthCovered[i],
      landValue: state.landValue[i], pollution: state.pollution[i], crime: state.crime[i], fireRisk: state.fireRisk[i], happiness: state.happiness[i], facility: facility ? facility.kind : null,
      microsim: facility ? (state.microsims.find((record) => record.kind === facility.kind && record.x === facility.x && record.y === facility.y) || null) : null,
      plant: facility && PLANT_KINDS[facility.kind] ? facility.kind : null, service: facility && SERVICE_KINDS[facility.kind] ? facility.kind : null,
      facilityFootprint: facility ? { ...footprintOf(facility), legacy: !!(LEGACY_FOOTPRINTS[facility.kind] && !Number.isInteger(facility.w)) } : null,
      lot: lotInfo(state, i),
      problem: code ? { code: PROBLEM_NAMES[code], x, y, action: PROBLEM_ACTIONS[code] } : null };
  }

  // The query panel's view of the building on a tile (3.12): its size, tier,
  // residents or jobs, and whether its commute reaches anyone.
  function lotInfo(state, i) {
    const zone = state.zone[i]; if (zone < ZONE_R || zone > ZONE_I) return null;
    const building = state.lot[i] && state.buildingId[i] >= 0 ? state.buildings[state.buildingId[i]] : null;
    const access = building ? building.access : state.accessRoad[i];
    const distance = access < 0 ? null : zone === ZONE_R ? state.distJobs[access] : state.distHomes[access];
    return { built: !!building, x: building ? building.x : i % state.size, y: building ? building.y : Math.floor(i / state.size),
      size: building ? building.w : 0, tier: building ? building.tier : 0, state: building ? building.state : 0,
      residents: building ? building.population : 0, jobs: building ? building.jobs : 0,
      access: access >= 0, commute: commuteOk(state, zone, access), commuteDistance: distance === null || distance >= ROUTE_UNREACHED ? null : distance };
  }

  // Routes have memory: the next pass prices roads using the previous
  // congestion, and development reads the last scheduled distance fields.
  function serializeRouting(state) {
    return { version: 1, traffic: Array.from(state.traffic), congested: Array.from(state.congested),
      distJobs: Array.from(state.distJobs), distHomes: Array.from(state.distHomes), sources: { ...state.routeSources },
      railRiders: state.railService.riders, subwayRiders: state.subwayService.riders,
      highwayTrips: state.highwayService.roadTrafficRelief };
  }
  function restoreRouting(state, data) {
    if (data === undefined) return; // Older v5 saves rebuild once, then retain routing on their next save.
    const count = tileCount(state);
    if (!data || data.version !== 1 || !data.sources) throw new Error("bonsai-import-invalid: routing");
    for (const key of ["jobs", "homes"]) if (!Number.isInteger(data.sources[key]) || data.sources[key] < 0 || data.sources[key] > count) throw new Error("bonsai-import-invalid: routing-sources");
    for (const key of ["railRiders", "subwayRiders", "highwayTrips"]) if (!Number.isSafeInteger(data[key]) || data[key] < 0) throw new Error("bonsai-import-invalid: routing-riders");
    state.traffic = readLayer(data, "traffic", count, 65535, Uint16Array);
    state.congested = readLayer(data, "congested", count, 1);
    state.distJobs = readLayer(data, "distJobs", count * 3, ROUTE_UNREACHED, Uint16Array);
    state.distHomes = readLayer(data, "distHomes", count * 3, ROUTE_UNREACHED, Uint16Array);
    state.routeSources = { ...data.sources };
    state.railService.riders = state.railService.roadTrafficRelief = data.railRiders;
    state.subwayService.riders = state.subwayService.roadTrafficRelief = data.subwayRiders;
    state.highwayService.roadTrafficRelief = data.highwayTrips;
    recomputeProblems(state);
  }

  function serialize(state) {
    return { format: FORMAT, version: 5, rulesetVersion: 5, name: state.name, seed: state.seed, rngState: state.rngState | 0, size: state.size, terrainPreset: state.terrainPreset, yearFounded: state.yearFounded,
      tick: state.tick, funds: state.funds, taxRate: state.taxRate, taxRates: { ...state.taxRates }, bonds: state.bonds.map((item) => ({ ...item })), ordinances: { ...state.ordinances },
      eq: state.eq, le: state.le, workforcePercent: state.workforcePercent, unemployed: state.unemployed, nationalPopulation: state.nationalPopulation,
      demand: { ...state.demand }, economyIndex: state.economyIndex,
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
      highway: Array.from(state.highway), onramp: Array.from(state.onramp), lot: Array.from(state.lot),
      // The monthly environment is saved so a reopened city shows (and taxes)
      // the same land value, crime and pollution it had.
      landValue: Array.from(state.landValue), crime: Array.from(state.crime), pollution: Array.from(state.pollution),
      routing: serializeRouting(state),
      rotate: Array.from(state.rotate), tunnel: Array.from(state.tunnel), waterKind: Array.from(state.waterKind), blaze: Array.from(state.blaze),
      disaster: state.disaster ? { ...state.disaster } : null, disastersOff: state.disastersOff,
      newspaper: cloneJson(state.newspaper), paperDelivery: state.paperDelivery, newsMemo: cloneJson(state.newsMemo),
      scenario: state.scenario ? cloneJson(state.scenario) : null,
      view: { ...state.view }, budgetHistory: state.budgetHistory.map((item) => ({ ...item })), militaryBase: state.militaryBase,
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
  // v5 (ruleset 5) groups the per-tile buildings of v4 into lots with the
  // old grouping rule; isolated tiles become 1x1 lots and the size is
  // written back to stage. Funds and everything else carry over.
  function migrateEngineV4To5(data) {
    if (!data || data.format !== FORMAT || data.version !== 4) throw new Error("bonsai-import-invalid: v4");
    if (!SUPPORTED_SIZES.includes(data.size)) throw new Error("bonsai-import-invalid: size");
    const count = data.size * data.size;
    const layer = (key) => (Array.isArray(data[key]) && data[key].length === count ? data[key] : new Array(count).fill(0));
    const zone = layer("zone"); const density = layer("density"); const stage = layer("stage"); const buildingState = layer("buildingState");
    // An importer that already knows its buildings (.sc2) hands the lots in.
    const grouped = Array.isArray(data.lot) && data.lot.length === count
      ? { lot: Uint16Array.from(data.lot), stage: Uint8Array.from(stage) }
      : inferLots(data.size, { zone, density, stage, buildingState });
    const outStage = stage.slice(); const outState = buildingState.slice(); const outTimer = layer("constructionTimer").slice();
    for (let i = 0; i < count; i += 1) {
      if (grouped.lot[i]) { outStage[i] = grouped.stage[i]; if (outState[i] === BUILDING_EMPTY) outState[i] = BUILDING_ACTIVE; outTimer[i] = 0; }
      else if (zone[i] >= ZONE_R && zone[i] <= ZONE_I) { outStage[i] = 0; outState[i] = 0; outTimer[i] = 0; }
    }
    // A grouped lot takes its anchor's state on every cell.
    for (let i = 0; i < count; i += 1) if (grouped.lot[i]) outState[i] = outState[grouped.lot[i] - 1];
    return { ...cloneJson(data), version: 5, rulesetVersion: 5, lot: Array.from(grouped.lot), stage: outStage, buildingState: outState, constructionTimer: outTimer };
  }
  function migrateEngineV3To4(data) {
    if (!data || data.format !== FORMAT || data.version !== 3) throw new Error("bonsai-import-invalid: v3");
    // v4 adds the saved camera, the month-by-month funding history, and the
    // military base lifecycle. A v3 city gets safe defaults; nothing is lost.
    return { ...cloneJson(data), version: 4, rulesetVersion: 4,
      view: { panX: 0, panY: 0, zoom: 0.82 },
      budgetHistory: [], militaryBase: 0 };
  }

  function deserialize(input) {
    let data = input && input.version === 1 ? migrateEngineV1(input) : input;
    if (data && data.version === 2) data = migrateEngineV2To3(data);
    if (data && data.version === 3) data = migrateEngineV3To4(data);
    if (data && data.version === 4) data = migrateEngineV4To5(data);
    if (!data || data.format !== FORMAT) throw new Error("bonsai-import-invalid: format"); if (data.version > 5) throw new Error("bonsai-import-version-too-new");
    if (data.version !== 5 || data.rulesetVersion !== 5) throw new Error("bonsai-import-version"); if (!SUPPORTED_SIZES.includes(data.size)) throw new Error("bonsai-import-invalid: size");
    if (!Number.isInteger(data.tick) || data.tick < 0 || !Number.isInteger(data.funds)) throw new Error("bonsai-import-invalid: scalar");
    const state = createCity({ seed: Number.isInteger(data.seed) ? data.seed : 0, size: data.size, terrainPreset: TERRAIN_PRESETS.includes(data.terrainPreset) ? data.terrainPreset : "balanced", name: typeof data.name === "string" ? data.name : "",
      yearFounded: Number.isInteger(data.yearFounded) && data.yearFounded >= 1000 && data.yearFounded <= 2999 ? data.yearFounded : START_YEAR });
    const count = data.size * data.size; state.rngState = Number.isInteger(data.rngState) ? data.rngState | 0 : state.seed | 0; state.tick = data.tick; state.funds = data.funds;
    state.taxRate = Number.isInteger(data.taxRate) ? data.taxRate : DEFAULT_TAX; state.speed = 0; state.milestone = data.milestone || 0;
    state.wasBroke = !!data.wasBroke; state.brownout = !!data.brownout; state.waterShortage = !!data.waterShortage;
    state.spawnCenter = data.spawnCenter && Number.isInteger(data.spawnCenter.x) && Number.isInteger(data.spawnCenter.y) ? { ...data.spawnCenter } : findSpawnCenter(state);
    state.view = data.view && Number.isFinite(data.view.panX) && Number.isFinite(data.view.panY) && Number.isFinite(data.view.zoom)
      ? { panX: data.view.panX, panY: data.view.panY, zoom: Math.max(0.4, Math.min(2.5, data.view.zoom)) }
      : { panX: 0, panY: 0, zoom: 0.82 };
    state.militaryBase = Number.isInteger(data.militaryBase) && data.militaryBase >= 0 && data.militaryBase <= 6 ? data.militaryBase : 0;
    state.budgetHistory = Array.isArray(data.budgetHistory) ? data.budgetHistory.slice(0, 60).map((item) => ({ ...item })) : [];
    state.terrain = readLayer(data, "terrain", count, 3); state.alt = readLayer(data, "alt", count, MAX_ALT); state.water = readLayer(data, "water", count, 1); state.shore = readLayer(data, "shore", count, 1);
    state.slope = readLayer(data, "slope", count, 15); state.tree = readLayer(data, "tree", count, 1); state.road = readLayer(data, "road", count, 1); state.rail = readLayer(data, "rail", count, 1);
    state.wire = readLayer(data, "wire", count, 1); state.pipe = readLayer(data, "pipe", count, 1); state.park = readLayer(data, "park", count, 1); state.zone = readLayer(data, "zone", count, MAX_ZONE);
    state.density = readLayer(data, "density", count, DENSITY_HIGH); state.stage = readLayer(data, "stage", count, MAX_STAGE); state.buildingState = readLayer(data, "buildingState", count, BUILDING_RECOVERING);
    state.constructionTimer = readLayer(data, "constructionTimer", count, 65535, Uint16Array); state.variant = readLayer(data, "variant", count, 255);
    state.catalogId = readLayer(data, "catalogId", count, 255); state.subway = readLayer(data, "subway", count, 63); state.waterLevel = readLayer(data, "waterLevel", count, MAX_ALT);
    state.highway = readLayer(data, "highway", count, 1); state.onramp = readLayer(data, "onramp", count, 1);
    state.lot = readLayer(data, "lot", count, count, Uint16Array);
    const savedEnvironment = ["landValue", "crime", "pollution"].every((key) => Array.isArray(data[key]) && data[key].length === count);
    if (savedEnvironment) { state.landValue = readLayer(data, "landValue", count, 255); state.crime = readLayer(data, "crime", count, 255); state.pollution = readLayer(data, "pollution", count, 255); }
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
      const record = { kind: item.kind, x: item.x, y: item.y, builtTick: Number.isInteger(item.builtTick) ? item.builtTick : 0 };
      if (Number.isInteger(item.w) && Number.isInteger(item.h) && item.w > 0 && item.h > 0) { record.w = item.w; record.h = item.h; }
      state.facilities.push(record);
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
    // Additive v3 fields (city data windows): the demand gauge and the
    // economy index used to reset to defaults until the next month boundary.
    // Older saves without them keep exactly that behavior.
    state.economyIndex = scalar(data.economyIndex, -100, 100, 0);
    if (data.demand && typeof data.demand === "object") {
      state.demand = { r: scalar(data.demand.r, -100, 100, 55), c: scalar(data.demand.c, -100, 100, 30), i: scalar(data.demand.i, -100, 100, 35) };
    }
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
    repairLots(state);
    markDerivedDirty(state, savedEnvironment ? DIRTY_STRUCTURE : DIRTY_ALL); ensureDerived(state);
    restoreRouting(state, data.routing);
    state.rev = 1; return state;
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
      if (!envelope.engine || ![1, 2, 3, 4, 5].includes(envelope.engine.rulesetVersion)) errors.push("ruleset-version"); if (!envelope.simulation || typeof envelope.simulation.seed !== "number") errors.push("simulation-seed");
      if (!envelope.payload || typeof envelope.payload !== "object") errors.push("payload"); if (!envelope.integrity || envelope.integrity.algorithm !== INTEGRITY_ALGORITHM) errors.push("integrity-algorithm");
      if (!envelope.integrity || envelope.integrity.canonicalization !== CANONICALIZATION) errors.push("integrity-canonicalization"); if (!envelope.integrity || !/^[a-f0-9]{64}$/i.test(String(envelope.integrity.digest))) errors.push("integrity-digest");
    }
    return { valid: !errors.length, errors };
  }
  function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
  function migrateSave(envelope) {
    if (!envelope || envelope.format !== FORMAT) throw new Error("bonsai-save-invalid: format"); if (envelope.formatVersion > SAVE_FORMAT_VERSION) throw new Error("bonsai-save-version-too-new");
    if (envelope.formatVersion === SAVE_FORMAT_VERSION) return envelope;
    if (![1, 2, 3, 4].includes(envelope.formatVersion)) throw new Error("bonsai-save-version-unsupported");
    const from = envelope.formatVersion; const out = cloneJson(envelope);
    if (out.formatVersion === 1) { out.formatVersion = 2; out.payload = migrateEngineV1(out.payload); }
    if (out.formatVersion === 2) { out.formatVersion = 3; out.payload = migrateEngineV2To3(out.payload); }
    if (out.formatVersion === 3) { out.formatVersion = 4; out.payload = migrateEngineV3To4(out.payload); }
    out.formatVersion = 5; out.payload = migrateEngineV4To5(out.payload);
    out.engine = { rulesetVersion: 5, fixedTickHz: 20, ticksPerDay: 5, daysPerMonth: 25 };
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

  // The SC2K-resolution derived grids: traffic at 64x64 (XTRF) and pollution,
  // land value, crime, police strength, and fire strength at 32x32 (XPLT,
  // XVAL, XCRM, XPLC, XFIR). Each cell is the mean of the source tiles it
  // covers on our map, whatever its size; coverage is 0 or 255 per tile so
  // the mean reads as strength. A pure read: the codec writes these on
  // export and may seed the display from them on import.
  const SC2_GRID_SIDES = Object.freeze({ traffic: 64, pollution: 32, landValue: 32, crime: 32, police: 32, fire: 32 });
  function downsampleLayer(state, layer, side, scale) {
    const out = new Uint8Array(side * side);
    for (let gy = 0; gy < side; gy += 1) for (let gx = 0; gx < side; gx += 1) {
      const x0 = Math.floor(gx * state.size / side); const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * state.size / side));
      const y0 = Math.floor(gy * state.size / side); const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * state.size / side));
      let sum = 0; let n = 0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { sum += layer[indexOf(state, x, y)] * scale; n += 1; }
      out[gy * side + gx] = Math.min(255, Math.round(sum / n));
    }
    return out;
  }
  function sc2DerivedGrids(state) {
    ensureDerived(state);
    return {
      traffic: downsampleLayer(state, state.traffic, SC2_GRID_SIDES.traffic, 1),
      pollution: downsampleLayer(state, state.pollution, SC2_GRID_SIDES.pollution, 1),
      landValue: downsampleLayer(state, state.landValue, SC2_GRID_SIDES.landValue, 1),
      crime: downsampleLayer(state, state.crime, SC2_GRID_SIDES.crime, 1),
      police: downsampleLayer(state, state.policeCovered, SC2_GRID_SIDES.police, 255),
      fire: downsampleLayer(state, state.fireCovered, SC2_GRID_SIDES.fire, 255),
    };
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
    ensureDerived(state); return { size: state.size, tick: state.tick, seed: state.seed, rev: state.rev, timeOfDay: (state.tick % 150) / 150, weather: weatherOf(state), spawnCenter: { ...state.spawnCenter },
      terrain: state.terrain, alt: state.alt, water: state.water, shore: state.shore, slope: state.slope, tree: state.tree, road: state.road, rail: state.rail, wire: state.wire, pipe: state.pipe, park: state.park, over: state.over,
      zone: state.zone, density: state.density, stage: state.stage, buildingState: state.buildingState, variant: state.variant, traffic: state.traffic, congested: state.congested, powered: state.powered, watered: state.watered,
      railConnected: state.railConnected, railOk: state.railOk, landValue: state.landValue,
      policeCovered: state.policeCovered, fireCovered: state.fireCovered, educationCovered: state.educationCovered, healthCovered: state.healthCovered,
      pollution: state.pollution, crime: state.crime, fireRisk: state.fireRisk, happiness: state.happiness, problemCode: state.problemCode, buildingId: state.buildingId, buildingAnchor: state.buildingAnchor, buildings: state.buildings,
      catalogId: state.catalogId, subway: state.subway, waterLevel: state.waterLevel, salt: state.salt, rotate: state.rotate, tunnel: state.tunnel, waterKind: state.waterKind,
      highway: state.highway, onramp: state.onramp,
      blaze: state.blaze, disaster: state.disaster ? { ...state.disaster } : null,
      facilityAt: state.facilityAt, plantAt: state.plantAt, serviceAt: state.serviceAt, facilities: state.facilities.map((item) => ({ ...item, footprint: footprintOf(item) })), plants: state.plants, services: state.services, lot: state.lot,
      railService: { ...state.railService }, subwayService: { ...state.subwayService }, busService: { ...state.busService },
      things: state.things.map((item) => ({ kind: item.kind, x: item.x, y: item.y, z: item.z, dir: item.dir })),
      agents: derivedAgentFacts(state) };
  }

  window.AISystem6BonsaiSim = Object.freeze({
    SIZE, DEFAULT_SIZE, SUPPORTED_SIZES, TERRAIN_PRESETS, MAX_ALT, MAX_STAGE, FORMAT, SAVE_VERSION, COMMAND_SCHEMA_VERSION, EVENT_SCHEMA_VERSION, ENGINE_RULESET_VERSION,
    DAYS_PER_MONTH, MONTHS_PER_YEAR, YEAR_FOUNDED_CHOICES, ORDINANCES, ORDINANCE_IDS, BOND_PRINCIPAL, MAX_BONDS, GRAPH_SERIES, GRAPH_TIERS, REWARD_TIERS, MICROSIM_KINDS, DISASTER_KINDS, DISASTER_RULES, disasterSite, NEWS_STORY_KEYS, TECHS, ARCO_KINDS,
    FIXED_TICK_HZ, TICKS_PER_DAY, SAVE_FORMAT_VERSION, INTEGRITY_ALGORITHM, CANONICALIZATION, CONGESTION_THRESHOLD, COSTS, unitCost, TOOLS, FACILITY_KINDS, SERVICE_KINDS, PLANT_KINDS, FUNDING_SERVICES,
    OVER: Object.freeze({ NONE: 0, ROAD: 1, WIRE: 2, PARK: 3, ROADWIRE: 4 }), ZONE: Object.freeze({ NONE: 0, R: 1, C: 2, I: 3, MILITARY: 4, AIRPORT: 5, SEAPORT: 6 }), DENSITY: Object.freeze({ NONE: 0, LOW: 1, HIGH: 2 }),
    BUILDING_STATE: Object.freeze({ EMPTY: 0, FOUNDATION: 1, CONSTRUCTION: 2, ACTIVE: 3, DECLINING: 4, ABANDONED: 5, RECOVERING: 6 }), PROBLEM,
    EXAMPLES, SCENARIOS, createScenarioCity, createCity, replayExampleCity, createExampleCity, advanceTicks, applyTool, previewCommand, submitCommand, undo, redo, drainEvents, canonicalStringify, checkpoint, encodeSave, decodeSave, validateSaveEnvelope, migrateSave,
    cityReport, populationBreakdown, industryBreakdown, neighborsReport, INDUSTRY_SECTORS, NEIGHBOR_DIRECTIONS, NEIGHBOR_NAME_COUNT,
    tileInfo, footprintOf, LEGACY_FOOTPRINTS, sc2DerivedGrids, SC2_GRID_SIDES, ensureDerived, dateOf, drainNotices, derivedAgentFacts, buildRenderSnapshot, serialize, deserialize,
    weatherOf, WEATHER_TYPES,
    ADVISOR_IDS, advisorReport,
    LOT_CAPACITY, LOT_RULES, COMMUTE_LIMIT, ROAD_REACH, PORT_REACH, ROUTE_COST, HIGHWAY_CAPACITY, lotCapacity, demandReport: demandInternals,
    // Marks every derived system stale, for tools and tests that edit layers
    // directly; the next read recomputes them.
    invalidateDerived: (state) => { markDerivedDirty(state, DIRTY_ALL); repairLots(state); },
  });
})();
