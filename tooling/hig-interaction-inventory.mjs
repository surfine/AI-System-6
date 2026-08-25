#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "acorn";
import {
  assertValidAuditArtifacts,
  higAuditSchemaVersion,
} from "./hig-ui-ux-audit-contract.mjs";

const thisFile = fileURLToPath(import.meta.url);
const defaultRoot = dirname(dirname(thisFile));
const auditEvidenceRelativeRoot = join("internal", "evidence", "drafts", "hig-ui-ux-audit");

const markupAttributes = Object.freeze([
  "data-window",
  "data-action",
  "data-static-finder-action",
  "data-open",
]);
const directListenerEvents = new Set([
  "click", "dblclick", "submit", "change", "input", "beforeinput",
  "focus", "blur", "keydown", "keyup", "pointerdown", "pointermove",
  "pointerup", "pointercancel", "dragstart", "dragend", "dragenter",
  "dragleave", "dragover", "drop", "touchstart", "touchmove", "touchend",
]);
const dragEvents = new Set(["dragstart", "dragend", "dragenter", "dragleave", "dragover", "drop"]);

function parseJs(source) {
  const options = {
    ecmaVersion: "latest",
    allowReturnOutsideFunction: true,
    locations: true,
    ranges: true,
  };
  try {
    return parse(source, { ...options, sourceType: "script" });
  } catch (scriptError) {
    try {
      return parse(source, { ...options, sourceType: "module" });
    } catch (moduleError) {
      moduleError.cause = scriptError;
      throw moduleError;
    }
  }
}

function walkAst(rootNode, visit) {
  const stack = [{ node: rootNode, parent: null }];
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    count += 1;
    visit(current.node, current.parent);
    const children = [];
    for (const [key, value] of Object.entries(current.node)) {
      if (["type", "start", "end", "loc", "range"].includes(key)) continue;
      if (Array.isArray(value)) {
        for (const item of value) if (item && typeof item.type === "string") children.push(item);
      } else if (value && typeof value.type === "string") {
        children.push(value);
      }
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], parent: current.node });
    }
  }
  return count;
}

function staticString(node) {
  if (!node) return "";
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.map((part) => part.value.cooked ?? part.value.raw).join("");
  }
  return "";
}

function propertyName(node) {
  if (!node) return "";
  if (!node.computed && node.key?.type === "Identifier") return node.key.name;
  return staticString(node.key);
}

function memberName(node) {
  if (!node || node.type !== "MemberExpression") return "";
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  return staticString(node.property);
}

function objectProperty(objectNode, name) {
  if (!objectNode || objectNode.type !== "ObjectExpression") return null;
  return objectNode.properties.find((property) => property.type === "Property" && propertyName(property) === name) || null;
}

function nodeSource(source, node, limit = 180) {
  if (!node || !Number.isInteger(node.start) || !Number.isInteger(node.end)) return "";
  return source.slice(node.start, node.end).replace(/\s+/g, " ").slice(0, limit);
}

function sourceLocation(file, node, lineOffset = 0, columnOffset = 0) {
  const line = Math.max(1, Number(node?.loc?.start?.line || 1) + lineOffset);
  const column = Math.max(0, Number(node?.loc?.start?.column || 0) + columnOffset);
  return Object.freeze({ file, line, column });
}

function lineAndColumnAt(text, index, baseLine = 1, baseColumn = 0) {
  const prefix = text.slice(0, index);
  const lines = prefix.split("\n");
  return {
    line: baseLine + lines.length - 1,
    column: lines.length === 1 ? baseColumn + lines[0].length : lines.at(-1).length,
  };
}

function attributeFromTag(tag, attribute) {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? match[2] : "";
}

function markupRecords(markup, file, { baseLine = 1, baseColumn = 0 } = {}) {
  const records = [];
  const stack = [];
  const tagPattern = /<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g;
  let match;
  while ((match = tagPattern.exec(markup))) {
    const tag = match[0];
    const tagName = match[1].toLowerCase();
    const closing = /^<\//.test(tag);
    if (closing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const item = stack.pop();
        if (item.tagName === tagName) break;
      }
      continue;
    }
    const inheritedWindow = [...stack].reverse().find((item) => item.windowId)?.windowId || "";
    const ownWindow = attributeFromTag(tag, "data-window");
    const ownerWindow = ownWindow || inheritedWindow;
    const position = lineAndColumnAt(markup, match.index, baseLine, baseColumn);
    const location = Object.freeze({ file, ...position });
    for (const attribute of markupAttributes) {
      const value = attributeFromTag(tag, attribute);
      if (value) records.push(Object.freeze({ attribute, value, ownerWindow, tagName, location }));
    }
    if (tagName === "dialog") {
      records.push(Object.freeze({
        attribute: "dialog",
        value: attributeFromTag(tag, "id") || attributeFromTag(tag, "aria-labelledby") || `dialog-${position.line}`,
        ownerWindow,
        tagName,
        location,
      }));
    }
    if (!/\/>$/.test(tag) && !["input", "img", "br", "hr", "meta", "link"].includes(tagName)) {
      stack.push({ tagName, windowId: ownerWindow });
    }
  }
  return records;
}

function listFilesRecursively(directory, predicate) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listFilesRecursively(path, predicate));
    else if (entry.isFile() && predicate(path)) result.push(path);
  }
  return result.sort();
}

