// Bonsai City save codec worker manager with bounded direct-codec fallback.
window.AISystem6BonsaiSaveWorkerManagerLoaded = true;

(function initBonsaiSaveWorkerManager() {
  "use strict";

  function createSaveWorkerManager(options = {}) {
    const sim = options.sim || window.AISystem6BonsaiSim;
    const WorkerCtor = Object.prototype.hasOwnProperty.call(options, "WorkerCtor") ? options.WorkerCtor : window.Worker;
    // Stamped like every other app/ URL: the serving layer marks that prefix
    // immutable, and only the build stamp keeps a cached copy from outliving
    // its release. See app/core/config.js lazyScriptUrl for the same rule.
    const workerBuild = window.AISystem6Config?.getAppBuildInfo?.().build || "dev";
    const workerUrl = options.workerUrl || `app/features/bonsai-save-worker.js?v=${encodeURIComponent(workerBuild)}`;
    const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 4000;
    let worker = null;
    let nextId = 1;
    const pending = new Map();

    const sc2Codec = () => options.sc2Codec || window.AISystem6BonsaiSc2Codec;
    const micropolisCodec = () => options.micropolisCodec || window.AISystem6BonsaiMicropolisCodec;
    const micropolisExport = () => options.micropolisExport || window.AISystem6BonsaiMicropolisExport;

    function direct(operation, input, metadata) {
      if (operation === "micropolis-import") {
        const codec = micropolisCodec();
        if (!codec) return Promise.reject(new Error("bonsai-micropolis-codec-missing"));
        return Promise.resolve().then(() => codec.importMicropolis(input, metadata || {}));
      }
      if (operation === "micropolis-export") {
        const exporter = micropolisExport();
        if (!exporter) return Promise.reject(new Error("bonsai-micropolis-export-missing"));
        return Promise.resolve().then(() => exporter.exportMicropolis(input, metadata || {}));
      }
      if (operation === "sc2-import") {
        const codec = sc2Codec();
        if (!codec) return Promise.reject(new Error("bonsai-sc2-codec-missing"));
        return Promise.resolve().then(() => codec.importSc2(input));
      }
      if (operation === "sc2-export") {
        const codec = sc2Codec();
        if (!codec) return Promise.reject(new Error("bonsai-sc2-codec-missing"));
        return Promise.resolve().then(() => Array.from(codec.exportSc2(input)));
      }
      if (!sim) return Promise.reject(new Error("bonsai-save-codec-missing"));
      if (operation === "encode") return sim.encodeSave(input, metadata || {});
      if (operation === "parse-decode") return Promise.resolve().then(() => sim.decodeSave(JSON.parse(input)));
      return sim.decodeSave(input);
    }

    function abandonWorker({ fallbackPending = false } = {}) {
      const requests = Array.from(pending.values());
      if (worker && typeof worker.terminate === "function") worker.terminate();
      worker = null;
      for (const request of requests) clearTimeout(request.timer);
      pending.clear();
      if (fallbackPending) requests.forEach((request) => request.fallback());
    }

    function ensureWorker() {
      if (worker || typeof WorkerCtor !== "function") return worker;
      try {
        worker = new WorkerCtor(workerUrl);
        worker.onmessage = (event) => {
          const message = event && event.data;
          const request = message && pending.get(message.id);
          if (!request) return;
          clearTimeout(request.timer);
          pending.delete(message.id);
          if (message.ok) request.resolve(message.value);
          else request.fallback();
        };
        worker.onerror = () => {
          abandonWorker({ fallbackPending: true });
        };
      } catch (_) {
        worker = null;
      }
      return worker;
    }

    function run(operation, input, metadata) {
      const active = ensureWorker();
      if (!active) return direct(operation, input, metadata);
      const id = nextId++;
      return new Promise((resolve, reject) => {
        let settled = false;
        const fallback = () => {
          if (settled) return;
          settled = true;
          direct(operation, input, metadata).then(resolve, reject);
        };
        const timer = setTimeout(() => {
          abandonWorker({ fallbackPending: true });
        }, timeoutMs);
        pending.set(id, {
          timer,
          resolve(value) { if (!settled) { settled = true; resolve(value); } },
          fallback,
        });
        try {
          active.postMessage(operation === "encode"
            ? { id, operation, state: input, metadata: metadata || {} }
            : operation === "parse-decode"
              ? { id, operation, text: input }
              : operation === "sc2-import"
                ? { id, operation, bytes: input }
                : operation === "sc2-export"
                  ? { id, operation, payload: input }
                : operation === "micropolis-import"
                  ? { id, operation, record: input, options: metadata || {} }
                : operation === "micropolis-export"
                  ? { id, operation, payload: input, options: metadata || {} }
                  : { id, operation, envelope: input });
        } catch (_) {
          abandonWorker({ fallbackPending: true });
        }
      });
    }

    return Object.freeze({
      encode(state, metadata) { return run("encode", state, metadata); },
      decode(envelope) { return run("decode", envelope); },
      parseAndDecode(text) { return run("parse-decode", String(text || "")); },
      importSc2(bytes) { return run("sc2-import", bytes); },
      exportSc2(payload) { return run("sc2-export", payload); },
      importMicropolis(record, options) { return run("micropolis-import", record, options); },
      exportMicropolis(payload, options) { return run("micropolis-export", payload, options); },
      dispose() { abandonWorker(); },
    });
  }

  window.AISystem6BonsaiSaveWorkerManager = Object.freeze({ createSaveWorkerManager });
})();
