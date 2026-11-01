import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("liquid-glass-overlay");
const overlay = read("app/core/liquid-glass-overlay.js");
const liquid = read("styles/70-liquid-glass.css");

test.assertIncludes(overlay, "uniform float u_contrast;", "increased contrast reaches the WebGL overlay as a uniform");
test.assertIncludes(overlay, "uniform float u_reduced_transparency;", "reduced transparency reaches the WebGL overlay as a uniform");
test.assertIncludes(overlay, "uniform float u_edge_contrast;", "the shared edge-contrast parameter reaches WebGL");
test.assertIncludes(overlay, "uniform float u_refraction;", "the shared refraction parameter reaches WebGL");
test.assertIncludes(overlay, "gl.uniform1f(uniforms.contrast, increasedContrast ? 1 : 0)", "contrast is uploaded each render instead of only read");
test.assertIncludes(overlay, "gl.uniform1f(uniforms.reducedTransparency, reducedTransparency ? 1 : 0)", "reduced transparency is uploaded each render");
test.assertIncludes(overlay, "gl.uniform1f(uniforms.edgeContrast, edgeContrastScale)", "the CSS edge parameter is uploaded each render");
test.assertIncludes(overlay, "gl.uniform1f(uniforms.refraction, refractionLevel)", "the CSS refraction parameter is uploaded each render");
test.assertIncludes(overlay, "contrastReachesOverlay: true", "diagnostics reports that contrast is wired");
test.assertIncludes(overlay, "reducedTransparencyReachesOverlay: true", "diagnostics reports that reduced transparency is wired");

test.assertIncludes(liquid, "--liquid-fill-tint:", "Liquid Glass exposes the fill tint parameter");
test.assertIncludes(liquid, "--liquid-toolbar-tint:", "Liquid Glass exposes the toolbar tint parameter");
test.assertIncludes(liquid, "--liquid-sidebar-tint:", "Liquid Glass exposes the sidebar tint parameter");
test.assertIncludes(liquid, "--liquid-menu-alpha:", "Liquid Glass exposes the menu alpha parameter");
test.assertIncludes(liquid, "--liquid-edge-contrast:", "Liquid Glass exposes the edge contrast parameter");
test.assertIncludes(liquid, "--liquid-refraction:", "Liquid Glass exposes the refraction parameter");
test.assertIncludes(liquid, "--liquid-interaction-tint:", "Liquid Glass exposes the interaction tint parameter");
test.assertIncludes(liquid, "--liquid-inactive-chrome:", "Liquid Glass exposes the inactive chrome parameter");
test.assertIncludes(liquid, "--liquid-content-surface:", "Liquid Glass exposes the content surface parameter");
test.assertIncludes(liquid, "--liquid-motion-scale:", "Liquid Glass exposes the motion scale parameter");
test.assertIncludes(liquid, "var(--liquid-fill-tint)", "surface-primary consumes the named fill tint token");
test.assertIncludes(liquid, "var(--liquid-toolbar-tint)", "toolbar background consumes the named toolbar tint token");
test.assertIncludes(liquid, "var(--liquid-sidebar-tint)", "sidebar background consumes the named sidebar tint token");
test.assertIncludes(liquid, "var(--liquid-menu-alpha)", "menu material consumes the named alpha token");
test.assertIncludes(liquid, "var(--liquid-edge-contrast)", "glass edges consume the named contrast token");
test.assertIncludes(liquid, "var(--liquid-inactive-chrome)", "inactive title chrome consumes the named material token");
test.assertIncludes(liquid, "var(--liquid-content-surface)", "content/status surfaces consume the named material token");
test.assertIncludes(liquid, "var(--liquid-motion-scale)", "press motion consumes the named motion parameter");
test.assertIncludes(overlay, 'getPropertyValue("--liquid-refraction")', "overlay runtime reads the shared refraction parameter");
test.assertIncludes(overlay, 'getPropertyValue("--liquid-motion-scale")', "overlay runtime reads the shared motion parameter");
test.assertIncludes(overlay, "0.72 + 0.28 * tintLevel", "an unresolved custom-property calc still drives refraction from the tint control");
test.assertIncludes(overlay, "0.8 + 0.4 * tintLevel", "an unresolved custom-property calc still drives overlay motion from the tint control");

test.finish();