function resolveBindings(ast) {
  const bindings = new Map();
  walkAst(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init) {
      bindings.set(node.id.name, node.init);
    }
  });
  return bindings;
}

function resolveNode(node, bindings, seen = new Set()) {
  if (!node || node.type !== "Identifier" || seen.has(node.name) || !bindings.has(node.name)) return node;
  seen.add(node.name);
  return resolveNode(bindings.get(node.name), bindings, seen);
}

function collectStaticStrings(node, bindings, result = new Set(), seen = new Set()) {
  if (!node || seen.has(node)) return result;
  seen.add(node);
  const resolved = resolveNode(node, bindings);
  if (resolved !== node) return collectStaticStrings(resolved, bindings, result, seen);
  const literal = staticString(node);
  if (literal) result.add(literal);
  if (node.type === "SpreadElement") collectStaticStrings(node.argument, bindings, result, seen);
  if (node.type === "ArrayExpression") node.elements.forEach((element) => collectStaticStrings(element, bindings, result, seen));
  if (node.type === "CallExpression" && memberName(node.callee) === "map" && node.callee.object) {
    collectStaticStrings(node.callee.object, bindings, result, seen);
  }
  return result;
}

function commandEntries(commandsNode, bindings) {
  const resolved = resolveNode(commandsNode, bindings);
  if (!resolved) return [];
  if (resolved.type === "ObjectExpression") {
    return resolved.properties
      .filter((property) => property.type === "Property" && propertyName(property))
      .map((property) => ({ action: propertyName(property), handlerNode: objectProperty(property.value, "handler")?.value || property.value, node: property }));
  }
  if (resolved.type === "CallExpression" && memberName(resolved.callee) === "fromEntries") {
    const input = resolved.arguments[0];
    const mapSource = input?.type === "CallExpression" && memberName(input.callee) === "map" ? input.callee.object : input;
    const actions = [...collectStaticStrings(mapSource, bindings)].filter((value) => /^[a-z0-9]+(?:[-:][a-z0-9]+)+$/i.test(value));
    return actions.map((action) => ({ action, handlerNode: input, node: mapSource || resolved }));
  }
  return [];
}

function assignmentDataAttribute(node) {
  if (node.type !== "AssignmentExpression") return null;
  const value = staticString(node.right);
  if (!value || node.left.type !== "MemberExpression") return null;
  const leaf = memberName(node.left);
  if (node.left.object?.type === "MemberExpression" && memberName(node.left.object) === "dataset") {
    if (leaf === "window") return { attribute: "data-window", value };
    if (leaf === "action") return { attribute: "data-action", value };
    if (leaf === "staticFinderAction") return { attribute: "data-static-finder-action", value };
    if (leaf === "open") return { attribute: "data-open", value };
  }
  return null;
}

function setAttributeDataAttribute(node) {
  if (node.type !== "CallExpression" || memberName(node.callee) !== "setAttribute") return null;
  const attribute = staticString(node.arguments[0]);
  const value = staticString(node.arguments[1]);
  if (!markupAttributes.includes(attribute) || !value) return null;
  return { attribute, value };
}

function ownerForFile(markup, registrations) {
  const windows = new Set([
    ...markup.filter((record) => record.attribute === "data-window").map((record) => record.value),
    ...registrations.map((record) => record.windowName).filter(Boolean),
  ]);
  return windows.size === 1 ? [...windows][0] : "";
}

function listenerKind(event) {
  if (dragEvents.has(event)) return "drag-drop";
  if (event.startsWith("pointer") || event.startsWith("touch")) return "pointer-event";
  return "direct-listener";
}

function inferStateTransition(action, event) {
  if (/^(?:open|show|reveal|bring)-/.test(action)) return "opens-or-reveals-surface";
  if (/^(?:close|hide|quit|dismiss|cancel)-/.test(action)) return "closes-or-dismisses-surface";
  if (/^(?:toggle|switch|set|view)-/.test(action)) return "changes-visible-state";
  if (/^(?:new|create|add|insert|save|archive|delete|erase|empty|move|rename|restore|eject)-/.test(action)) return "changes-content-or-object-state";
  if (event) return "runtime-behavior-requires-browser-verification";
  return "command-effect-requires-runtime-verification";
}

function inferPersistence(action) {
  return /(?:^|[-:])(?:save|delete|erase|empty|move|rename|archive|restore|insert|create|new|keep|eject|reset)(?:-|$)/.test(action)
    ? "potential-durable-write-requires-runtime-verification"
    : "no-durable-write-observed-statically";
}

function inferReceipt(action) {
  return /(?:ai|search|find|generate|import|export|save|clip|insert|delete|erase|print|download|share|install|run|review|translate|draft)/.test(action)
    ? "visible-receipt-requires-runtime-verification"
    : "immediate-feedback-requires-runtime-verification";
}

function interactionId(record) {
  const source = record.source;
  const token = [record.kind, record.action || record.event || "interaction", source.file, source.line, source.column]
    .join("-")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return token;
}

