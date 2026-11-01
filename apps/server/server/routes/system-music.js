// GET/POST /api/music/system
//
// Local-only bridge to the signed-in macOS Music app. Apple keeps account
// credentials and streaming inside Music; Soundscape only reads playback state
// and sends a small allowlisted set of player commands.

"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { readJsonBody, sendJson, respondIfClientError } = require("../lib/http.js");

const execFileAsync = promisify(execFile);
const ALLOWED_ACTIONS = new Set([
  "state",
  "open",
  "play",
  "pause",
  "play-pause",
  "previous",
  "next",
  "set-position",
  "set-volume",
  "toggle-mute",
  "set-shuffle",
  "set-shuffle-mode",
  "set-repeat",
  "search-library",
  "play-library-track",
]);

const MUSIC_JXA = String.raw`
function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function readValue(reader, fallback) {
  try {
    const value = reader();
    return value === null || value === undefined ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function trackPayload(track) {
  if (!track) return null;
  return {
    id: cleanText(readValue(() => track.databaseID(), "")),
    persistentId: cleanText(readValue(() => track.persistentID(), "")),
    title: cleanText(readValue(() => track.name(), "")),
    artist: cleanText(readValue(() => track.artist(), "")),
    album: cleanText(readValue(() => track.album(), "")),
    duration: Number(readValue(() => track.duration(), 0)) || 0,
  };
}

function playerSnapshot(music) {
  return {
    available: true,
    playerState: cleanText(readValue(() => music.playerState(), "stopped")),
    repeat: cleanText(readValue(() => music.songRepeat(), "off")),
    shuffle: Boolean(readValue(() => music.shuffleEnabled(), false)),
    shuffleMode: cleanText(readValue(() => music.shuffleMode(), "songs")),
    volume: Number(readValue(() => music.soundVolume(), 50)) || 0,
    muted: Boolean(readValue(() => music.mute(), false)),
    position: Number(readValue(() => music.playerPosition(), 0)) || 0,
    track: trackPayload(readValue(() => music.currentTrack(), null)),
  };
}

function libraryPlaylist(music) {
  const playlists = music.libraryPlaylists();
  if (!playlists.length) throw new Error("Music library is unavailable.");
  return playlists[0];
}

function run(argv) {
  const action = argv[0] || "state";
  const payload = argv[1] ? JSON.parse(argv[1]) : {};
  const music = Application("Music");

  if (action === "state") {
    return JSON.stringify(playerSnapshot(music));
  }

  if (action === "open") {
    music.activate();
  } else if (action === "play") {
    music.play();
  } else if (action === "pause") {
    music.pause();
  } else if (action === "play-pause") {
    music.playpause();
  } else if (action === "previous") {
    music.backTrack();
  } else if (action === "next") {
    music.nextTrack();
  } else if (action === "set-position") {
    music.playerPosition = Math.max(0, Number(payload.position) || 0);
  } else if (action === "set-volume") {
    music.soundVolume = Math.max(0, Math.min(100, Number(payload.volume) || 0));
  } else if (action === "toggle-mute") {
    music.mute = !Boolean(music.mute());
  } else if (action === "set-shuffle") {
    // Only the switch. Forcing shuffleMode = "songs" here used to silently
    // rewrite whatever kind the user had chosen inside Music.
    music.shuffleEnabled = Boolean(payload.enabled);
  } else if (action === "set-shuffle-mode") {
    const shuffleMode = ["songs", "albums", "groupings"].includes(payload.mode) ? payload.mode : "songs";
    music.shuffleMode = shuffleMode;
  } else if (action === "set-repeat") {
    const repeatMode = ["off", "all", "one"].includes(payload.mode) ? payload.mode : "off";
    music.songRepeat = repeatMode;
  } else if (action === "search-library") {
    const query = cleanText(payload.query).trim().slice(0, 160);
    if (!query) return JSON.stringify({ available: true, results: [] });
    const results = music.search(libraryPlaylist(music), { for: query, only: "all" });
    return JSON.stringify({
      available: true,
      results: results.slice(0, 12).map(trackPayload),
    });
  } else if (action === "play-library-track") {
    const persistentId = cleanText(payload.persistentId).trim();
    if (!persistentId) throw new Error("A persistent track id is required.");
    const matches = libraryPlaylist(music).tracks.whose({ persistentID: persistentId })();
    if (!matches.length) throw new Error("The track is no longer in the Music library.");
    music.play(matches[0]);
  }

  return JSON.stringify(playerSnapshot(music));
}
`;

function musicError(error) {
  const detail = `${error?.stderr || ""}\n${error?.message || ""}`.trim();
  if (detail.includes("-1743") || /not authorized|not permitted/i.test(detail)) {
    return {
      status: 403,
      code: "automation_denied",
      error: "Music automation permission is required.",
    };
  }
  if (/application.*isn.t running|application.*not found|Music library is unavailable/i.test(detail)) {
    return {
      status: 503,
      code: "music_unavailable",
      error: "The Music app is unavailable.",
    };
  }
  return {
    status: 502,
    code: "music_command_failed",
    error: "The Music app did not complete the command.",
  };
}

async function runMusicAction(action, payload = {}) {
  const { stdout } = await execFileAsync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", MUSIC_JXA, action, JSON.stringify(payload)],
    {
      encoding: "utf8",
      timeout: 7000,
      maxBuffer: 256 * 1024,
    }
  );
  return JSON.parse(String(stdout || "{}").trim() || "{}");
}

async function handleSystemMusic(req, res) {
  if (process.platform !== "darwin") {
    sendJson(res, req.method === "GET" ? 200 : 501, {
      available: false,
      code: "mac_only",
      error: "System Music control is available on the host Mac only.",
    }, { "Cache-Control": "no-store" });
    return;
  }

  try {
    const body = req.method === "POST"
      ? await readJsonBody(req, { limitBytes: 8 * 1024 })
      : {};
    const action = req.method === "GET" ? "state" : String(body?.action || "");
    if (!ALLOWED_ACTIONS.has(action)) {
      sendJson(res, 400, {
        available: true,
        code: "unknown_action",
        error: "Unknown Music command.",
      }, { "Cache-Control": "no-store" });
      return;
    }
    const result = await runMusicAction(action, body);
    sendJson(res, 200, result, { "Cache-Control": "no-store" });
  } catch (error) {
    // The Music app is only asked after the body is accepted. A rejected body
    // must not be reported as a command that the Music app refused, because no
    // command was sent.
    if (respondIfClientError(res, error, { available: true })) return;
    const failure = musicError(error);
    sendJson(res, failure.status, {
      available: true,
      code: failure.code,
      error: failure.error,
    }, { "Cache-Control": "no-store" });
  }
}

module.exports = {
  ALLOWED_ACTIONS,
  handleSystemMusic,
  runMusicAction,
};
