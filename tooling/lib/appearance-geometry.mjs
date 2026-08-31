// The one list of properties that can move something on screen.
//
// Two gates reason about per-appearance layout and must agree on what counts
// as layout: verify-css.mjs ratchets how many geometry declarations each
// appearance sheet may carry, and appearance-token-check.mjs probes the
// computed value of exactly those declarations in the browser. A property one
// gate charges and the other never probes would be a hole the ratchet claims
// is covered — so the vocabulary lives here and both import it.

export const GEOMETRY_PROPERTIES = new Set([
  "width", "height", "min-width", "max-width", "min-height", "max-height",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "padding-inline", "padding-block", "padding-inline-start", "padding-inline-end",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "margin-inline", "margin-block", "margin-inline-start", "margin-inline-end",
  "position", "top", "right", "bottom", "left", "inset",
  "display", "flex", "flex-basis", "flex-direction", "flex-wrap", "flex-grow", "flex-shrink",
  "grid", "grid-template", "grid-template-columns", "grid-template-rows",
  "grid-auto-flow", "grid-auto-rows", "grid-auto-columns", "grid-column", "grid-row",
  "gap", "row-gap", "column-gap",
  "align-items", "align-self", "align-content",
  "justify-content", "justify-items", "justify-self", "place-items", "place-content",
  "order", "font-size", "font-family", "font-weight", "font", "line-height",
  "letter-spacing", "word-spacing",
  "border-width", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "overflow", "overflow-x", "overflow-y", "white-space", "columns",
  "aspect-ratio", "transform", "translate", "scale", "rotate",
  "box-sizing", "content", "float", "vertical-align", "text-indent",
  "writing-mode", "container-type",
]);

export const BORDER_SHORTHAND = /^border(-(top|right|bottom|left))?$/;
