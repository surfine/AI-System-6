import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import {
  canonicalAppShell,
  canonicalControlStatePriority,
  canonicalGeometryTokens,
  canonicalTypographyTokens,
  interfaceDocumentModels,
  interfaceObjectRoles,
  interfaceResponsiveModels,
  interfaceReferenceSurfaces,
  interfaceRoutes,
  interfaceShells,
  interfaceStatusLayouts,
  interfaceStatusModels,
  windowInterfaceRegistry,
} from "../../scripts/interface-guidelines-contract.mjs";

const test = createFeatureTest("interface-guidelines");
const index = read("index.html");
const foundation = read("styles/00-foundation.css");
const windowStyles = read("styles/10-windows.css");
const readerStyles = read("styles/20-reader-docmap.css");
const docMapEntry = read("app/core/docmap-entry.js");
const snapshotHarness = read("scripts/css-surface-snapshot.mjs");
const hig = read("HIG.md");
const higZh = read("HIG.zh-CN.md");
const design = read("DESIGN.md");

const dataWindows = [...index.matchAll(/\bdata-window="([^"]+)"/g)].map((match) => match[1]);
const registeredWindows = Object.keys(windowInterfaceRegistry);
const missingContracts = dataWindows.filter((name) => !windowInterfaceRegistry[name]);
const orphanContracts = registeredWindows.filter((name) => !dataWindows.includes(name));

test.assert(dataWindows.length === new Set(dataWindows).size, "every data-window name is unique");
test.assert(missingContracts.length === 0, `every product window declares an interface role${missingContracts.length ? `: missing ${missingContracts.join(", ")}` : ""}`);
test.assert(orphanContracts.length === 0, `the interface registry contains no stale windows${orphanContracts.length ? `: stale ${orphanContracts.join(", ")}` : ""}`);

const invalidRoles = [];
const invalidRoutes = [];
const invalidShells = [];
const invalidDocumentModels = [];
const invalidStatusModels = [];
const invalidResponsiveModels = [];
const invalidStatusLayouts = [];
const invalidReferenceSurfaces = [];
const unjustifiedStatusModels = [];
const mismatchedThreeSlotModels = [];
const invalidTdiHosts = [];

for (const [name, contract] of Object.entries(windowInterfaceRegistry)) {
  if (!interfaceObjectRoles.includes(contract.role)) invalidRoles.push(name);
  if (!interfaceRoutes.includes(contract.route)) invalidRoutes.push(name);
  if (!interfaceShells.includes(contract.shell)) invalidShells.push(name);
  if (!interfaceDocumentModels.includes(contract.documentModel)) invalidDocumentModels.push(name);
  if (!interfaceStatusModels.includes(contract.statusModel)) invalidStatusModels.push(name);
  if (!interfaceResponsiveModels.includes(contract.responsiveModel)) invalidResponsiveModels.push(name);
  if (!interfaceStatusLayouts.includes(contract.statusLayout)) invalidStatusLayouts.push(name);
  if (!interfaceReferenceSurfaces.includes(contract.referenceSurface)) invalidReferenceSurfaces.push(name);
  if (contract.statusModel !== "standard" && !contract.rationale) unjustifiedStatusModels.push(name);
  if ((contract.statusModel === "standard") !== (contract.statusLayout === "three-slot")) mismatchedThreeSlotModels.push(name);
  if (contract.documentModel === "tdi" && (!contract.tdiHost || !index.includes(`data-tdi-stack-for="${contract.tdiHost}"`))) {
    invalidTdiHosts.push(name);
  }
}

