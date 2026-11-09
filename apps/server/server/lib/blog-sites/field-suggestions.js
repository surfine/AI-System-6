// Field suggestions for one draft. Nothing here reads or writes a site file.
// The caller holds the result until the writer clicks it into the draft.

"use strict";

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/**
 * Latin words already in the title, joined as a slug. A Chinese title yields
 * nothing; the caller keeps the existing slug or the filename stem.
 * @param {string} text
 */
function latinSlug(text) {
  const words = String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.join("-").replace(/^-+|-+$/g, "");
}

/**
 * @param {string} filename
 */
function stemSlug(filename) {
  const stem = String(filename || "").split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") || "";
  const dated = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(stem);
  const bare = dated ? dated[1] : stem;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bare) ? bare : "";
}

/**
 * @param {Record<string, any>} input
 * @param {{ slug?: string, name?: string }[]} [categories]
 */
function suggestFields(input = {}, categories = []) {
  const title = String(input.title || "").trim();
  const existing = String(input.slug || "").trim();
  const slug = (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(existing) ? existing : "")
    || latinSlug(title)
    || stemSlug(input.filename)
    || "draft";
  const known = new Set((Array.isArray(categories) ? categories : []).map((entry) => String(entry?.slug || "")).filter(Boolean));
  const given = asList(input.cats || input.categories || input.category);
  const category = given.find((entry) => !known.size || known.has(entry)) || [...known][0] || "";
  return {
    slug,
    category,
    series: String(input.series || "").trim(),
    tags: asList(input.tags),
    held: true,
  };
}

module.exports = { suggestFields };
