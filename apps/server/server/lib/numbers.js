// Small numeric utilities shared across server modules.

"use strict";

/**
 * Coerce a value to a positive integer, returning 0 for anything that
 * is not a finite positive number. Mirrors `positiveInteger` from
 * root server.js.
 *
 * @param {unknown} value
 * @returns {number}
 */
function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

module.exports = {
  positiveInteger,
};