test.assert(invalidRoles.length === 0, `all windows use a named object role${invalidRoles.length ? `: ${invalidRoles.join(", ")}` : ""}`);
test.assert(invalidRoutes.length === 0, `all windows declare core, summoned, or system ownership${invalidRoutes.length ? `: ${invalidRoutes.join(", ")}` : ""}`);
test.assert(invalidShells.length === 0, `all windows use a named shell${invalidShells.length ? `: ${invalidShells.join(", ")}` : ""}`);
test.assert(invalidDocumentModels.length === 0, `all windows declare an SDI/TDI model${invalidDocumentModels.length ? `: ${invalidDocumentModels.join(", ")}` : ""}`);
test.assert(invalidStatusModels.length === 0, `all windows declare a status-bar model${invalidStatusModels.length ? `: ${invalidStatusModels.join(", ")}` : ""}`);
test.assert(invalidResponsiveModels.length === 0, `all windows declare a responsive model${invalidResponsiveModels.length ? `: ${invalidResponsiveModels.join(", ")}` : ""}`);
test.assert(invalidStatusLayouts.length === 0, `all windows declare a named status layout${invalidStatusLayouts.length ? `: ${invalidStatusLayouts.join(", ")}` : ""}`);
test.assert(invalidReferenceSurfaces.length === 0, `all windows choose an approved reference surface${invalidReferenceSurfaces.length ? `: ${invalidReferenceSurfaces.join(", ")}` : ""}`);
test.assert(unjustifiedStatusModels.length === 0, `every nonstandard status model has a role-based rationale${unjustifiedStatusModels.length ? `: ${unjustifiedStatusModels.join(", ")}` : ""}`);
test.assert(mismatchedThreeSlotModels.length === 0, `three-slot layout and standard status semantics stay paired${mismatchedThreeSlotModels.length ? `: ${mismatchedThreeSlotModels.join(", ")}` : ""}`);
test.assert(invalidTdiHosts.length === 0, `every TDI window mounts the shared compact stack in existing chrome${invalidTdiHosts.length ? `: ${invalidTdiHosts.join(", ")}` : ""}`);

function sectionForWindow(name) {
  const marker = `data-window="${name}"`;
  const markerIndex = index.indexOf(marker);
  if (markerIndex < 0) return "";
  const sectionStart = index.lastIndexOf("<section", markerIndex);
  const asideStart = index.lastIndexOf("<aside", markerIndex);
  const start = Math.max(sectionStart, asideStart);
  if (start < 0) return "";
  const tagName = start === asideStart ? "aside" : "section";
  const end = index.indexOf(`</${tagName}>`, markerIndex);
  return end >= 0 ? index.slice(start, end + tagName.length + 3) : "";
}

const invalidStandardStatusBars = [];
const invalidCompactStatusBars = [];
const invalidNoneStatusBars = [];
for (const [name, contract] of Object.entries(windowInterfaceRegistry)) {
  const section = sectionForWindow(name);
  const hasDetailsBar = /class="[^"]*\bdetails-bar\b/.test(section);
  if (contract.statusModel === "standard" && !["app-status-bar", "status-bar-leading", "status-bar-context", "status-bar-trailing"].every((part) => section.includes(part))) {
    invalidStandardStatusBars.push(name);
  }
  if (contract.statusLayout === "compact" && (!hasDetailsBar || !["compact-status-bar", "status-bar-leading"].every((part) => section.includes(part)))) {
    invalidCompactStatusBars.push(name);
  }
  if (contract.statusLayout === "none" && hasDetailsBar) invalidNoneStatusBars.push(name);
}
test.assert(
  invalidStandardStatusBars.length === 0,
  `every standard status bar provides leading, context, and trailing slots${invalidStandardStatusBars.length ? `: ${invalidStandardStatusBars.join(", ")}` : ""}`,
);
test.assert(
  invalidCompactStatusBars.length === 0,
  `every compact status layout uses the shared compact semantic shell${invalidCompactStatusBars.length ? `: ${invalidCompactStatusBars.join(", ")}` : ""}`,
);
test.assert(
  invalidNoneStatusBars.length === 0,
  `windows that declare no status layout do not carry a persistent details bar${invalidNoneStatusBars.length ? `: ${invalidNoneStatusBars.join(", ")}` : ""}`,
);

for (const [role, token] of Object.entries(canonicalTypographyTokens)) {
  test.assertIncludes(foundation, `${token}:`, `the ${role} typography role resolves through ${token}`);
}

