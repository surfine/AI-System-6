/* ClioWorks unified spec C06/C08: installs the vendored cache policy onto the
 * desk's classic-script global scope under window.AISystem6ChatCachePolicy.
 *
 * The policy is an ES module (app/vendor/unified-spec/cache-policy.mjs,
 * vendored); this classic loader dynamic-imports it once and freezes the API
 * surface onto window. Loaded lazily by ensureChatCachePolicyModule() —
 * nothing on the boot path pays for it until a response actually carries
 * usage to account. */
(function () {
  'use strict';
  if (window.AISystem6ChatCachePolicy) return;

  let promise = null;

  function install(api) {
    window.AISystem6ChatCachePolicy = Object.freeze(api);
    window.AISystem6ChatCachePolicyLoaded = true;
    return window.AISystem6ChatCachePolicy;
  }

  window.AISystem6ChatCachePolicyLoader = Object.freeze({
    /** Resolve the vendored cache policy once. */
    ensure() {
      if (window.AISystem6ChatCachePolicy) return Promise.resolve(window.AISystem6ChatCachePolicy);
      if (!promise) {
        promise = import('/app/vendor/unified-spec/cache-policy.mjs')
          .then((module) => install(module))
          .catch((error) => {
            promise = null;
            throw error;
          });
      }
      return promise;
    },
    isInstalled: () => !!window.AISystem6ChatCachePolicy,
  });
})();