function makeInteraction({ kind, action = "", ownerWindow = "", handler = "", event = "", source, alternativeInputs = [] }) {
  const record = {
    id: "",
    kind,
    action,
    ownerWindow,
    handler,
    event,
    source,
    stateTransition: inferStateTransition(action, event),
    persistenceImpact: inferPersistence(action),
    receipt: inferReceipt(action),
    alternativeInputs: [...new Set(alternativeInputs)].sort(),
  };
  record.id = interactionId(record);
  return Object.freeze(record);
}

export function inspectRegistrySource(source, file = "tooling/interface-guidelines-contract.mjs") {
  const ast = parseJs(source);
  let properties = [];
  let nodesVisited = 0;
  // The exported `windowInterfaceRegistry` stopped being an object literal: it
  // is now Object.freeze(Object.fromEntries(Object.entries(contracts).map(...))),
  // a computed value with no properties to read, so this walk found zero entries
  // and the audit aborted. The literal that actually declares the windows is
  // `windowInterfaceContracts`, which the registry derives from. Read whichever
  // of the two is a literal, so the audit survives the next refactor of the
  // derived one; keys come from the source of truth either way.
  const literalNames = ["windowInterfaceContracts", "windowInterfaceRegistry"];
  const byName = new Map();
  nodesVisited = walkAst(ast, (node) => {
    if (node.type !== "VariableDeclarator" || node.id.type !== "Identifier") return;
    if (!literalNames.includes(node.id.name)) return;
    let value = node.init;
    if (value?.type === "CallExpression" && memberName(value.callee) === "freeze") value = value.arguments[0];
    if (value?.type === "ObjectExpression") {
      byName.set(node.id.name, value.properties.filter((property) => property.type === "Property"));
    }
  });
  for (const name of literalNames) {
    if (byName.has(name)) { properties = byName.get(name); break; }
  }
  const entries = properties.map((property) => ({ key: propertyName(property), location: sourceLocation(file, property) })).filter((entry) => entry.key);
  const byKey = new Map();
  for (const entry of entries) {
    if (!byKey.has(entry.key)) byKey.set(entry.key, []);
    byKey.get(entry.key).push(entry.location);
  }
  const duplicates = [...byKey.entries()]
    .filter(([, locations]) => locations.length > 1)
    .map(([key, locations]) => Object.freeze({ key, locations: Object.freeze(locations) }))
    .sort((left, right) => left.key.localeCompare(right.key));
  return Object.freeze({ entries: Object.freeze(entries), duplicates: Object.freeze(duplicates), nodesVisited });
}

export function inspectJavaScriptSource(source, file = "fixture.js") {
  const ast = parseJs(source);
  const bindings = resolveBindings(ast);
  const markup = [];
  const applications = [];
  const actionHandlers = [];
  const shortcuts = [];
  const menuCommands = [];
  const windowCalls = [];
  const listeners = [];
  let nodesVisited = 0;

  nodesVisited = walkAst(ast, (node) => {
    if (node.type === "Literal" || node.type === "TemplateLiteral") {
      const value = staticString(node);
      if (value && (value.includes("data-") || value.includes("<dialog"))) {
        markup.push(...markupRecords(value, file, {
          baseLine: node.loc?.start?.line || 1,
          baseColumn: node.loc?.start?.column || 0,
        }));
      }
    }

    const assignmentRecord = assignmentDataAttribute(node);
    if (assignmentRecord) markup.push(Object.freeze({ ...assignmentRecord, ownerWindow: "", tagName: "dynamic", location: sourceLocation(file, node) }));
    const setAttributeRecord = setAttributeDataAttribute(node);
    if (setAttributeRecord) markup.push(Object.freeze({ ...setAttributeRecord, ownerWindow: "", tagName: "dynamic", location: sourceLocation(file, node) }));

    if (node.type === "CallExpression" && memberName(node.callee) === "registerApplication") {
      const descriptor = resolveNode(node.arguments[0], bindings);
      if (descriptor?.type === "ObjectExpression") {
        const id = staticString(objectProperty(descriptor, "id")?.value);
        const windowName = staticString(objectProperty(descriptor, "windowName")?.value);
        const commands = commandEntries(objectProperty(descriptor, "commands")?.value, bindings);
        applications.push(Object.freeze({ id, windowName, commands, location: sourceLocation(file, node) }));
      }
    }

    if (node.type === "CallExpression" && memberName(node.callee) === "registerCommand") {
      const action = staticString(node.arguments[0]);
      if (action) actionHandlers.push(Object.freeze({ action, handler: nodeSource(source, node.arguments[1]), location: sourceLocation(file, node) }));
    }

    if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "menuItem") {
      const action = staticString(node.arguments[0]);
      if (action) menuCommands.push(Object.freeze({ action, location: sourceLocation(file, node) }));
    }

    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.id.name === "keyboardShortcutRegistry") {
      const array = resolveNode(node.init, bindings);
      if (array?.type === "ArrayExpression") for (const element of array.elements) {
        if (element?.type !== "ObjectExpression") continue;
        const id = staticString(objectProperty(element, "id")?.value);
        const action = staticString(objectProperty(element, "action")?.value);
        const key = staticString(objectProperty(element, "key")?.value);
        const scopeNode = objectProperty(element, "scope")?.value;
        const scopes = scopeNode?.type === "ArrayExpression"
          ? scopeNode.elements.map(staticString).filter(Boolean)
          : [staticString(scopeNode)].filter(Boolean);
        if (id || action) shortcuts.push(Object.freeze({ id, action, key, scopes, location: sourceLocation(file, element) }));
      }
    }

    if (node.type === "FunctionDeclaration" && node.id?.name === "getApplicationActionHandlers") {
      walkAst(node.body, (child) => {
        if (child.type !== "AssignmentExpression" || child.left.type !== "Identifier" || child.left.name !== "applicationActionHandlersCache") return;
        const object = resolveNode(child.right, bindings);
        if (object?.type !== "ObjectExpression") return;
        for (const property of object.properties) {
          const action = property.type === "Property" ? propertyName(property) : "";
          if (action) actionHandlers.push(Object.freeze({ action, handler: nodeSource(source, property.value), location: sourceLocation(file, property) }));
        }
      });
    }

    if (node.type === "CallExpression" && node.callee.type === "Identifier" && ["openWindow", "closeWindow"].includes(node.callee.name)) {
      const windowName = staticString(node.arguments[0]);
      if (windowName) windowCalls.push(Object.freeze({ operation: node.callee.name, windowName, location: sourceLocation(file, node), handler: nodeSource(source, node) }));
    }

    if (node.type === "CallExpression" && memberName(node.callee) === "addEventListener") {
      const event = staticString(node.arguments[0]);
      if (!event || !directListenerEvents.has(event)) return;
      listeners.push(Object.freeze({
        event,
        target: nodeSource(source, node.callee.object),
        handler: nodeSource(source, node.arguments[1]),
        location: sourceLocation(file, node),
      }));
    }

    if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression") {
      const property = memberName(node.left);
      if (!property.startsWith("on") || !directListenerEvents.has(property.slice(2))) return;
      listeners.push(Object.freeze({
        event: property.slice(2),
        target: nodeSource(source, node.left.object),
        handler: nodeSource(source, node.right),
        location: sourceLocation(file, node),
      }));
    }
  });

  const fallbackOwner = ownerForFile(markup, applications);
  const ownedMarkup = markup.map((record) => record.ownerWindow || !fallbackOwner
    ? record
    : Object.freeze({ ...record, ownerWindow: fallbackOwner }));
  return Object.freeze({
    nodesVisited,
    markup: Object.freeze(ownedMarkup),
    applications: Object.freeze(applications),
    actionHandlers: Object.freeze(actionHandlers),
    shortcuts: Object.freeze(shortcuts),
    menuCommands: Object.freeze(menuCommands),
    windowCalls: Object.freeze(windowCalls),
    listeners: Object.freeze(listeners),
  });
}

