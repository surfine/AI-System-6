// HD rendering adaptation for the vendored micropolisJS engine, applied at
// bundle time so the pinned clone stays byte-identical to upstream.
//
// The contract it adds:
// - TileSet accepts atlases at any integer multiple of the 512px base and
//   reports the multiple as `tileSet.scale` (1 for upstream art).
// - GameCanvas sizes its backing store at CSS size x scale and pins the CSS
//   size via style, so HD art maps 1:1 onto backing pixels while the logical
//   16px world tile, the visible map range, and every caller-facing
//   coordinate API (CSS pixels in, CSS pixels out) stay unchanged.
// - Sprite frames read from the sheet at 48 x scale and paint at world
//   position x scale; damage stays in logical tiles.
//
// Every replacement is exact-match: if upstream drifts, the build fails
// loudly instead of silently shipping a half-patched engine.

const TILESET_PATCHES = [
  {
    from: `  // We expect tilesets to be square, and of the required width/height
  if (width !== height || width !== ACCEPTABLE_DIMENSION) {
    // Spin the event loop
    window.setTimeout(errorCallback, 0);
    return;
  }

  var tileWidth = this.tileWidth = TILE_SIZE;`,
    to: `  // We expect tilesets to be square: either the classic dimension or an
  // integer HD multiple of it (AI System 6 HD adaptation).
  var scale = width / ACCEPTABLE_DIMENSION;
  if (width !== height || !(scale >= 1) || Math.floor(scale) !== scale) {
    // Spin the event loop
    window.setTimeout(errorCallback, 0);
    return;
  }

  this.scale = scale;
  var tileWidth = this.tileWidth = TILE_SIZE * scale;`,
  },
];

const GAMECANVAS_PATCHES = [
  {
    from: `  // The canvas is assumed to fill its container on-screen
  var canvasWidth = this.canvasWidth = this._canvas.parentNode.clientWidth;
  var canvasHeight = this.canvasHeight = this._canvas.parentNode.clientHeight;

  if (canvasHeight === this._lastCanvasHeight && canvasWidth === this._lastCanvasWidth && !force)
    return;

  this._canvas.width = canvasWidth;
  this._canvas.height = canvasHeight;`,
    to: `  // The canvas fills its container on-screen; the backing store carries the
  // tile set's scale (AI System 6 HD adaptation) so HD art maps 1:1 onto
  // backing pixels while the CSS size and logical 16px tile stay unchanged.
  var scale = this._tileSet.scale || 1;
  var cssWidth = this._canvas.parentNode.clientWidth;
  var cssHeight = this._canvas.parentNode.clientHeight;
  var canvasWidth = this.canvasWidth = cssWidth * scale;
  var canvasHeight = this.canvasHeight = cssHeight * scale;

  if (canvasHeight === this._lastCanvasHeight && canvasWidth === this._lastCanvasWidth && !force)
    return;

  this._canvas.width = canvasWidth;
  this._canvas.height = canvasHeight;
  this._canvas.style.width = cssWidth + 'px';
  this._canvas.style.height = cssHeight + 'px';`,
  },
  {
    from: `  return {x: Math.floor(x / this._tileSet.tileWidth),
          y: Math.floor(y / this._tileSet.tileWidth)};`,
    to: `  var cssTileWidth = this._tileSet.tileWidth / (this._tileSet.scale || 1);
  return {x: Math.floor(x / cssTileWidth),
          y: Math.floor(y / cssTileWidth)};`,
  },
  {
    from: `  if (x >= this.canvasWidth || y >= this.canvasHeight)
    return null;

  return {x: this._originX + Math.floor(x/this._tileSet.tileWidth),
          y: this._originY + Math.floor(y/this._tileSet.tileWidth)};`,
    to: `  var scale = this._tileSet.scale || 1;
  if (x * scale >= this.canvasWidth || y * scale >= this.canvasHeight)
    return null;

  return {x: this._originX + Math.floor(x * scale / this._tileSet.tileWidth),
          y: this._originY + Math.floor(y * scale / this._tileSet.tileWidth)};`,
  },
  {
    from: `  if (x >= this.canvasWidth || y >= this.canvasHeight)
    return null;

  x = this._originX + Math.floor(x / this._tileSet.tileWidth);
  y = this._originY + Math.floor(y / this._tileSet.tileWidth);`,
    to: `  var scale = this._tileSet.scale || 1;
  if (x * scale >= this.canvasWidth || y * scale >= this.canvasHeight)
    return null;

  x = this._originX + Math.floor(x * scale / this._tileSet.tileWidth);
  y = this._originY + Math.floor(y * scale / this._tileSet.tileWidth);`,
  },
  {
    from: `  return {x: (x - this._originX) * this._tileSet.tileWidth,
          y: (y - this._originY) * this._tileSet.tileWidth};`,
    to: `  var cssTileWidth = this._tileSet.tileWidth / (this._tileSet.scale || 1);
  return {x: (x - this._originX) * cssTileWidth,
          y: (y - this._originY) * cssTileWidth};`,
  },
  {
    // Not an HD change: after the canvas GROWS, the incremental painter
    // indexes the fresh paintData (stride = current width) with the old
    // min-width stride, painting shredded rows that then persist because
    // _lastPaintedTiles stores the correct values. When no resize happened,
    // xBound === width, so using the current stride is behaviour-identical;
    // when one did, every entry was already invalidated to -2 and the full
    // repaint just needs the right source index.
    from: `        index  = y * xBound + x;`,
    to: `        index  = y * width + x;`,
  },
  {
    from: `GameCanvas.prototype._processSprites = function(ctx, spriteList) {
  var spriteDamage = [];
  var tileWidth = this._tileSet.tileWidth;`,
    to: `GameCanvas.prototype._processSprites = function(ctx, spriteList) {
  var spriteDamage = [];
  var scale = this._tileSet.scale || 1;
  // Damage stays in logical tiles: sprite positions are world pixels
  // (16 per tile), so divide by the world tile size, not the backing one.
  var tileWidth = this._tileSet.tileWidth / scale;`,
  },
  {
    from: `      ctx.drawImage(this._spriteSheet,
                    (sprite.frame - 1) * 48,
                    (sprite.type - 1) * 48,
                    sprite.width,
                    sprite.width,
                    sprite.x + sprite.xOffset - this._originX * 16,
                    sprite.y + sprite.yOffset - this._originY * 16,
                    sprite.width,
                    sprite.width);`,
    to: `      ctx.drawImage(this._spriteSheet,
                    (sprite.frame - 1) * 48 * scale,
                    (sprite.type - 1) * 48 * scale,
                    sprite.width * scale,
                    sprite.width * scale,
                    (sprite.x + sprite.xOffset - this._originX * 16) * scale,
                    (sprite.y + sprite.yOffset - this._originY * 16) * scale,
                    sprite.width * scale,
                    sprite.width * scale);`,
  },
];

