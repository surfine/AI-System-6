// Engine-only entry for the vendored Micropolis bundle (GPL v3 + additional
// terms; see the NOTICE.md beside the built file). It exports the simulation
// and rendering core of graememcc/micropolisJS and deliberately excludes the
// upstream UI layer: game.js, splashScreen.js, infoBar.js, inputStatus.js,
// notification.js, rci.js, every *Window.js, storage.js (localStorage),
// text.js (upstream English strings), queryTool.js (jQuery-bound), and
// monsterTV.js. AI System 6 owns every user-facing surface and string.
import { AnimationManager } from "../../external/micropolisjs/src/animationManager.js";
import { BaseTool } from "../../external/micropolisjs/src/baseTool.js";
import { BuildingTool } from "../../external/micropolisjs/src/buildingTool.js";
import { BulldozerTool } from "../../external/micropolisjs/src/bulldozerTool.js";
import { EventEmitter } from "../../external/micropolisjs/src/eventEmitter.js";
import { GameCanvas } from "../../external/micropolisjs/src/gameCanvas.js";
import { GameMap } from "../../external/micropolisjs/src/gameMap.js";
import { MapGenerator } from "../../external/micropolisjs/src/mapGenerator.js";
import * as Messages from "../../external/micropolisjs/src/messages.ts";
import { ParkTool } from "../../external/micropolisjs/src/parkTool.js";
import { RailTool } from "../../external/micropolisjs/src/railTool.js";
import { Random } from "../../external/micropolisjs/src/random.ts";
import { RoadTool } from "../../external/micropolisjs/src/roadTool.js";
import { Simulation } from "../../external/micropolisjs/src/simulation.js";
import { TileSet } from "../../external/micropolisjs/src/tileSet.js";
import * as TileValues from "../../external/micropolisjs/src/tileValues.ts";
import { WireTool } from "../../external/micropolisjs/src/wireTool.js";

// Replicates upstream GameTools without the jQuery-bound QueryTool. The shell
// reads map and block-map data directly for its own query display.
function createTools(map) {
  return {
    airport: new BuildingTool(10000, TileValues.AIRPORT, map, 6, false),
    bulldozer: new BulldozerTool(map),
    coal: new BuildingTool(3000, TileValues.POWERPLANT, map, 4, false),
    commercial: new BuildingTool(100, TileValues.COMCLR, map, 3, false),
    fire: new BuildingTool(500, TileValues.FIRESTATION, map, 3, false),
    industrial: new BuildingTool(100, TileValues.INDCLR, map, 3, false),
    nuclear: new BuildingTool(5000, TileValues.NUCLEAR, map, 4, true),
    park: new ParkTool(map),
    police: new BuildingTool(500, TileValues.POLICESTATION, map, 3, false),
    port: new BuildingTool(3000, TileValues.PORT, map, 4, false),
    rail: new RailTool(map),
    residential: new BuildingTool(100, TileValues.FREEZ, map, 3, false),
    road: new RoadTool(map),
    stadium: new BuildingTool(5000, TileValues.STADIUM, map, 4, false),
    wire: new WireTool(map),
  };
}

export {
  AnimationManager,
  BaseTool,
  createTools,
  EventEmitter,
  GameCanvas,
  GameMap,
  MapGenerator,
  Messages,
  // Random carries the AI System 6 setRandomSource hook (see the vendor build).
  Random,
  Simulation,
  TileSet,
  TileValues,
};
