/* ClioWorks unified spec: installs the vendored pure contracts onto the desk's
 * classic-script global scope under window.ClioWorksUnifiedContracts.
 *
 * The contracts are an ES module (reference/contracts.mjs, vendored verbatim);
 * this classic loader dynamic-imports it once and freezes the API surface
 * onto window. Loaded lazily by ensureUnifiedSpecContractsModule() — nothing
 * on the boot path pays for it until a consumer (application-registry's W05
 * lifecycle lanes) actually asks. */
(function () {
  'use strict';
  if (window.ClioWorksUnifiedContracts) return;

  let promise = null;

  function install(api) {
    window.ClioWorksUnifiedContracts = Object.freeze(api);
    window.ClioWorksUnifiedContractsLoaded = true;
    return window.ClioWorksUnifiedContracts;
  }

  window.AISystem6UnifiedSpecContracts = Object.freeze({
    /** Resolve the vendored contracts once. */
    ensure() {
      if (window.ClioWorksUnifiedContracts) return Promise.resolve(window.ClioWorksUnifiedContracts);
      if (!promise) {
        promise = import('/app/vendor/unified-spec/contracts.mjs')
          .then((module) => install(module))
          .catch((error) => {
            promise = null;
            throw error;
          });
      }
      return promise;
    },
    isInstalled: () => !!window.ClioWorksUnifiedContracts,
  });
})();
