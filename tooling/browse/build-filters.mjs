// Compile uBOL (GPL-3.0) declarativeNetRequest rulesets into the compact,
// pre-indexed JSON consumed by apps/browse/filter-match.js.
//
// WHY a custom compiler instead of shipping the DNR JSON: Chrome compiles
// urlFilter syntax and indexes rules in native code that a service worker
// does not have. Here a urlFilter becomes a RegExp and each rule is filed
// under either the request host or a whole URL token from its pattern,
// so a match touches a handful of candidates instead of every rule.
//
// Usage: node build-filters.mjs --source <chromium dir> --out <dir>

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const RULESET_IDS = [
  "ublock-filters", "easylist", "easyprivacy", "pgl",
  "ublock-badware", "urlhaus-full", "chn-0"
];

// Least valuable first. Chinese is this product main audience, so chn-0
// survives easyprivacy when a size budget forces a drop.
const DROP_ORDER = [
  "urlhaus-full", "ublock-badware", "pgl", "easyprivacy",
  "chn-0", "easylist", "ublock-filters"
];

const NETWORK_TARGET = 2.5 * 1024 * 1024;
const COSMETIC_TARGET = 3 * 1024 * 1024;
const REGEX_CAP = 2000;

const ALLOWED_CONDITION_KEYS = new Set([
  "urlFilter", "regexFilter", "isUrlFilterCaseSensitive",
  "requestDomains", "excludedRequestDomains",
  "initiatorDomains", "excludedInitiatorDomains",
  "domainType", "resourceTypes", "excludedResourceTypes"
]);

function fail(message) {
  console.error("build-filters: " + message);
  process.exit(1);
}

function readJson(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    fail("cannot read " + path + ": " + error.message);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail("malformed JSON in " + path + ": " + error.message);
  }
}

function gzipSize(text) {
  return gzipSync(Buffer.from(text, "utf8")).length;
}

function pushIndex(map, key, index) {
  let list = map.get(key);
  if (list === undefined) { list = []; map.set(key, list); }
  list.push(index);
}

function toRecord(map) {
  const out = {};
  for (const [key, list] of map) {
    const unique = [...new Set(list)];
    out[key] = unique;
  }
  return out;
}

