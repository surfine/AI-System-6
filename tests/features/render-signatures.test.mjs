// The render-signature cache only protects a repaint if the version it
// compares covers what the renderer draws. collectionVersion is that cover:
// any content change on any record must move it, with or without a timestamp
// bump - the stale-view bug class the signature memoization exists to make
// impossible.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import vm from "node:vm";

const test = createFeatureTest("render-signatures");
const statusSrc = read("app/core/persistence-status.js");
const start = statusSrc.indexOf("function collectionVersion");
const end = statusSrc.indexOf("async function switchLanguage");
test.assert(start >= 0 && end > start, "the version function stays between its neighbours in persistence-status.js");
// Execute the real source, not a copy: the invariant is about the shipped
// fingerprint, so the contract must fail if the function is ever thinned back
// to a remembered field list.
const collectionVersion = vm.runInContext(`${statusSrc.slice(start, end)}\n;collectionVersion`, vm.createContext({}));

const scrap = { id: "s1", title: "Note", body: "first", tags: ["idea"], createdAt: "2026-01-01T00:00:00.000Z" };
const before = collectionVersion([scrap]);

test.assert(collectionVersion([{ ...scrap }]) === before, "an unchanged record keeps the same version, so unchanged repaints still skip");
test.assert(collectionVersion([{ ...scrap, body: "second" }]) !== before, "a content change with no updatedAt bump still moves the version");
test.assert(collectionVersion([{ ...scrap, tags: ["idea", "source"] }]) !== before, "a tags-only change moves the version");
test.assert(collectionVersion([]) !== before, "an emptied collection moves the version");
const cyclic = { id: "c1", createdAt: "2026-01-01T00:00:00.000Z" };
cyclic.self = cyclic;
test.assert(typeof collectionVersion([cyclic]) === "string", "a record that cannot stringify falls back instead of throwing the render");

test.finish();
