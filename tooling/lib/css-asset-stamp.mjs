/**
 * Cache-busting for the static assets a stylesheet loads.
 *
 * The origin serves non-HTML/JS/CSS assets with a bounded cache lifetime
 * (public, max-age=86400) and the CSS refers to them by stable URLs, so a
 * release that changes an asset would leave returning visitors on the old
 * bytes for up to a day. index.html already busts its own bundle refs with
 * ?v=<build>; stamping every url() with the same build is what keeps a new
 * release from being served yesterday's icons, sprites and fonts.
 *
 * Every kind of file a sheet can load has to be named here. Cover Glass ships
 * its typeface as .otf, which the list did not carry, so that one font kept a
 * stable URL while everything around it moved.
 *
 * Known gap, left with a reason: the Classic faces (Chicago, ChiKareGo2,
 * monaco) sit under `system.css-reference/`, which the server also publishes,
 * and those URLs carry no stamp. Stamping them adds ~169 bytes to the boot
 * payload, which at 2,959,340 of 2,959,872 meets the 512-byte reserve floor by
 * 532 — not enough for that change to ride along. Whoever takes it should pair
 * it with a reclaim.
 */
export const STAMPED_ASSET_ROOTS = "assets";
export const STAMPED_ASSET_EXTENSIONS = "svg|png|jpg|jpeg|webp|gif|ico|woff|woff2|otf|ttf|dat";

export function stampCssAssetUrls(css, build) {
  return css.replace(
    new RegExp(
      `url\\(\\s*(['"]?)((?:\\.{0,2}/)*(?:${STAMPED_ASSET_ROOTS})/[\\w./-]+\\.(?:${STAMPED_ASSET_EXTENSIONS})(?:\\?[^)'"]*)?)\\1\\s*\\)`,
      "gi"
    ),
    (match, quote, url) => (/\?/.test(url) ? match : `url(${quote}${url}?v=${build}${quote})`)
  );
}