// Direct translation of the DNR urlFilter alphabet to a JS RegExp source.
// The separator class matches anything that is not a letter, digit, _, -, . or %,
// and also end of URL, which is exactly the DNR ^ separator.
function compileUrlFilter(filter) {
  let source = filter;
  let prefix = "";
  let suffix = "";
  if (source.startsWith("||")) {
    prefix = "^(?:[a-z][a-z0-9+.-]*:)?//(?:[^/?#]*\\.)?";
    source = source.slice(2);
  } else if (source.startsWith("|")) {
    prefix = "^";
    source = source.slice(1);
  }
  if (source.endsWith("|")) {
    suffix = "$";
    source = source.slice(0, -1);
  }
  let out = "";
  for (const ch of source) {
    if (ch === "*") { out += ".*"; }
    else if (ch === "^") { out += "(?:[^A-Za-z0-9_.%-]|$)"; }
    else { out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  }
  return prefix + out + suffix;
}

function literalRuns(filter) {
  let source = filter;
  if (source.startsWith("||")) { source = source.slice(2); }
  else if (source.startsWith("|")) { source = source.slice(1); }
  if (source.endsWith("|")) { source = source.slice(0, -1); }
  return source.split(/[*^|]/);
}

// Index keys are whole URL tokens: runs of [a-z0-9%], the same split the
// matcher makes of a request's address. A run in the pattern is usable only
// when both its ends are token boundaries in any URL the pattern matches:
// a separator character, ^, an anchor, or the pattern's own anchored ends.
// A run touching * (or an unanchored end) may be part of a longer token in
// the URL, so it cannot be looked up whole. Tokens every URL has are skipped,
// because a bucket keyed on "https" or "com" would be checked for every
// request. The longest usable token is the most distinctive.
const COMMON_TOKENS = new Set(["http", "https", "www", "com", "net", "org", "cn", "html", "htm", "php", "js", "css", "png", "jpg", "gif", "cdn", "static", "assets", "api", "v1", "v2", "index", "min"]);
const TOKEN_CHAR = /[a-z0-9%]/i;

function chooseToken(filter) {
  let source = String(filter);
  let startAnchored = false;
  let endAnchored = false;
  if (source.startsWith("||")) { source = source.slice(2); startAnchored = true; }
  else if (source.startsWith("|")) { source = source.slice(1); startAnchored = true; }
  if (source.endsWith("|")) { source = source.slice(0, -1); endAnchored = true; }
  let best = "";
  let common = "";
  let index = 0;
  while (index < source.length) {
    if (!TOKEN_CHAR.test(source[index])) { index += 1; continue; }
    const start = index;
    while (index < source.length && TOKEN_CHAR.test(source[index])) index += 1;
    const before = start === 0 ? (startAnchored ? "|" : "") : source[start - 1];
    const after = index === source.length ? (endAnchored ? "|" : "") : source[index];
    const safe = (edge) => edge !== "" && edge !== "*";
    const token = source.slice(start, index).toLowerCase();
    if (safe(before) && safe(after) && token.length >= 2) {
      if (!COMMON_TOKENS.has(token)) {
        if (token.length > best.length) best = token;
      } else if (token.length > common.length) {
        common = token;
      }
    }
  }
  // A rule with only common tokens ("\.php", "/ads.gif") still files under
  // one: checking it for addresses that contain "php" is far cheaper than
  // checking it for every address.
  return best || common;
}

// A plain substring every address a regular expression matches must
// contain: the longest run of word characters outside character classes,
// groups and alternations, not ended by an optional quantifier. Empty when
// the expression gives no such guarantee.
function regexLiteral(source) {
  let text = String(source);
  if (text.includes("|") && !/\\\|/.test(text)) {
    // Alternation outside groups makes every run optional; inside groups is
    // handled by dropping the groups below.
    let depth = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "\\") { i += 1; continue; }
      if (ch === "(" ) depth += 1;
      else if (ch === ")") depth -= 1;
      else if (ch === "|" && depth === 0) return "";
    }
  }
  text = text.replace(/\\[\[\]()]/g, "#");
  text = text.replace(/\[[^\]]*\]/g, "#");
  for (let guard = 0; guard < 20 && /\([^()]*\)/.test(text); guard += 1) text = text.replace(/\([^()]*\)[*?+]?\??/g, "#");
  text = text.replace(/\\[./\-_=&?]/g, (m) => m[1]).replace(/\\[a-zA-Z]/g, "#");
  let best = "";
  const runs = text.match(/[A-Za-z0-9.\/_=&-]+([*?{+])?/g) || [];
  for (let run of runs) {
    const quantifier = /[*?{+]$/.test(run) ? run.slice(-1) : "";
    if (quantifier) run = run.slice(0, -1);
    if (quantifier === "*" || quantifier === "?" || quantifier === "{") run = run.slice(0, -1);
    if (run.length > best.length) best = run;
  }
  return best.length >= 4 ? best.toLowerCase() : "";
}

// The longest plain substring a rule's address must contain, lowercased.
// Rules with no whole token are matched with a cheap indexOf on this before
// their regular expression runs.
function longestLiteral(filter) {
  let best = "";
  for (const run of literalRuns(filter)) {
    if (run.length > best.length) best = run;
  }
  return best.toLowerCase();
}

function anchoredHost(filter) {
  const source = filter.slice(2);
  let end = source.length;
  for (const ch of ["/", "^", "*", "|", "?"]) {
    const at = source.indexOf(ch);
    if (at >= 0 && at < end) { end = at; }
  }
  return source.slice(0, end).replace(/\.+$/, "");
}

function optionalStringArray(value, path, key) {
  if (value === undefined) { return undefined; }
  if (Array.isArray(value) === false) {
    fail("condition." + key + " must be an array in " + path);
  }
  for (const item of value) {
    if (typeof item !== "string") {
      fail("condition." + key + " must hold strings in " + path);
    }
  }
  return value;
}

function buildNetwork(sourceDir, ids, version) {
  const rules = [];
  const hosts = new Map();
  const tokens = new Map();
  const generic = [];
  const aar = new Map();
  const skipped = new Map();
  const perRuleset = new Map();
  let regexCount = 0;

  const skip = (reason, counts) => {
    skipped.set(reason, (skipped.get(reason) || 0) + 1);
    counts.skipped += 1;
  };

  for (const id of ids) {
    const counts = { kept: 0, skipped: 0 };
    perRuleset.set(id, counts);
    for (const kind of ["main", "regex"]) {
      const path = join(sourceDir, "rulesets", kind, id + ".json");
      if (existsSync(path) === false) { continue; }
      const parsed = readJson(path);
      if (Array.isArray(parsed) === false) { fail("expected an array in " + path); }
      for (const raw of parsed) {
        if (raw === null || typeof raw !== "object" || raw.action === null || typeof raw.action !== "object") {
          fail("rule without an action in " + path);
        }
        const cond = raw.condition;
        if (cond === null || typeof cond !== "object" || Array.isArray(cond)) {
          fail("rule without a condition in " + path);
        }
        const actionType = raw.action.type;
        if (actionType !== "block" && actionType !== "allow" && actionType !== "allowAllRequests") {
          skip("action:" + String(actionType), counts);
          continue;
        }
        const unknown = Object.keys(cond).find((key) => ALLOWED_CONDITION_KEYS.has(key) === false);
        if (unknown !== undefined) { skip("condition:" + unknown, counts); continue; }
        if (cond.urlFilter !== undefined && typeof cond.urlFilter !== "string") {
          fail("condition.urlFilter must be a string in " + path);
        }
        if (cond.regexFilter !== undefined && typeof cond.regexFilter !== "string") {
          fail("condition.regexFilter must be a string in " + path);
        }
        const requestDomains = optionalStringArray(cond.requestDomains, path, "requestDomains");
        const excludedRequestDomains = optionalStringArray(cond.excludedRequestDomains, path, "excludedRequestDomains");
        const initiatorDomains = optionalStringArray(cond.initiatorDomains, path, "initiatorDomains");
        const excludedInitiatorDomains = optionalStringArray(cond.excludedInitiatorDomains, path, "excludedInitiatorDomains");
        const resourceTypes = optionalStringArray(cond.resourceTypes, path, "resourceTypes");
        const excludedResourceTypes = optionalStringArray(cond.excludedResourceTypes, path, "excludedResourceTypes");
        const hasRequestDomains = requestDomains !== undefined && requestDomains.length > 0;
        if (cond.urlFilter === undefined && cond.regexFilter === undefined && hasRequestDomains === false) {
          skip("no-pattern", counts);
          continue;
        }
        const caseSensitive = cond.isUrlFilterCaseSensitive === true;
        const flags = caseSensitive ? "" : "i";
        let source = null;
        let isRegexFilter = false;
        if (cond.urlFilter !== undefined) {
          source = compileUrlFilter(cond.urlFilter);
          try { new RegExp(source, flags); } catch { skip("urlfilter-invalid", counts); continue; }
        } else if (cond.regexFilter !== undefined) {
          try { new RegExp(cond.regexFilter, flags); } catch { skip("regex-invalid", counts); continue; }
          if (regexCount >= REGEX_CAP) { skip("regex-cap", counts); continue; }
          regexCount += 1;
          source = cond.regexFilter;
          isRegexFilter = true;
        }
        let domainType;
        if (cond.domainType !== undefined) {
          if (cond.domainType !== "firstParty" && cond.domainType !== "thirdParty") {
            skip("domaintype-invalid", counts);
            continue;
          }
          domainType = cond.domainType;
        }
        const rule = { a: actionType === "block" ? 0 : actionType === "allow" ? 1 : 2 };
        if (typeof raw.priority === "number" && raw.priority !== 1) { rule.p = raw.priority; }
        if (source !== null) {
          if (isRegexFilter) { rule.re = source; } else { rule.u = source; }
          if (caseSensitive) { rule.cs = 1; }
        }
        if (requestDomains !== undefined) { rule.rd = requestDomains; }
        if (excludedRequestDomains !== undefined) { rule.xrd = excludedRequestDomains; }
        if (initiatorDomains !== undefined) { rule.id = initiatorDomains; }
        if (excludedInitiatorDomains !== undefined) { rule.xid = excludedInitiatorDomains; }
        if (domainType !== undefined) { rule.dt = domainType; }
        if (resourceTypes !== undefined) { rule.rt = resourceTypes; }
        if (excludedResourceTypes !== undefined) { rule.xrt = excludedResourceTypes; }
        const index = rules.length;
        rules.push(rule);
        counts.kept += 1;
        if (hasRequestDomains) {
          for (const domain of requestDomains) { pushIndex(hosts, domain, index); }
          if (rule.a === 2) {
            for (const domain of requestDomains) { pushIndex(aar, domain, index); }
          }
        } else if (cond.urlFilter !== undefined && cond.urlFilter.startsWith("||")) {
          const host = anchoredHost(cond.urlFilter);
          if (host.indexOf(".") >= 0) { pushIndex(hosts, host, index); }
          else {
            // "||adserver^": a host label, so a whole token of the address.
            const token = chooseToken(cond.urlFilter);
            if (token) { pushIndex(tokens, token, index); } else { generic.push(index); }
          }
        } else {
          const token = cond.urlFilter === undefined ? "" : chooseToken(cond.urlFilter);
          if (token) { pushIndex(tokens, token, index); }
          else {
            // Lowercased on both sides, the check is still a necessary
            // condition for a case-sensitive rule, so it applies to those too.
            if (cond.urlFilter !== undefined) {
              const literal = longestLiteral(cond.urlFilter);
              if (literal.length >= 2) rule.l = literal;
            } else if (cond.regexFilter !== undefined) {
              const literal = regexLiteral(cond.regexFilter);
              if (literal) rule.l = literal;
            }
            generic.push(index);
          }
        }
      }
    }
  }

  return {
    network: {
      v: version,
      r: rules,
      h: toRecord(hosts),
      t: toRecord(tokens),
      g: generic,
      aar: toRecord(aar)
    },
    skipped,
    perRuleset,
    regexCount,
    genericCount: generic.length
  };
}

function addCosmetic(hosts, key, kind, selector) {
  let entry = hosts.get(key);
  if (entry === undefined) {
    entry = { s: [], x: [], seenS: new Set(), seenX: new Set() };
    hosts.set(key, entry);
  }
  const seen = kind === "s" ? entry.seenS : entry.seenX;
  if (seen.has(selector)) { return; }
  seen.add(selector);
  entry[kind].push(selector);
}

// Cosmetic data stores, per hostname key, a list of indexes into a shared
// selector pool. A positive index adds a selector, a negative one is an
// exception (#@#) and is kept separate so it can subtract across the host,
// its parents and its entity forms at match time. Procedural entries are
// JSON blobs that start with a brace and need the procedural filterer, so
// they are counted and dropped. Regex cosmetic entries are rare and would
// need a per-page regex test; they are counted and dropped too.
function buildCosmetic(sourceDir, ids, version) {
  const hosts = new Map();
  const perRuleset = new Map();
  let procedural = 0;
  let regexEntries = 0;
  for (const id of ids) {
    const path = join(sourceDir, "rulesets", "scripting", "specific", id + ".json");
    if (existsSync(path) === false) { perRuleset.set(id, { selectors: 0, hostnames: 0 }); continue; }
    const data = readJson(path);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      fail("expected an object in " + path);
    }
    const selectors = data.selectors;
    const selectorLists = data.selectorLists;
    const selectorListRefs = data.selectorListRefs;
    const hostnames = data.hostnames;
    if (Array.isArray(selectors) === false || Array.isArray(selectorLists) === false || Array.isArray(selectorListRefs) === false || Array.isArray(hostnames) === false) {
      fail("malformed cosmetic data in " + path);
    }
    let added = 0;
    for (let i = 0; i < hostnames.length; i += 1) {
      const key = hostnames[i];
      if (typeof key !== "string") { fail("non-string hostname in " + path); }
      const ref = selectorListRefs[i];
      if (typeof ref !== "number" || selectorLists[ref] === undefined) {
        fail("selectorListRef out of range in " + path);
      }
      const raw = selectorLists[ref];
      const tokens = raw === "" ? [] : String(raw).split(",");
      for (const token of tokens) {
        const value = Number(token);
        if (Number.isInteger(value) === false) { fail("non-integer selector index in " + path); }
        const selector = selectors[value >= 0 ? value : -value - 1];
        if (typeof selector !== "string") { fail("selector index out of range in " + path); }
        if (selector.startsWith("{")) { procedural += 1; continue; }
        addCosmetic(hosts, key, value >= 0 ? "s" : "x", selector);
        added += 1;
      }
    }
    regexEntries += Array.isArray(data.regexes) ? Math.floor(data.regexes.length / 3) : 0;
    perRuleset.set(id, { selectors: added, hostnames: hostnames.length });
  }
  const h = {};
  for (const [key, entry] of hosts) {
    if (entry.s.length === 0 && entry.x.length === 0) { continue; }
    const out = {};
    if (entry.s.length > 0) { out.s = entry.s; }
    if (entry.x.length > 0) { out.x = entry.x; }
    h[key] = out;
  }
  return { cosmetic: { v: version, h }, procedural, regexEntries, perRuleset };
}