export function assertMeaningfulInventoryTraversal(scan) {
  if (!scan || !Number.isInteger(scan.nodesVisited) || scan.nodesVisited <= 1) {
    throw new Error("HIG inventory AST traversal visited no meaningful nodes.");
  }
  const evidenceCount = ["markup", "applications", "actionHandlers", "shortcuts", "menuCommands", "windowCalls", "listeners"]
    .reduce((total, key) => total + (Array.isArray(scan[key]) ? scan[key].length : 0), 0);
  if (evidenceCount === 0) throw new Error("HIG inventory traversal found no interaction evidence.");
  return true;
}

export function findUnhandledSurfacedActions({ markup = [], scans = [] } = {}) {
  const handled = new Set();
  const surfaced = new Map();
  const addSurface = (action, location) => {
    if (!action) return;
    if (!surfaced.has(action)) surfaced.set(action, []);
    surfaced.get(action).push(location);
  };
  for (const record of markup) {
    if (["data-action", "data-static-finder-action"].includes(record.attribute)) addSurface(record.value, record.location);
  }
  for (const item of scans) {
    const scan = item.scan || item;
    scan.actionHandlers?.forEach((record) => handled.add(record.action));
    scan.applications?.forEach((application) => application.commands.forEach((command) => handled.add(command.action)));
    scan.menuCommands?.forEach((command) => addSurface(command.action, command.location));
    scan.shortcuts?.forEach((shortcut) => addSurface(shortcut.action, shortcut.location));
  }
  return [...surfaced.entries()]
    .filter(([action]) => !handled.has(action))
    .map(([action, locations]) => Object.freeze({ action, locations: Object.freeze(sortLocations(locations)) }))
    .sort((left, right) => left.action.localeCompare(right.action));
}

export function findDragAlternativeGaps({ scans = [] } = {}) {
  const listenerGroups = new Map();
  for (const item of scans) {
    const scan = item.scan || item;
    const file = item.file || scan.listeners?.[0]?.location?.file || "fixture.js";
    for (const listener of scan.listeners || []) {
      const key = `${file}:${listener.target}`;
      if (!listenerGroups.has(key)) listenerGroups.set(key, []);
      listenerGroups.get(key).push(listener);
    }
  }
  const gaps = [];
  for (const [key, listeners] of listenerGroups) {
    const events = new Set(listeners.map((listener) => listener.event));
    const dragListeners = listeners.filter((listener) => dragEvents.has(listener.event));
    if (!dragListeners.length || events.has("click") || events.has("keydown")) continue;
    gaps.push(Object.freeze({
      key,
      target: listeners[0].target,
      events: Object.freeze([...events].sort()),
      locations: Object.freeze(dragListeners.map((listener) => listener.location)),
    }));
  }
  return gaps.sort((left, right) => left.key.localeCompare(right.key));
}

