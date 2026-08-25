// Bonsai City save codec worker. Loaded only by bonsai-save-worker-manager.
/* global importScripts */
(function initBonsaiSaveWorker(scope) {
  "use strict";

  if (!scope.AISystem6BonsaiSim) {
    scope.window = scope;
    importScripts("bonsai-city-sim.js");
  }
  if (!scope.AISystem6BonsaiSc2Codec) {
    scope.window = scope;
    importScripts("bonsai-sc2-codec.js");
  }

  scope.onmessage = async (event) => {
    const message = event && event.data;
    if (!message || !Number.isInteger(message.id)) return;
    try {
      const sim = scope.AISystem6BonsaiSim;
      const value = message.operation === "encode"
        ? await sim.encodeSave(message.state, message.metadata || {})
        : message.operation === "decode"
          ? await sim.decodeSave(message.envelope)
          : message.operation === "parse-decode"
            ? await sim.decodeSave(JSON.parse(message.text))
          : message.operation === "sc2-import"
            ? scope.AISystem6BonsaiSc2Codec.importSc2(message.bytes)
          : message.operation === "sc2-export"
            ? Array.from(scope.AISystem6BonsaiSc2Codec.exportSc2(message.payload))
          : (() => { throw new Error("bonsai-save-worker-operation"); })();
      scope.postMessage({ id: message.id, ok: true, value });
    } catch (error) {
      scope.postMessage({ id: message.id, ok: false, error: String(error && error.message ? error.message : error) });
    }
  };
})(self);