function build(sourceDir, ids, version) {
  const net = buildNetwork(sourceDir, ids, version);
  const cos = buildCosmetic(sourceDir, ids, version);
  const networkText = JSON.stringify(net.network);
  const cosmeticText = JSON.stringify(cos.cosmetic);
  return {
    net,
    cos,
    networkText,
    cosmeticText,
    networkGzip: gzipSize(networkText),
    cosmeticGzip: gzipSize(cosmeticText)
  };
}

function parseArgs(argv) {
  let source = "";
  let out = "";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--source") { source = argv[i + 1] || ""; i += 1; }
    else if (argv[i] === "--out") { out = argv[i + 1] || ""; i += 1; }
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("usage: node build-filters.mjs --source <chromium dir> --out <dir>");
      process.exit(0);
    } else {
      fail("unknown argument " + argv[i]);
    }
  }
  if (source === "" || out === "") {
    fail("usage: node build-filters.mjs --source <chromium dir> --out <dir>");
  }
  return { source, out };
}

function versionFromSource(source) {
  const segments = source.split(/[\\/]+/);
  for (const segment of segments) {
    if (/^\d{4}\.\d+\.\d+$/.test(segment)) { return segment; }
  }
  return "unknown";
}

function mib(bytes) { return (bytes / (1024 * 1024)).toFixed(2); }

