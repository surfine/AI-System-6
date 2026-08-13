// SPDX-License-Identifier: GPL-2.0-only

(function initDoomWadPicker(root) {
  "use strict";

  var IWAD_DIRECTORY = "/doom/iwads";
  var CATALOG_PATH = IWAD_DIRECTORY + "/catalog.json";
  var CATALOG_VERSION = 1;
  var DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
  var ABSOLUTE_MAX_BYTES = 512 * 1024 * 1024;
  var MAX_LUMPS = 1024 * 1024;
  var SHA256_PATTERN = /^[a-f0-9]{64}$/;
  var WAD_ID_PATTERN = /^wad-[a-f0-9]{64}$/;
  var TEMP_PREFIX = ".aisystem6-";

  function WadPickerError(code, message, details) {
    this.name = "WadPickerError";
    this.code = code;
    this.message = message;
    this.details = details || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, WadPickerError);
  }

  WadPickerError.prototype = Object.create(Error.prototype);
  WadPickerError.prototype.constructor = WadPickerError;

  function fail(code, message, details) {
    throw new WadPickerError(code, message, details);
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    fail("INVALID_BYTES", "Expected WAD data as an ArrayBuffer or byte array.");
  }

  function normalizeFilename(value) {
    var leaf = String(value || "").split(/[\\/]/).pop();
    try {
      leaf = leaf.normalize("NFKC");
    } catch (error) {
      // Old WebViews can lack Unicode normalization. The remaining rules are
      // still sufficient to keep the result inside the IWAD directory.
    }
    leaf = leaf
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/:<>"|?*]/g, "_")
      .replace(/^\.+/, "")
      .replace(/\s+/g, " ")
      .trim();
    leaf = leaf.replace(/\.wad$/i, "").replace(/[. ]+$/g, "").trim();
    var codepoints = Array.from(leaf || "doom-data").slice(0, 80);
    var base = codepoints.join("").replace(/[. ]+$/g, "").trim() || "doom-data";
    return base + ".wad";
  }

  function parseWadHeader(value, options) {
    var bytes = toUint8Array(value);
    var maxBytes = Number(options && options.maxBytes) || DEFAULT_MAX_BYTES;
    if (!Number.isSafeInteger(bytes.byteLength) || bytes.byteLength < 12) {
      fail("WAD_TOO_SMALL", "The selected file is too small to be a WAD.");
    }
    if (bytes.byteLength > maxBytes) {
      fail("WAD_TOO_LARGE", "The selected WAD exceeds the local size limit.", {
        bytes: bytes.byteLength,
        maxBytes: maxBytes,
      });
    }

    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var kind = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (kind !== "IWAD" && kind !== "PWAD") {
      fail("WAD_BAD_HEADER", "The selected file does not have an IWAD or PWAD header.");
    }

    var lumpCount = view.getUint32(4, true);
    var directoryOffset = view.getUint32(8, true);
    if (lumpCount > MAX_LUMPS) {
      fail("WAD_TOO_MANY_LUMPS", "The WAD directory contains too many entries.", {
        lumpCount: lumpCount,
        maxLumps: MAX_LUMPS,
      });
    }
    var directoryBytes = lumpCount * 16;
    if (
      !Number.isSafeInteger(directoryBytes)
      || directoryOffset < 12
      || directoryOffset > bytes.byteLength
      || directoryBytes > bytes.byteLength - directoryOffset
    ) {
      fail("WAD_BAD_DIRECTORY", "The WAD lump directory extends outside the file.");
    }

    for (var index = 0; index < lumpCount; index += 1) {
      var entryOffset = directoryOffset + (index * 16);
      var lumpOffset = view.getUint32(entryOffset, true);
      var lumpBytes = view.getUint32(entryOffset + 4, true);
      if (lumpOffset > bytes.byteLength || lumpBytes > bytes.byteLength - lumpOffset) {
        fail("WAD_BAD_LUMP", "A WAD lump extends outside the file.", { index: index });
      }
    }

    return Object.freeze({
      kind: kind,
      lumpCount: lumpCount,
      directoryOffset: directoryOffset,
      directoryBytes: directoryBytes,
      bytes: bytes.byteLength,
    });
  }

  function bytesToHex(value) {
    return Array.from(toUint8Array(value), function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  async function sha256Hex(value, subtle) {
    var digestApi = subtle || (root.crypto && root.crypto.subtle);
    if (!digestApi || typeof digestApi.digest !== "function") {
      fail("SHA256_UNAVAILABLE", "This browser cannot calculate a local SHA-256 digest.");
    }
    var bytes = toUint8Array(value);
    var digest = await digestApi.digest(
      "SHA-256",
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    return bytesToHex(digest);
  }

  function emptyCatalog() {
    return { version: CATALOG_VERSION, activeId: null, entries: [] };
  }

  function cloneEntry(entry) {
    return Object.freeze({
      id: entry.id,
      path: entry.path,
      name: entry.name,
      bytes: entry.bytes,
      sha256: entry.sha256,
      importedAt: entry.importedAt,
      kind: entry.kind,
      lumpCount: entry.lumpCount,
    });
  }

  function cloneCatalog(catalog) {
    return {
      version: CATALOG_VERSION,
      activeId: catalog.activeId || null,
      entries: catalog.entries.map(function (entry) {
        return {
          id: entry.id,
          path: entry.path,
          name: entry.name,
          bytes: entry.bytes,
          sha256: entry.sha256,
          importedAt: entry.importedAt,
          kind: entry.kind,
          lumpCount: entry.lumpCount,
        };
      }),
    };
  }

  function normalizeCatalog(value, options) {
    var maxBytes = Number(options && options.maxBytes) || DEFAULT_MAX_BYTES;
    if (!value || typeof value !== "object" || value.version !== CATALOG_VERSION) {
      fail("CATALOG_UNSUPPORTED", "The local WAD catalog has an unsupported format.");
    }
    if (!Array.isArray(value.entries)) {
      fail("CATALOG_CORRUPT", "The local WAD catalog entries are invalid.");
    }

    var seenIds = new Set();
    var seenPaths = new Set();
    var entries = value.entries.map(function (entry) {
      if (!entry || typeof entry !== "object") {
        fail("CATALOG_CORRUPT", "The local WAD catalog contains an invalid entry.");
      }
      var id = String(entry.id || "");
      var sha256 = String(entry.sha256 || "").toLowerCase();
      var path = String(entry.path || "");
      var pathLeaf = path.slice(IWAD_DIRECTORY.length + 1);
      var name = normalizeFilename(entry.name);
      var bytes = Number(entry.bytes);
      var kind = entry.kind === "PWAD" ? "PWAD" : entry.kind === "IWAD" ? "IWAD" : "";
      var lumpCount = Number(entry.lumpCount);
      var importedAt = String(entry.importedAt || "");
      if (
        !WAD_ID_PATTERN.test(id)
        || id !== "wad-" + sha256
        || !SHA256_PATTERN.test(sha256)
        || !path.startsWith(IWAD_DIRECTORY + "/")
        || pathLeaf.includes("/")
        || path.includes("\\")
        || path !== IWAD_DIRECTORY + "/" + normalizeFilename(pathLeaf)
        || path === CATALOG_PATH
        || !Number.isSafeInteger(bytes)
        || bytes < 12
        || bytes > maxBytes
        || !kind
        || !Number.isSafeInteger(lumpCount)
        || lumpCount < 0
        || lumpCount > MAX_LUMPS
        || !Number.isFinite(Date.parse(importedAt))
        || seenIds.has(id)
        || seenPaths.has(path)
      ) {
        fail("CATALOG_CORRUPT", "The local WAD catalog contains an invalid entry.");
      }
      seenIds.add(id);
      seenPaths.add(path);
      return {
        id: id,
        path: path,
        name: name,
        bytes: bytes,
        sha256: sha256,
        importedAt: importedAt,
        kind: kind,
        lumpCount: lumpCount,
      };
    });

    var activeId = value.activeId == null ? null : String(value.activeId);
    if (activeId !== null && !seenIds.has(activeId)) {
      fail("CATALOG_CORRUPT", "The selected WAD is missing from the local catalog.");
    }
    return { version: CATALOG_VERSION, activeId: activeId, entries: entries };
  }

  function createStoredFilename(name, sha256) {
    sha256 = String(sha256 || "").toLowerCase();
    if (!SHA256_PATTERN.test(sha256)) {
      fail("INVALID_SHA256", "A complete SHA-256 digest is required for the stored WAD name.");
    }
    var safeName = normalizeFilename(name);
    var base = safeName.slice(0, -4);
    return base + "-" + sha256.slice(0, 12) + ".wad";
  }

  function create(options) {
    var settings = options || {};
    var FS = settings.FS;
    if (!FS || typeof FS.readFile !== "function" || typeof FS.writeFile !== "function") {
      fail("FS_REQUIRED", "An initialized Emscripten FS instance is required.");
    }
    var maxBytes = Number(settings.maxBytes) || DEFAULT_MAX_BYTES;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 12 || maxBytes > ABSOLUTE_MAX_BYTES) {
      fail("INVALID_SIZE_LIMIT", "The configured WAD size limit is invalid.");
    }

    var subtle = settings.subtle || (root.crypto && root.crypto.subtle);
    var now = typeof settings.now === "function" ? settings.now : function () {
      return new Date().toISOString();
    };
    var randomToken = typeof settings.randomToken === "function"
      ? settings.randomToken
      : function () {
        var bytes = new Uint8Array(8);
        if (root.crypto && typeof root.crypto.getRandomValues === "function") {
          root.crypto.getRandomValues(bytes);
          return bytesToHex(bytes);
        }
        return String(Date.now()) + "-" + String(Math.random()).slice(2);
      };
    var userActivationActive = typeof settings.userActivationActive === "function"
      ? settings.userActivationActive
      : function () {
        if (!root.navigator || !root.navigator.userActivation) return null;
        return root.navigator.userActivation.isActive === true;
      };
    var approvedFiles = typeof WeakSet === "function" ? new WeakSet() : null;
    var mutationTail = Promise.resolve();
    var fallbackSyncTail = Promise.resolve();

    function pathExists(path) {
      if (typeof FS.analyzePath === "function") return !!FS.analyzePath(path).exists;
      try {
        FS.stat(path);
        return true;
      } catch (error) {
        return false;
      }
    }

    function ensureDirectory(path) {
      if (pathExists(path)) return;
      try {
        FS.mkdir(path);
      } catch (error) {
        if (!pathExists(path)) throw error;
      }
    }

    ensureDirectory("/doom");
    ensureDirectory(IWAD_DIRECTORY);

    function fallbackSync(populate) {
      var run = function () {
        return new Promise(function (resolve, reject) {
          try {
            FS.syncfs(!!populate, function (error) {
              if (error) reject(error);
              else resolve();
            });
          } catch (error) {
            reject(error);
          }
        });
      };
      var result = fallbackSyncTail.then(run, run);
      fallbackSyncTail = result.catch(function () {});
      return result;
    }

    function syncFs(populate) {
      if (typeof settings.syncFs === "function") {
        try {
          return Promise.resolve(settings.syncFs(!!populate));
        } catch (error) {
          return Promise.reject(error);
        }
      }
      if (typeof FS.syncfs !== "function") {
        return Promise.reject(new WadPickerError(
          "SYNC_UNAVAILABLE",
          "The browser filesystem cannot be persisted.",
        ));
      }
      return fallbackSync(populate);
    }

    function decodeUtf8(value) {
      if (typeof value === "string") return value;
      if (typeof TextDecoder === "function") return new TextDecoder("utf-8", { fatal: true }).decode(value);
      var bytes = toUint8Array(value);
      var escaped = Array.from(bytes, function (byte) {
        return "%" + byte.toString(16).padStart(2, "0");
      }).join("");
      return decodeURIComponent(escaped);
    }

    function readCatalog() {
      if (!pathExists(CATALOG_PATH)) return emptyCatalog();
      try {
        var raw = FS.readFile(CATALOG_PATH, { encoding: "utf8" });
        return normalizeCatalog(JSON.parse(decodeUtf8(raw)), { maxBytes: maxBytes });
      } catch (error) {
        if (error instanceof WadPickerError) throw error;
        fail("CATALOG_CORRUPT", "The local WAD catalog could not be read.");
      }
    }

    var catalog = readCatalog();

    function temporaryPath(label) {
      var token = String(randomToken()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "temporary";
      return IWAD_DIRECTORY + "/" + TEMP_PREFIX + label + "-" + token;
    }

    function unlinkIfPresent(path) {
      if (!pathExists(path)) return;
      try {
        FS.unlink(path);
      } catch (error) {
        // Cleanup is best effort; the subsequent persistence result remains
        // authoritative and any hidden temporary is never listed as a WAD.
      }
    }

    function unlinkRequired(path) {
      if (pathExists(path)) FS.unlink(path);
    }

    function writeCatalogAtomic(nextCatalog) {
      var normalized = normalizeCatalog(nextCatalog, { maxBytes: maxBytes });
      var temporary = temporaryPath("catalog");
      try {
        FS.writeFile(temporary, JSON.stringify(normalized, null, 2) + "\n", { encoding: "utf8" });
        FS.rename(temporary, CATALOG_PATH);
      } finally {
        unlinkIfPresent(temporary);
      }
      return normalized;
    }

    async function recoverAfterFailedSync(originalError) {
      try {
        await syncFs(true);
        catalog = readCatalog();
      } catch (recoveryError) {
        throw new WadPickerError(
          "PERSISTENCE_RECOVERY_FAILED",
          "The WAD change failed and local storage could not be reloaded.",
          { cause: String(originalError), recovery: String(recoveryError) },
        );
      }
      throw new WadPickerError(
        "PERSISTENCE_FAILED",
        "The WAD change was not confirmed by browser storage.",
        { cause: String(originalError) },
      );
    }

    function enqueueMutation(operation) {
      var run = async function () {
        var outcome;
        try {
          outcome = await operation(cloneCatalog(catalog));
        } catch (error) {
          throw error;
        }
        try {
          var nextCatalog = writeCatalogAtomic(outcome.catalog);
          await syncFs(false);
          catalog = nextCatalog;
          return outcome.result(catalog);
        } catch (error) {
          return recoverAfterFailedSync(error);
        }
      };
      var result = mutationTail.then(run, run);
      mutationTail = result.catch(function () {});
      return result;
    }

    function publicEntries() {
      return Object.freeze(catalog.entries.filter(function (entry) {
        return pathExists(entry.path);
      }).map(cloneEntry));
    }

    function active() {
      var entry = catalog.entries.find(function (item) { return item.id === catalog.activeId; });
      return entry && pathExists(entry.path) ? cloneEntry(entry) : null;
    }

    function activePath() {
      var entry = active();
      return entry ? entry.path : null;
    }

    function assertUserSelectedFile(file) {
      if (!file || typeof file.arrayBuffer !== "function" || !Number.isFinite(Number(file.size))) {
        fail("FILE_REQUIRED", "Select one local WAD file.");
      }
      var wasPickedHere = approvedFiles && approvedFiles.has(file);
      if (!wasPickedHere && userActivationActive() !== true) {
        fail("USER_GESTURE_REQUIRED", "A local WAD must be selected by an explicit user gesture.");
      }
      if (approvedFiles) approvedFiles.delete(file);
    }

    async function importFile(file) {
      assertUserSelectedFile(file);
      return enqueueMutation(async function (nextCatalog) {
        var declaredBytes = Number(file.size);
        if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 12) {
          fail("WAD_TOO_SMALL", "The selected file is too small to be a WAD.");
        }
        if (declaredBytes > maxBytes) {
          fail("WAD_TOO_LARGE", "The selected WAD exceeds the local size limit.", {
            bytes: declaredBytes,
            maxBytes: maxBytes,
          });
        }

        var bytes;
        try {
          bytes = new Uint8Array(await file.arrayBuffer());
        } catch (error) {
          fail("FILE_READ_FAILED", "The selected local WAD could not be read.");
        }
        if (bytes.byteLength !== declaredBytes) {
          fail("FILE_READ_INCOMPLETE", "The selected local WAD was not read completely.");
        }
        var header = parseWadHeader(bytes, { maxBytes: maxBytes });
        var sha256 = await sha256Hex(bytes, subtle);
        var id = "wad-" + sha256;
        var existing = nextCatalog.entries.find(function (entry) {
          return entry.id === id && pathExists(entry.path);
        });
        if (existing) {
          nextCatalog.activeId = existing.id;
          return {
            catalog: nextCatalog,
            result: function (savedCatalog) {
              var saved = savedCatalog.entries.find(function (entry) { return entry.id === id; });
              return Object.freeze({ ok: true, deduplicated: true, entry: cloneEntry(saved) });
            },
          };
        }

        var importedAt = String(now());
        if (!Number.isFinite(Date.parse(importedAt))) {
          fail("CLOCK_INVALID", "The local import time could not be recorded.");
        }
        nextCatalog.entries = nextCatalog.entries.filter(function (entry) { return entry.id !== id; });
        var safeName = normalizeFilename(file.name);
        var storedName = createStoredFilename(safeName, sha256);
        var finalPath = IWAD_DIRECTORY + "/" + storedName;
        var collision = 2;
        while (pathExists(finalPath)) {
          finalPath = IWAD_DIRECTORY + "/" + storedName.slice(0, -4) + "-" + collision + ".wad";
          collision += 1;
        }
        var temporary = temporaryPath("import") + ".tmp";
        try {
          FS.writeFile(temporary, bytes, { canOwn: false });
          FS.rename(temporary, finalPath);
        } finally {
          unlinkIfPresent(temporary);
        }

        var entry = {
          id: id,
          path: finalPath,
          name: safeName,
          bytes: bytes.byteLength,
          sha256: sha256,
          importedAt: importedAt,
          kind: header.kind,
          lumpCount: header.lumpCount,
        };
        nextCatalog.entries.push(entry);
        nextCatalog.activeId = id;
        return {
          catalog: nextCatalog,
          result: function (savedCatalog) {
            var saved = savedCatalog.entries.find(function (item) { return item.id === id; });
            return Object.freeze({ ok: true, deduplicated: false, entry: cloneEntry(saved) });
          },
        };
      });
    }

    function select(id) {
      return enqueueMutation(async function (nextCatalog) {
        if (id == null) {
          nextCatalog.activeId = null;
        } else {
          var selected = nextCatalog.entries.find(function (entry) { return entry.id === id; });
          if (!selected || !pathExists(selected.path)) {
            fail("WAD_NOT_FOUND", "The selected local WAD is no longer available.");
          }
          nextCatalog.activeId = selected.id;
        }
        return {
          catalog: nextCatalog,
          result: function () { return active(); },
        };
      });
    }

    function remove(id, confirmation) {
      if (!confirmation || confirmation.confirmed !== true || confirmation.id !== id) {
        return Promise.reject(new WadPickerError(
          "CONFIRMATION_REQUIRED",
          "The shell must confirm removal of this local WAD.",
        ));
      }
      return enqueueMutation(async function (nextCatalog) {
        var index = nextCatalog.entries.findIndex(function (entry) { return entry.id === id; });
        if (index < 0) fail("WAD_NOT_FOUND", "The selected local WAD is no longer available.");
        var removed = nextCatalog.entries[index];
        nextCatalog.entries.splice(index, 1);
        if (nextCatalog.activeId === id) nextCatalog.activeId = null;
        unlinkRequired(removed.path);
        return {
          catalog: nextCatalog,
          result: function () {
            return Object.freeze({ ok: true, removed: cloneEntry(removed), active: active() });
          },
        };
      });
    }

    function pickFile() {
      // Older WebViews have no UserActivation API. Their native file input
      // still enforces the gesture; only a definite inactive result is denied.
      if (userActivationActive() === false) {
        return Promise.reject(new WadPickerError(
          "USER_GESTURE_REQUIRED",
          "Opening the local WAD picker requires an explicit user gesture.",
        ));
      }
      if (!root.document || !root.document.body) {
        return Promise.reject(new WadPickerError("PICKER_UNAVAILABLE", "The local file picker is unavailable."));
      }
      return new Promise(function (resolve) {
        var settled = false;
        var focusTimer = null;
        var input = root.document.createElement("input");
        input.type = "file";
        input.accept = ".wad,application/octet-stream";
        input.multiple = false;
        input.setAttribute("aria-hidden", "true");
        input.style.position = "fixed";
        input.style.width = "1px";
        input.style.height = "1px";
        input.style.opacity = "0";
        input.style.pointerEvents = "none";

        function finish(file) {
          if (settled) return;
          settled = true;
          if (focusTimer) root.clearTimeout(focusTimer);
          root.removeEventListener("focus", afterFocus, true);
          input.remove();
          if (file && approvedFiles) approvedFiles.add(file);
          resolve(file || null);
        }

        function afterFocus() {
          focusTimer = root.setTimeout(function () {
            if (!input.files || input.files.length === 0) finish(null);
          }, 400);
        }

        input.addEventListener("change", function () {
          finish(input.files && input.files[0]);
        }, { once: true });
        input.addEventListener("cancel", function () { finish(null); }, { once: true });
        root.addEventListener("focus", afterFocus, true);
        root.document.body.appendChild(input);
        input.click();
      });
    }

    async function pickAndImport() {
      var file = await pickFile();
      if (!file) return Object.freeze({ ok: false, cancelled: true });
      return importFile(file);
    }

    return Object.freeze({
      list: publicEntries,
      active: active,
      activePath: activePath,
      select: select,
      importFile: importFile,
      remove: remove,
      pickFile: pickFile,
      pickAndImport: pickAndImport,
      maxBytes: maxBytes,
      catalogPath: CATALOG_PATH,
    });
  }

  root.AISystem6DoomWadPicker = Object.freeze({
    version: 1,
    create: create,
    WadPickerError: WadPickerError,
    constants: Object.freeze({
      iwadDirectory: IWAD_DIRECTORY,
      catalogPath: CATALOG_PATH,
      defaultMaxBytes: DEFAULT_MAX_BYTES,
      absoluteMaxBytes: ABSOLUTE_MAX_BYTES,
      maxLumps: MAX_LUMPS,
    }),
    normalizeFilename: normalizeFilename,
    parseWadHeader: parseWadHeader,
    sha256Hex: sha256Hex,
    normalizeCatalog: normalizeCatalog,
    createStoredFilename: createStoredFilename,
  });
})(typeof window !== "undefined" ? window : globalThis);