for (const [role, token] of Object.entries(canonicalGeometryTokens)) {
  test.assertIncludes(foundation, `${token}:`, `the ${role} geometry role resolves through ${token}`);
}

test.assert(canonicalAppShell.titleIdentity === "application", "title bars identify applications rather than the active document");
test.assert(canonicalAppShell.documentIdentity === "status-context", "active documents belong to the status context");
test.assert(canonicalAppShell.statusSlots.join(",") === "leading,context,trailing", "the app status bar has one shared three-slot order");
test.assert(canonicalAppShell.tdiWide === "vertical-rail", "wide TDI uses the shared vertical rail");
test.assert(canonicalAppShell.tdiCompact === "status-context-menu", "compact TDI moves into the status context");
test.assert(canonicalAppShell.forbiddenTdi === "second-horizontal-row", "TDI never consumes a permanent second horizontal row");
test.assert(canonicalAppShell.bottomControls === "owned-safe-inset", "bottom controls remain inset within their owning pane");
test.assertIncludes(windowStyles, "grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto", "compact status bars preserve all three semantic slots");
test.assertNotIncludes(windowStyles, ".details-bar.app-status-bar > .status-bar-leading {\n    display: none;", "compact status bars do not discard live receipts");
test.assertIncludes(readerStyles, "max-width: min(280px, 42cqi)", "compact TDI identity responds to its window rather than the browser viewport");
test.assertIncludes(index, '<span class="status-bar-leading" data-i18n="limited_web_notes">', "Searcher reports its search mode through the shared leading slot");
test.assertIncludes(index, '<span class="status-bar-context" id="find-path-provider">', "Searcher centers the active provider through the shared context slot");
test.assertIncludes(index, '<span class="status-bar-trailing" id="find-path-count">', "Searcher keeps its confirmed result count in the shared trailing slot");
test.assertNotIncludes(windowStyles, ".find-path-details {", "Searcher no longer carries a private copy of the three-slot grid");
test.assertIncludes(docMapEntry, 'syncDocMapEntryButton(document.querySelector("#reader-docmap-selection-command"), readerSelectionReadiness)', "Reader selection commands share the DocMap readiness policy");
test.assertIncludes(docMapEntry, 'syncDocMapEntryButton(document.querySelector("#reader-docmap-source-command"), readerSourceReadiness)', "Reader whole-source commands share the DocMap readiness policy");
test.assert(
  canonicalControlStatePriority.join(",") === "disabled,loading,selected,pressed,focus-visible,hover-preview,default",
  "all controls share one semantic state priority",
);

test.assertIncludes(design, "[HIG.md](HIG.md)", "the design authority routes agents to the application HIG");
test.assertIncludes(hig, "## Canonical application shell", "the HIG defines a reusable application shell");
test.assertIncludes(hig, "### Three-slot status bar", "the HIG defines status ownership instead of per-app alignment guesses");
test.assertIncludes(hig, "#### Status layout declarations", "the HIG names the allowed status-layout exceptions");
for (const layout of interfaceStatusLayouts) {
  test.assertIncludes(hig, `\`${layout}\``, `the HIG documents the ${layout} status layout`);
}
test.assertIncludes(hig, "### TDI document model", "the HIG defines one adaptive TDI model");
test.assertIncludes(hig, "## Typography system", "the HIG defines semantic typography roles");
test.assertIncludes(hig, "## New application checklist", "the HIG makes new-app design decisions explicit before implementation");
test.assertIncludes(higZh, "# AI System 6 人机界面指南", "the HIG has a Chinese human-reference mirror");
test.assertIncludes(higZh, "英文版为准", "the Chinese HIG identifies the canonical English source");
test.assertIncludes(snapshotHarness, '"application-status-bars": {', "the visual harness covers the cross-application status rollout");
for (const scenario of ["project-cd", "chat-file", "searcher", "context-panel", "print-directory", "rebuild-flow"]) {
  test.assertIncludes(snapshotHarness, `id: "${scenario}"`, `the status snapshot matrix includes ${scenario}`);
}

test.finish();