function finding({ id, ruleId, title, severity = "P2", confidence = "High", expected, actual, affected, reproduction, evidence, recommendation, verification }) {
  return Object.freeze({ id, ruleId, title, severity, confidence, expected, actual, affected, reproduction, evidence, recommendation, verification });
}

function buildCoverageMatrix(sourceCommit, interactions) {
  const contexts = [
    { device: "iphone-390x844", orientation: "portrait", input: "touch" },
    { device: "iphone-844x390", orientation: "landscape", input: "touch" },
    { device: "ipad-820x1180", orientation: "portrait", input: "touch" },
    { device: "ipad-1180x820", orientation: "landscape", input: "touch" },
    { device: "ipad-820x1180", orientation: "portrait", input: "keyboard" },
    { device: "ipad-1180x820", orientation: "landscape", input: "pointer" },
  ];
  const languages = ["en", "zh-CN"];
  const themes = ["classic", "liquid-glass"];
  const entries = [];
  for (const interaction of interactions) for (const context of contexts) for (const language of languages) for (const theme of themes) {
    entries.push(Object.freeze({
      interactionId: interaction.id,
      ...context,
      language,
      theme,
      state: "primary-success-path",
      status: "not-run",
      evidence: [],
    }));
  }
  return Object.freeze({
    schemaVersion: higAuditSchemaVersion,
    kind: "coverage-matrix",
    sourceCommit,
    dimensions: Object.freeze({
      devices: Object.freeze([...new Set(contexts.map((item) => item.device))]),
      orientations: Object.freeze(["portrait", "landscape"]),
      inputs: Object.freeze(["touch", "pointer", "keyboard"]),
      languages: Object.freeze(languages),
      themes: Object.freeze(themes),
      states: Object.freeze(["primary-success-path"]),
    }),
    entries: Object.freeze(entries),
  });
}

function gitCommit(root) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function sortLocations(locations) {
  return [...locations].sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column);
}

