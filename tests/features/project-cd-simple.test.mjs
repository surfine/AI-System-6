// Project CD stays a simple Finder-like collection of concrete export files.
// Selecting a file enables direct Download and Print to PDF actions. Recipient
// intent remains in Question Sheet; incomplete manuscript review is raised only
// when the user actually tries to take a file out of the Project CD.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("project-cd-simple");
const html = read("index.html");
const exportImport = read("app/features/export-import.js");
const projectCdPrint = read("app/features/project-cd-print.js");
const wireup = read("app/core/wireup.js");
const domHandles = read("app/core/dom-handles.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const dictionary = read("app/data/system-dictionary.js");
const css = read("styles/50-apps.css");

const projectCdWindow = html.match(/<section class="window project-cd-window[\s\S]*?<section class="window page-setup-window/)?.[0] || "";

test.assertIncludes(projectCdWindow, 'id="download-project-cd"', "Project CD exposes one direct Download action");
test.assertIncludes(projectCdWindow, 'id="print-project-cd-pdf"', "Project CD exposes one direct Print to PDF action");
test.assertIncludes(projectCdWindow, 'id="clear-project-cd"', "Project CD keeps the collection-level Clear action");
test.assertNotIncludes(projectCdWindow, "project-cd-recipient", "recipient intent is not duplicated from Question Sheet");
test.assertNotIncludes(projectCdWindow, "delivery-recipe", "format recipes do not occupy the file window");
test.assertNotIncludes(projectCdWindow, "delivery-checks", "a persistent delivery checklist does not occupy the file window");
test.assertNotIncludes(projectCdWindow, "audit-capsule", "the cancelled audit capsule has no Project CD action");

test.assertIncludes(exportImport, "async function downloadSelectedProjectCdItem", "Download has one explicit selected-file coordinator");
test.assertIncludes(exportImport, "async function printSelectedProjectCdItem", "Print has one explicit selected-file coordinator");
test.assertIncludes(exportImport, "function confirmProjectCdExportAfterReview", "review state is checked only at the export boundary");
test.assertIncludes(exportImport, 'item.sourceKind !== "markdown"', "non-manuscript Project CD files do not receive an irrelevant Review Desk warning");
test.assertIncludes(exportImport, 'showSystemModal(t("project_cd_review_reminder", item.title), "confirm")', "an unfinished manuscript gets one lightweight confirmation");
test.assertMatches(exportImport, /downloadSelectedProjectCdItem[\s\S]*downloadProjectCdItem\(item\)/, "confirmed Download creates the selected real file");
test.assertMatches(exportImport, /printSelectedProjectCdItem[\s\S]*printSelectedProjectCdPdf\(\)/, "confirmed Print enters the real PDF path");
test.assertIncludes(exportImport, "reviewDeskComplete:", "new manuscript burns retain real Review Desk evidence");
test.assertNotIncludes(exportImport, "projectCdDelivery", "Project CD no longer persists a second delivery workflow");
test.assertNotIncludes(exportImport, "deliveryPreparation", "Project CD no longer records a redundant preparation state");
test.assertNotIncludes(exportImport, "downloadProjectCdPlainText", "extra format conversion is not a permanent Project CD control path");
test.assertNotIncludes(exportImport, "AuditCapsule", "the cancelled audit capsule has no runtime generator");

test.assertIncludes(wireup, 'downloadProjectCdButton?.addEventListener("click", downloadSelectedProjectCdItem)', "the direct Download button is wired");
test.assertIncludes(wireup, 'printProjectCdPdfButton?.addEventListener("click", printSelectedProjectCdItem)', "the direct Print button is wired");
test.assertIncludes(domHandles, 'document.querySelector("#download-project-cd")', "Download uses the centralized DOM registry");
test.assertIncludes(domHandles, 'document.querySelector("#print-project-cd-pdf")', "Print uses the centralized DOM registry");
test.assertNotIncludes(domHandles, "projectCdRecipientInput", "the removed recipient form has no dormant handle");
test.assertIncludes(projectCdPrint, "return false;", "a blocked print window cannot report success");

test.assertNotIncludes(css, ".project-cd-delivery", "the removed panel has no dormant layout layer");
test.assertIncludes(en, "project_cd_review_reminder", "English has the boundary-only review reminder");
test.assertIncludes(zh, "project_cd_review_reminder", "Chinese has the boundary-only review reminder");
test.assertNotIncludes(en, "project_cd_delivery_", "English no longer exposes delivery-ticket terminology");
test.assertNotIncludes(zh, "project_cd_delivery_", "Chinese no longer exposes delivery-ticket terminology");
test.assertNotIncludes(dictionary, "Audit Capsule", "System Help no longer defines the cancelled object");
test.assertNotIncludes(dictionary, "审计胶囊", "Chinese System Help no longer defines the cancelled object");
test.assertNotIncludes(dictionary, "Audit Capsule", "Help cannot resurrect the cancelled object");
test.assertNotIncludes(dictionary, "审计胶囊", "Chinese Help cannot resurrect the cancelled object");

test.finish();
