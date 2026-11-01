// Bonsai City in-memory city repository / 盆景城市内存城市仓库.
//
// Phase 2: a headless, dependency-light record store for city saves. The
// shell may swap this for an IndexedDB-backed repository later; the contract
// (create/list/get/put/remove) stays the same. No wall clock is used unless
// the caller injects one through `now`, so tests stay deterministic.
window.AISystem6BonsaiRepositoryLoaded = true;

(function initBonsaiRepository() {
  "use strict";

  function createCityRepository(options = {}) {
    const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
    const records = new Map();

    function summary(record) {
      return {
        id: record.id,
        name: record.name,
        seed: record.seed,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        tick: record.state.tick,
        population: record.state.population,
        funds: record.state.funds,
      };
    }

    return {
      list() {
        return Array.from(records.values()).map(summary);
      },

      get(id) {
        const record = records.get(id);
        return record ? record : null;
      },

      create({ id, seed, name = "", size, terrainPreset }) {
        if (typeof id !== "string" || !id) throw new Error("bonsai-repo-required-id");
        if (!Number.isInteger(seed)) throw new Error("bonsai-repo-required-seed");
        const sim = window.AISystem6BonsaiSim;
        if (!sim || typeof sim.createCity !== "function") throw new Error("bonsai-repo-sim-missing");
        const timestamp = now();
        const record = {
          id,
          name: typeof name === "string" ? name : "",
          seed,
          createdAt: timestamp,
          updatedAt: timestamp,
          state: sim.createCity({
            seed,
            name: typeof name === "string" ? name : "",
            ...(size == null ? {} : { size }),
            ...(terrainPreset == null ? {} : { terrainPreset }),
          }),
        };
        records.set(id, record);
        return record;
      },

      put(record) {
        if (!record || typeof record.id !== "string" || !record.id || !record.state) {
          throw new Error("bonsai-repo-invalid-record");
        }
        record.updatedAt = now();
        records.set(record.id, record);
        return record;
      },

      remove(id) {
        return records.delete(id);
      },

      summary(id) {
        const record = records.get(id);
        return record ? summary(record) : null;
      },
    };
  }

  window.AISystem6BonsaiRepository = Object.freeze({
    createCityRepository,
  });
})();