export async function buildHigInteractionAudit({
  root = defaultRoot,
  sourceCommit = "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const absoluteRoot = resolve(root);
  const commit = sourceCommit || gitCommit(absoluteRoot);
  const htmlFile = join(absoluteRoot, "apps", "desktop", "index.html");
  const appDirectory = join(absoluteRoot, "apps", "desktop", "app");
  const registryFile = join(absoluteRoot, "tooling", "interface-guidelines-contract.mjs");
  const javascriptFiles = listFilesRecursively(appDirectory, (path) => path.endsWith(".js"));
  const sourceFiles = [htmlFile, ...javascriptFiles, registryFile];
  const rel = (path) => relative(absoluteRoot, path).split(sep).join("/");
  const html = readFileSync(htmlFile, "utf8");
  const allMarkup = markupRecords(html, rel(htmlFile));
  const scans = [];
  const parseFailures = [];
  let totalAstNodesVisited = 0;
  for (const path of javascriptFiles) {
    const file = rel(path);
    const source = readFileSync(path, "utf8");
    try {
      const scan = inspectJavaScriptSource(source, file);
      totalAstNodesVisited += scan.nodesVisited;
      scans.push({ file, source, scan });
      allMarkup.push(...scan.markup);
    } catch (error) {
      parseFailures.push({ file, message: String(error?.message || error), location: { file, line: Number(error?.loc?.line || 1), column: Number(error?.loc?.column || 0) } });
    }
  }
  if (!javascriptFiles.length || !scans.length || totalAstNodesVisited <= scans.length) {
    throw new Error("HIG interaction inventory visited zero meaningful application AST nodes.");
  }
  const totalEvidenceCount = allMarkup.length + scans.reduce((total, { scan }) => total
    + scan.applications.length
    + scan.actionHandlers.length
    + scan.shortcuts.length
    + scan.menuCommands.length
    + scan.windowCalls.length
    + scan.listeners.length, 0);
  if (totalEvidenceCount === 0) throw new Error("HIG interaction inventory found zero production interaction evidence.");

  const registrySource = readFileSync(registryFile, "utf8");
  const registryAst = inspectRegistrySource(registrySource, rel(registryFile));
  if (registryAst.nodesVisited <= 1 || registryAst.entries.length === 0) throw new Error("HIG registry AST traversal found zero registry entries.");
  const registryModuleUrl = `${pathToFileURL(registryFile).href}?hig-audit=${encodeURIComponent(commit)}`;
  const { windowInterfaceRegistry } = await import(registryModuleUrl);
  const contractKeys = new Set(registryAst.entries.map((entry) => entry.key));

  const windowDeclarations = new Map();
  for (const record of allMarkup.filter((record) => record.attribute === "data-window")) {
    if (!windowDeclarations.has(record.value)) windowDeclarations.set(record.value, []);
    windowDeclarations.get(record.value).push(record.location);
  }
  for (const { scan } of scans) for (const application of scan.applications) if (application.windowName) {
    if (!windowDeclarations.has(application.windowName)) windowDeclarations.set(application.windowName, []);
    windowDeclarations.get(application.windowName).push(application.location);
  }

  const handlerByAction = new Map();
  const addHandler = (action, handler, location) => {
    if (!action) return;
    if (!handlerByAction.has(action)) handlerByAction.set(action, []);
    handlerByAction.get(action).push({ handler, location });
  };
  for (const { file, scan } of scans) {
    scan.actionHandlers.forEach((record) => addHandler(record.action, record.handler, record.location));
    scan.applications.forEach((application) => application.commands.forEach((command) => addHandler(command.action, "application-runtime-command", command.node ? sourceLocation(file, command.node) : application.location)));
  }

  const shortcutsByAction = new Map();
  for (const { scan } of scans) for (const shortcut of scan.shortcuts) {
    if (!shortcut.action) continue;
    if (!shortcutsByAction.has(shortcut.action)) shortcutsByAction.set(shortcut.action, []);
    shortcutsByAction.get(shortcut.action).push(shortcut);
  }

  const interactions = [];
  const pushActionSurface = (record, kind) => {
    const handlers = handlerByAction.get(record.value) || [];
    const shortcutInputs = (shortcutsByAction.get(record.value) || []).map((shortcut) => `keyboard:${shortcut.key || shortcut.id}`);
    interactions.push(makeInteraction({
      kind,
      action: record.value,
      ownerWindow: record.ownerWindow || "",
      handler: handlers.map((item) => item.handler).filter(Boolean).join(" | "),
      source: record.location,
      alternativeInputs: shortcutInputs,
    }));
  };
  for (const record of allMarkup) {
    if (record.attribute === "data-action") {
      const role = record.ownerWindow && windowInterfaceRegistry[record.ownerWindow]?.role;
      pushActionSurface(record, role === "finder" ? "finder-action" : "window-control");
    }
    else if (record.attribute === "data-static-finder-action") pushActionSurface(record, "finder-action");
    else if (record.attribute === "data-open") interactions.push(makeInteraction({
      kind: "window-entry",
      action: `open:${record.value}`,
      ownerWindow: record.value,
      handler: `data-open=${record.value}`,
      source: record.location,
      alternativeInputs: [],
    }));
    else if (record.attribute === "dialog") interactions.push(makeInteraction({
      kind: "dialog",
      action: record.value,
      ownerWindow: record.ownerWindow || "",
      handler: "native-dialog",
      source: record.location,
      alternativeInputs: ["keyboard:tab", "keyboard:escape-when-supported"],
    }));
  }

  for (const { file, scan } of scans) {
    const fallbackOwner = ownerForFile(scan.markup, scan.applications);
    for (const application of scan.applications) for (const command of application.commands) {
      const handler = handlerByAction.get(command.action)?.map((item) => item.handler).filter(Boolean).join(" | ") || "application-runtime-command";
      interactions.push(makeInteraction({
        kind: "runtime-command",
        action: command.action,
        ownerWindow: application.windowName || fallbackOwner,
        handler,
        source: command.node ? sourceLocation(file, command.node) : application.location,
        alternativeInputs: (shortcutsByAction.get(command.action) || []).map((shortcut) => `keyboard:${shortcut.key || shortcut.id}`),
      }));
    }
    for (const command of scan.menuCommands) interactions.push(makeInteraction({
      kind: "menu-command",
      action: command.action,
      ownerWindow: "",
      handler: handlerByAction.get(command.action)?.map((item) => item.handler).filter(Boolean).join(" | ") || "",
      source: command.location,
      alternativeInputs: (shortcutsByAction.get(command.action) || []).map((shortcut) => `keyboard:${shortcut.key || shortcut.id}`),
    }));
    for (const shortcut of scan.shortcuts) interactions.push(makeInteraction({
      kind: "keyboard-shortcut",
      action: shortcut.action || shortcut.id,
      ownerWindow: shortcut.scopes.length === 1 ? shortcut.scopes[0] : "",
      handler: handlerByAction.get(shortcut.action)?.map((item) => item.handler).filter(Boolean).join(" | ") || "",
      event: `keydown:${shortcut.key}`,
      source: shortcut.location,
      alternativeInputs: ["menu-command"],
    }));
    for (const call of scan.windowCalls) interactions.push(makeInteraction({
      kind: call.operation === "openWindow" ? "window-entry" : "window-exit",
      action: `${call.operation === "openWindow" ? "open" : "close"}:${call.windowName}`,
      ownerWindow: call.windowName,
      handler: call.handler,
      source: call.location,
      alternativeInputs: [],
    }));
    const eventsByTarget = new Map();
    for (const listener of scan.listeners) {
      const key = `${file}:${listener.target}`;
      if (!eventsByTarget.has(key)) eventsByTarget.set(key, new Set());
      eventsByTarget.get(key).add(listener.event);
    }
    for (const listener of scan.listeners) {
      const siblingEvents = eventsByTarget.get(`${file}:${listener.target}`) || new Set();
      const alternatives = [];
      if (siblingEvents.has("click") && listener.event !== "click") alternatives.push("direct:click");
      if (siblingEvents.has("keydown") && listener.event !== "keydown") alternatives.push("direct:keyboard");
      interactions.push(makeInteraction({
        kind: listenerKind(listener.event),
        action: "",
        ownerWindow: fallbackOwner,
        handler: listener.handler,
        event: listener.event,
        source: listener.location,
        alternativeInputs: alternatives,
      }));
    }
  }

  const uniqueInteractions = [...new Map(interactions.map((record) => [record.id, record])).values()]
    .sort((left, right) => left.source.file.localeCompare(right.source.file) || left.source.line - right.source.line || left.source.column - right.source.column || left.id.localeCompare(right.id));

  const windows = [...windowDeclarations.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, declaredBy]) => {
    const entries = uniqueInteractions.filter((record) => record.ownerWindow === id && record.kind === "window-entry").map((record) => record.action);
    const exits = uniqueInteractions.filter((record) => record.ownerWindow === id && record.kind === "window-exit").map((record) => record.action);
    return Object.freeze({
      id,
      declaredBy: Object.freeze(sortLocations(declaredBy)),
      contract: Object.hasOwn(windowInterfaceRegistry, id) ? windowInterfaceRegistry[id] : null,
      entryActions: Object.freeze([...new Set(entries)].sort()),
      exitActions: Object.freeze([...new Set(exits)].sort()),
    });
  });

  const findings = [];
  for (const duplicate of registryAst.duplicates) findings.push(finding({
    id: `registry-duplicate-${duplicate.key}`,
    ruleId: "REGISTRY_DUPLICATE_KEY",
    title: `Interface registry silently overwrites ${duplicate.key}`,
    severity: "P1",
    confidence: "High",
    expected: "Every interface registry object key is declared exactly once so its role and responsive contract cannot be overwritten.",
    actual: `${duplicate.key} is declared ${duplicate.locations.length} times in the same ObjectExpression. JavaScript keeps only the final property at runtime.`,
    affected: [duplicate.key],
    reproduction: ["Parse windowInterfaceRegistry with Acorn.", `Count ObjectExpression properties named ${duplicate.key}.`],
    evidence: duplicate.locations,
    recommendation: "Keep one authoritative declaration and preserve the intended role, shell, route, status, and responsive model in that declaration.",
    verification: "The AST inventory reports no duplicate registry property and the interface-guidelines contract still passes.",
  }));

  for (const windowRecord of windows.filter((record) => !contractKeys.has(record.id))) findings.push(finding({
    id: `window-missing-contract-${windowRecord.id}`,
    ruleId: "WINDOW_MISSING_INTERFACE_CONTRACT",
    title: `${windowRecord.id} has no interface registry contract`,
    severity: "P1",
    confidence: "High",
    expected: "Every production data-window surface declares an object role, route, shell, document/status model, and responsive model.",
    actual: `${windowRecord.id} is created by production markup or JavaScript but is absent from windowInterfaceRegistry.`,
    affected: [windowRecord.id],
    reproduction: ["Scan index.html and parsed JavaScript string/assignment nodes for data-window declarations.", "Compare discovered ids with the registry ObjectExpression property list."],
    evidence: windowRecord.declaredBy,
    recommendation: "Add one interface registry declaration using the existing object-role helpers; do not alter the production window while recording the audit contract.",
    verification: "The AST inventory includes the window and reports no missing interface contract.",
  }));

  const declaredWindowIds = new Set(windows.map((record) => record.id));
  for (const key of [...contractKeys].filter((item) => !declaredWindowIds.has(item)).sort()) {
    const evidence = registryAst.entries.filter((entry) => entry.key === key).map((entry) => entry.location);
    findings.push(finding({
      id: `registry-orphan-${key}`,
      ruleId: "REGISTRY_ORPHAN_CONTRACT",
      title: `${key} registry contract has no discovered production window`,
      severity: "P3",
      confidence: "Medium",
      expected: "Every registry entry corresponds to a window discoverable from static markup, dynamic template/assignment code, or a runtime application descriptor.",
      actual: `${key} is registered but no production declaration was discovered.`,
      affected: [key],
      reproduction: ["Parse the registry ObjectExpression.", "Scan production HTML and JavaScript window declarations."],
      evidence,
      recommendation: "Confirm whether the surface is created through an unsupported dynamic pattern, then extend the scanner or remove a genuinely stale contract.",
      verification: "The contract resolves to at least one production declaration or is intentionally removed.",
    }));
  }

  for (const { action, locations } of findUnhandledSurfacedActions({ markup: allMarkup, scans })) {
    findings.push(finding({
      id: `unhandled-action-${action.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      ruleId: "UNHANDLED_SURFACED_ACTION",
      title: `${action} is exposed without a statically discoverable handler`,
      severity: "P1",
      confidence: "Medium",
      expected: "Every rendered action, Finder action, menu command, and shortcut resolves to a global or application runtime command.",
      actual: `${action} is exposed to users but no handler was discovered in the action registry, registerCommand, or registerApplication command sources.`,
      affected: [action],
      reproduction: ["Collect user-facing action ids from parsed markup, menuItem calls, Finder attributes, and keyboardShortcutRegistry.", "Compare them with parsed command registries."],
      evidence: sortLocations(locations),
      recommendation: "Route the action through the existing command registry, or teach the AST resolver the verified dynamic command source if this is a scanner limitation.",
      verification: "The action resolves to a parsed command handler and an executable feature test presses its public entry path.",
    }));
  }

  for (const gap of findDragAlternativeGaps({ scans })) {
    const { key, events, locations } = gap;
    findings.push(finding({
      id: `drag-alternative-unverified-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(-96)}`,
      ruleId: "DRAG_ALTERNATIVE_UNVERIFIED",
      title: "Drag interaction has no same-target single-point or keyboard listener",
      severity: "P2",
      confidence: "Low",
      expected: "Dragging has a discoverable non-dragging single-point alternative for touch users, with keyboard access also verified where applicable.",
      actual: `The target ${gap.target || "(dynamic target)"} has ${events.join(", ")} listeners but no same-target click or keydown listener. Delegated alternatives require runtime verification.`,
      affected: [key],
      reproduction: ["Parse direct event listener registrations for this target.", "Compare drag events with same-target click and keydown registrations."],
      evidence: locations,
      recommendation: "Verify the real delegated single-point path in browser evidence; if absent, expose the operation through an owned button or menu command.",
      verification: "A touch/browser test completes the same operation without dragging and records its entry action.",
    }));
  }

  for (const failure of parseFailures) findings.push(finding({
    id: `parse-failure-${failure.file.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    ruleId: "SOURCE_PARSE_FAILURE",
    title: `Inventory could not parse ${failure.file}`,
    severity: "P1",
    confidence: "High",
    expected: "Every production desktop JavaScript file is parsed and traversed before inventory completeness is claimed.",
    actual: failure.message,
    affected: [failure.file],
    reproduction: ["Run the HIG interaction inventory against the fixed source commit."],
    evidence: [failure.location],
    recommendation: "Fix the syntax error or extend the parser configuration without falling back to regex-only discovery.",
    verification: "The file is included in filesScanned and no SOURCE_PARSE_FAILURE remains.",
  }));

  const interactionLedger = Object.freeze({
    schemaVersion: higAuditSchemaVersion,
    kind: "interaction-ledger",
    source: Object.freeze({
      commit,
      filesScanned: Object.freeze(sourceFiles.map(rel)),
      generatedAt,
    }),
    summary: Object.freeze({
      windowCount: windows.length,
      interactionCount: uniqueInteractions.length,
      sourceFileCount: sourceFiles.length,
    }),
    windows: Object.freeze(windows),
    interactions: Object.freeze(uniqueInteractions),
  });
  const findingsArtifact = Object.freeze({
    schemaVersion: higAuditSchemaVersion,
    kind: "findings",
    sourceCommit: commit,
    findings: Object.freeze(findings.sort((left, right) => left.severity.localeCompare(right.severity) || left.id.localeCompare(right.id))),
  });
  const coverageMatrix = buildCoverageMatrix(commit, uniqueInteractions);
  assertValidAuditArtifacts({ interactionLedger, findings: findingsArtifact, coverageMatrix });
  return Object.freeze({ interactionLedger, findings: findingsArtifact, coverageMatrix, registryAst, parseFailures: Object.freeze(parseFailures) });
}