// Not an HD change: upstream simulation.js passes the undeclared bare
// identifier `budget` into the census at phase 9, which throws a
// ReferenceError on the first 10-census (cityTime 0) and silently kills the
// caller's animation loop. Found while pumping frames during HD verification.
const SIMULATION_PATCHES = [
  {
    from: `      if (this._cityTime % CENSUS_FREQUENCY_10 === 0)
        this._census.take10Census(budget);

      if (this._cityTime % CENSUS_FREQUENCY_120 === 0)
        this._census.take120Census(budget);`,
    to: `      if (this._cityTime % CENSUS_FREQUENCY_10 === 0)
        this._census.take10Census(this.budget);

      if (this._cityTime % CENSUS_FREQUENCY_120 === 0)
        this._census.take120Census(this.budget);`,
  },
];

function applyPatches(source, patches, fileLabel) {
  let patched = source;
  for (const { from, to } of patches) {
    if (!patched.includes(from)) {
      throw new Error(`micropolis hd patch: pattern not found in ${fileLabel}:\n${from}`);
    }
    patched = patched.replace(from, to);
  }
  return patched;
}

export function micropolisHdPatchPlugin(readFile) {
  return {
    name: "micropolis-hd-patch",
    setup(buildContext) {
      buildContext.onLoad({ filter: /[\\/]src[\\/](gameCanvas|tileSet|simulation)\.js$/ }, async (args) => {
        const source = await readFile(args.path, "utf8");
        const name = args.path.match(/(gameCanvas|tileSet|simulation)\.js$/)[1];
        const patches = name === "tileSet" ? TILESET_PATCHES
          : name === "simulation" ? SIMULATION_PATCHES
            : GAMECANVAS_PATCHES;
        const contents = applyPatches(source, patches, `${name}.js`);
        return { contents, loader: "js" };
      });
    },
  };
}
