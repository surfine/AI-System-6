// /api/bonsai/*
//
// Bonsai City's real-place import. The browser may not reach another host,
// so these three routes fetch on its behalf, inside fixed limits:
//
//   GET /api/bonsai/osm?lat=&lon=&size=&buildings=1   OSM features in the map square
//   GET /api/bonsai/elevation?lat=&lon=&size=         one height per map cell
//   GET /api/bonsai/place?q=                          place name to a point
//
// On the public deployment they sit behind the Turnstile session and the
// reader pool (security/public-session.js), and bonsai-osm.js keeps its own
// daily ceiling on uncached upstream queries.

"use strict";

const { sendJson, requestSignal } = require("../lib/http.js");
const { isPublicDeployment } = require("../runtime-profile.js");
const service = require("../bonsai-osm.js");

function queryOf(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function sendError(res, error) {
  const status = Number(error?.statusCode) || 502;
  const headers = status === 429 ? { "Retry-After": error?.code === "daily_limit" ? "3600" : "5" } : {};
  sendJson(res, status, { code: error?.code || "upstream_unavailable", error: String(error?.message || "The map service failed.") }, headers);
}

async function handleBonsaiOsm(req, res) {
  const params = queryOf(req);
  try {
    const answer = await service.osmFeatures({
      lat: params.get("lat"), lon: params.get("lon"), size: params.get("size"), buildings: params.get("buildings"),
    }, { signal: requestSignal(req, res), isPublic: isPublicDeployment });
    sendJson(res, 200, answer, { "Cache-Control": "private, max-age=3600" });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleBonsaiElevation(req, res) {
  const params = queryOf(req);
  try {
    const answer = await service.elevationGrid({ lat: params.get("lat"), lon: params.get("lon"), size: params.get("size") }, { signal: requestSignal(req, res) });
    sendJson(res, 200, answer, { "Cache-Control": "private, max-age=86400" });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleBonsaiPlace(req, res) {
  const params = queryOf(req);
  try {
    const answer = await service.searchPlace(params.get("q"), { signal: requestSignal(req, res), language: String(params.get("lang") || "") });
    sendJson(res, 200, answer, { "Cache-Control": "private, max-age=3600" });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = { handleBonsaiOsm, handleBonsaiElevation, handleBonsaiPlace };