function report(built, ids, dropped) {
  console.log("");
  for (const id of ids) {
    const net = built.net.perRuleset.get(id) || { kept: 0, skipped: 0 };
    const cos = built.cos.perRuleset.get(id) || { selectors: 0, hostnames: 0 };
    console.log("  " + id + ": network " + net.kept + " kept / " + net.skipped + " skipped, cosmetic " + cos.selectors + " slots over " + cos.hostnames + " hostnames");
  }
  console.log("");
  const reasons = [...built.net.skipped].sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of reasons) {
    console.log("  skipped " + count + " rules: " + reason);
  }
  console.log("");
  console.log("  network rules: " + built.net.network.r.length + " (generic bucket " + built.net.genericCount + ", regex kept " + built.net.regexCount + ")");
  console.log("  cosmetic hostname keys: " + Object.keys(built.cos.cosmetic.h).length + " (procedural skipped " + built.cos.procedural + ", regex cosmetic skipped " + built.cos.regexEntries + ")");
  if (dropped.length > 0) { console.log("  dropped rulesets: " + dropped.join(", ")); }
  console.log("");
  console.log("  network.json  " + mib(built.networkGzip) + " MiB gzip (target 2.50) " + (built.networkGzip <= NETWORK_TARGET ? "OK" : "OVER"));
  console.log("  cosmetic.json " + mib(built.cosmeticGzip) + " MiB gzip (target 3.00) " + (built.cosmeticGzip <= COSMETIC_TARGET ? "OK" : "OVER"));
}

function main() {
  const { source, out } = parseArgs(process.argv.slice(2));
  if (existsSync(join(source, "rulesets")) === false) {
    fail("source has no rulesets directory: " + source);
  }
  const detailsPath = join(source, "rulesets", "ruleset-details.json");
  if (existsSync(detailsPath) === false) { fail("missing " + detailsPath); }
  const details = readJson(detailsPath);
  if (Array.isArray(details) === false) { fail("ruleset-details.json must be an array"); }
  const version = versionFromSource(source);
  let ids = [...RULESET_IDS];
  const dropped = [];
  let built;
  for (;;) {
    built = build(source, ids, version);
    const over = built.networkGzip > NETWORK_TARGET || built.cosmeticGzip > COSMETIC_TARGET;
    if (over === false) { break; }
    const next = DROP_ORDER.find((id) => ids.indexOf(id) >= 0);
    if (next === undefined || ids.length <= 1) { break; }
    ids = ids.filter((id) => id !== next);
    dropped.push(next);
    console.log("over budget: dropping ruleset " + next + " and rebuilding");
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "network.json"), built.networkText);
  writeFileSync(join(out, "cosmetic.json"), built.cosmeticText);
  report(built, ids, dropped);
}

main();