function parseCliArguments(argv) {
  const options = { out: "", sourceCommit: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out") {
      options.out = argv[index + 1] || "";
      index += 1;
    } else if (argument === "--source-commit") {
      const candidate = argv[index + 1];
      if (candidate && !candidate.startsWith("--")) {
        options.sourceCommit = candidate;
        index += 1;
      }
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (argv.includes("--out") && !options.out) throw new Error("--out requires a directory.");
  return options;
}

function approvedOutputDirectory(root, output) {
  const evidenceRoot = resolve(root, auditEvidenceRelativeRoot);
  const target = isAbsolute(output) ? resolve(output) : resolve(root, output);
  if (target !== evidenceRoot && !target.startsWith(`${evidenceRoot}${sep}`)) {
    throw new Error(`--out must be inside ${auditEvidenceRelativeRoot}.`);
  }
  return target;
}

function writeArtifact(directory, file, value) {
  writeFileSync(join(directory, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(argv) {
  const options = parseCliArguments(argv);
  if (options.help) {
    console.log("Usage: node tooling/hig-interaction-inventory.mjs [--source-commit [COMMIT]] [--out internal/evidence/drafts/hig-ui-ux-audit/<commit>]");
    return;
  }
  const artifacts = await buildHigInteractionAudit({ root: defaultRoot, sourceCommit: options.sourceCommit });
  const summary = {
    sourceCommit: artifacts.interactionLedger.source.commit,
    windows: artifacts.interactionLedger.summary.windowCount,
    interactions: artifacts.interactionLedger.summary.interactionCount,
    findings: artifacts.findings.findings.length,
    duplicateRegistryKeys: artifacts.registryAst.duplicates.map((item) => item.key),
    missingWindowContracts: artifacts.findings.findings.filter((item) => item.ruleId === "WINDOW_MISSING_INTERFACE_CONTRACT").map((item) => item.affected[0]),
  };
  if (!options.out) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const output = approvedOutputDirectory(defaultRoot, options.out);
  mkdirSync(output, { recursive: true });
  writeArtifact(output, "interaction-ledger.json", artifacts.interactionLedger);
  writeArtifact(output, "findings.json", artifacts.findings);
  writeArtifact(output, "coverage-matrix.json", artifacts.coverageMatrix);
  console.log(JSON.stringify({ ...summary, output: relative(defaultRoot, output).split(sep).join("/") }, null, 2));
}

if (resolve(process.argv[1] || "") === resolve(thisFile)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
