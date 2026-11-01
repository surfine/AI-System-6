// Shared deterministic hinge sampling for preview and USDZ export.
// MacBook Neo values come from Apple's original Pose variant, before the
// preparation step bakes its transforms. Units are the model's centimeters.
(() => {
  const NEO_HINGE = Object.freeze({
    group: "unhvfLGugqNKvZm",
    pivot: Object.freeze([0, -0.10915308495800902, -10.501127103232617]),
    openDegrees: -110,
  });

  function clampProgress(value, fallback = 0) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  }

  function easeProgress(value) {
    const p = clampProgress(value);
    return p * p * (3 - 2 * p);
  }

  // Neo gets the same little physical settle as the Duo hinge: the lid moves
  // decisively through the middle, then eases into the endpoint instead of
  // stopping like a linear slideshow. It remains bounded so slider values are
  // still exact and saved recipes never overshoot.
  function neoEaseProgress(value) {
    const p = easeProgress(value);
    return Math.min(1, p + Math.sin(Math.PI * p) * 0.08 * (1 - p));
  }

  // The live asset is always the open model. Endpoints never swap geometry:
  // Apple's two authored poses contain slightly different lid vertices.
  function neoTransform(progress) {
    const degrees = (clampProgress(progress) - 1) * NEO_HINGE.openDegrees;
    const radians = degrees * Math.PI / 180;
    const [, y, z] = NEO_HINGE.pivot;
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return { degrees, radians, translation: [0, y - (c * y - s * z), z - (s * y + c * z)] };
  }

  function applyNeo(model, progress) {
    const lid = model?.getObjectByName(NEO_HINGE.group);
    if (!lid) throw new Error("MacBook Neo hinge group is missing.");
    const transform = neoTransform(progress);
    lid.rotation.set(transform.radians, 0, 0);
    lid.position.set(...transform.translation);
    model.updateMatrixWorld(true);
    return transform;
  }

  window.AISystem6CMFMotion = Object.freeze({ NEO_HINGE, clampProgress, easeProgress, neoEaseProgress, neoTransform, applyNeo });
})();
