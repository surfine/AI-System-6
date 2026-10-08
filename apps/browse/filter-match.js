/* AI System 6 browse filter matching.
 *
 * WHY a classic script and not an ES module: the browse-origin service
 * worker loads this file with importScripts, which cannot load ES modules,
 * while the test harness loads the exact same file in Node through
 * vm.runInContext. Both need one global, so the contract is self.AIS6Filters.
 *
 * tooling/browse/build-filters.mjs emits the compact wire format consumed
 * here from the uBOL (GPL-3.0) declarativeNetRequest rulesets. The shape of
 * that format is documented at the compiler.
 */
(function () {
  "use strict";

  // fetch destination -> DNR resource type. The service worker passes the
  // fetch destination value; a destination we do not know becomes DNR
  // "other" so a rule that names other still gets its chance.
  var DESTINATION_TYPES = {
    "document": "main_frame",
    "iframe": "sub_frame",
    "frame": "sub_frame",
    "script": "script",
    "worker": "script",
    "sharedworker": "script",
    "serviceworker": "script",
    "style": "stylesheet",
    "image": "image",
    "font": "font",
    "audio": "media",
    "video": "media",
    "track": "media",
    "object": "object",
    "embed": "object",
    "websocket": "websocket",
    "": "xmlhttprequest",
    "empty": "xmlhttprequest"
  };

  // DNR resource types accepted as already canonical, so a caller may pass
  // either a fetch destination or a resource type.
  var RESOURCE_TYPES = {};
  ["main_frame", "sub_frame", "stylesheet", "script", "image", "font",
    "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket",
    "webtransport", "webbundle", "other"].forEach(function (name) {
    RESOURCE_TYPES[name] = true;
  });

  function resolveType(type) {
    var t = String(type === undefined || type === null ? "" : type).toLowerCase();
    if (RESOURCE_TYPES[t] === true) { return t; }
    var mapped = DESTINATION_TYPES[t];
    return mapped === undefined ? "other" : mapped;
  }

  // True when host is domain itself or a dot-delimited subdomain of it.
  // A bare endsWith is not enough: "notads.example.com" must not match
  // "ads.example.com".
  function hostEndsWith(host, domain) {
    if (host.length === domain.length) { return host === domain; }
    if (host.length < domain.length) { return false; }
    if (host.slice(host.length - domain.length) !== domain) { return false; }
    return host.charCodeAt(host.length - domain.length - 1) === 46;
  }

  function matchAnyDomain(host, domains) {
    for (var i = 0; i < domains.length; i += 1) {
      if (hostEndsWith(host, domains[i])) { return true; }
    }
    return false;
  }

  function lower(value) {
    return String(value === undefined || value === null ? "" : value).toLowerCase();
  }

  // Hostname plus every parent label: lookup keys into the host map.
  function hostKeys(host) {
    var keys = [host];
    var pos = 0;
    for (;;) {
      pos = host.indexOf(".", pos);
      if (pos < 0) { break; }
      pos += 1;
      if (pos < host.length) { keys.push(host.slice(pos)); }
    }
    return keys;
  }

  // uBOL entity contexts: strip the last label of each hostname and append
  // ".*", so example.com contributes example.* and sub.example.com adds
  // sub.example.* and sub.*.
  function entityKeys(keys) {
    var out = [];
    for (var i = 0; i < keys.length; i += 1) {
      var host = keys[i];
      for (;;) {
        var dot = host.lastIndexOf(".");
        if (dot < 0) { break; }
        host = host.slice(0, dot);
        out.push(host + ".*");
      }
    }
    return out;
  }

  function cosmeticKeys(hostname) {
    var host = lower(hostname).replace(/\.$/, "");
    var keys = host === "" ? [] : hostKeys(host);
    var all = keys.concat(["*"]).concat(entityKeys(keys));
    var seen = {};
    var out = [];
    for (var i = 0; i < all.length; i += 1) {
      if (seen[all[i]] === true) { continue; }
      seen[all[i]] = true;
      out.push(all[i]);
    }
    return out;
  }

  function toIndexMap(record) {
    var map = new Map();
    if (record) {
      var keys = Object.keys(record);
      for (var i = 0; i < keys.length; i += 1) { map.set(keys[i], record[keys[i]]); }
    }
    return map;
  }

  // compileNetwork turns the JSON wire format into runtime structures: every
  // pattern source becomes a RegExp once, so a match never recompiles.
  function compileNetwork(json) {
    var raw = json && Array.isArray(json.r) ? json.r : [];
    var rules = new Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) {
      var r = raw[i];
      var source = r.re !== undefined ? r.re : r.u;
      rules[i] = {
        action: r.a,
        priority: typeof r.p === "number" ? r.p : 1,
        resourceTypes: r.rt,
        excludedResourceTypes: r.xrt,
        requestDomains: r.rd,
        excludedRequestDomains: r.xrd,
        initiatorDomains: r.id,
        excludedInitiatorDomains: r.xid,
        domainType: r.dt,
        re: source === undefined ? null : new RegExp(source, r.cs === 1 ? "" : "i"),
        literal: typeof r.l === "string" ? r.l : ""
      };
    }
    return {
      rules: rules,
      hosts: toIndexMap(json && json.h),
      tokens: toIndexMap(json && json.t),
      generic: (json && json.g) ? json.g : [],
      aar: toIndexMap(json && json.aar)
    };
  }

  // ruleMatches applies every supported DNR condition to one request. The
  // bucket a rule sits in already proved its hostname or token, so the
  // regex and the excluded/initiator conditions are what remain.
  function ruleMatches(rule, ctx) {
    var rt = rule.resourceTypes;
    if (rt && rt.length && rt.indexOf(ctx.type) < 0) { return false; }
    var xrt = rule.excludedResourceTypes;
    if (xrt && xrt.length && xrt.indexOf(ctx.type) >= 0) { return false; }
    var dt = rule.domainType;
    if (dt !== undefined) {
      var thirdWanted = dt === "thirdParty";
      if (thirdWanted ? ctx.thirdParty !== true : ctx.thirdParty === true) { return false; }
    }
    var rd = rule.requestDomains;
    if (rd && rd.length && matchAnyDomain(ctx.host, rd) === false) { return false; }
    var xrd = rule.excludedRequestDomains;
    if (xrd && xrd.length && matchAnyDomain(ctx.host, xrd)) { return false; }
    var id = rule.initiatorDomains;
    if (id && id.length) {
      if (ctx.initiatorHost === "" || matchAnyDomain(ctx.initiatorHost, id) === false) { return false; }
    }
    var xid = rule.excludedInitiatorDomains;
    if (xid && xid.length && ctx.initiatorHost !== "" && matchAnyDomain(ctx.initiatorHost, xid)) { return false; }
    if (rule.re !== null && rule.re.test(ctx.url) === false) { return false; }
    return true;
  }

  // An allowAllRequests rule was registered against the document that
  // carried it, so for later subresources it is the initiator host that must
  // match, and the urlFilter (which described the document) is not retested.
  function aarMatches(rule, ctx) {
    if (ctx.initiatorHost === "") { return false; }
    var rd = rule.requestDomains;
    if (rd && rd.length && matchAnyDomain(ctx.initiatorHost, rd) === false) { return false; }
    var xrd = rule.excludedRequestDomains;
    if (xrd && xrd.length && matchAnyDomain(ctx.initiatorHost, xrd)) { return false; }
    return true;
  }

  // matchNetwork returns true when the request must be blocked. Highest
  // priority wins; at equal priority an allow (including allowAllRequests)
  // beats a block.
  function matchNetwork(index, request) {
    var req = request || {};
    var url = String(req.url === undefined || req.url === null ? "" : req.url);
    var host = lower(req.hostname);
    var type = resolveType(req.type);
    var initiatorHost = lower(req.initiatorHost);
    var ctx = {
      url: url,
      host: host,
      type: type,
      initiatorHost: initiatorHost,
      thirdParty: req.thirdParty === true
    };
    var rules = index.rules;
    var seen = {};
    var blockPri = -1;
    var allowPri = -1;

    function consider(idx) {
      if (seen[idx] === true) { return; }
      seen[idx] = true;
      var rule = rules[idx];
      if (ruleMatches(rule, ctx) === false) { return; }
      if (rule.action === 0) {
        if (rule.priority > blockPri) { blockPri = rule.priority; }
      } else if (rule.priority > allowPri) {
        allowPri = rule.priority;
      }
    }

    // 1. Host map: rules anchored on requestDomains or on a ||host anchor.
    var keys = host === "" ? [] : hostKeys(host);
    for (var i = 0; i < keys.length; i += 1) {
      var list = index.hosts.get(keys[i]);
      if (list === undefined) { continue; }
      for (var j = 0; j < list.length; j += 1) { consider(list[j]); }
    }

    // 2. Token map: the address split into runs of [a-z0-9%], the split the
    // compiler indexed each rule's most distinctive whole token by.
    var tokens = url.toLowerCase().match(/[a-z0-9%]+/g);
    if (tokens !== null) {
      var seenToken = {};
      for (var k = 0; k < tokens.length; k += 1) {
        var token = tokens[k];
        if (seenToken[token] === true) { continue; }
        seenToken[token] = true;
        var tokenList = index.tokens.get(token);
        if (tokenList === undefined) { continue; }
        for (var m = 0; m < tokenList.length; m += 1) { consider(tokenList[m]); }
      }
    }

    // 3. Generic bucket: rules with no distinctive literal to index on.
    var generic = index.generic;
    var lowerAddress = url.toLowerCase();
    for (var n = 0; n < generic.length; n += 1) {
      var genericRule = rules[generic[n]];
      // The plain text the rule needs, checked before its expression runs.
      if (genericRule.literal !== "" && lowerAddress.indexOf(genericRule.literal) < 0) { continue; }
      consider(generic[n]);
    }

    // 4. allowAllRequests carried by an initiator document host.
    if (initiatorHost !== "") {
      var initiatorKeys = hostKeys(initiatorHost);
      for (var p = 0; p < initiatorKeys.length; p += 1) {
        var aarList = index.aar.get(initiatorKeys[p]);
        if (aarList === undefined) { continue; }
        for (var q = 0; q < aarList.length; q += 1) {
          var aarIdx = aarList[q];
          if (seen[aarIdx] === true) { continue; }
          seen[aarIdx] = true;
          var aarRule = rules[aarIdx];
          if (aarMatches(aarRule, ctx) === false) { continue; }
          if (aarRule.priority > allowPri) { allowPri = aarRule.priority; }
        }
      }
    }

    return blockPri > allowPri;
  }

  // cosmeticCss returns one CSS rule string (or "") that hides every
  // selector the compiled data assigns to the page host, its parent domains
  // and its entity forms. Exceptions subtract across all those levels, the
  // same way uBOL applies them after collecting the matching lists.
  function cosmeticCss(cosmeticJson, hostname) {
    var table = cosmeticJson && cosmeticJson.h ? cosmeticJson.h : {};
    var keys = cosmeticKeys(hostname);
    var selectors = [];
    var picked = {};
    var removed = {};
    for (var i = 0; i < keys.length; i += 1) {
      var entry = table[keys[i]];
      if (entry === undefined || entry === null) { continue; }
      var adds = entry.s || [];
      for (var j = 0; j < adds.length; j += 1) {
        if (picked[adds[j]] === true) { continue; }
        picked[adds[j]] = true;
        selectors.push(adds[j]);
      }
      var drops = entry.x || [];
      for (var k = 0; k < drops.length; k += 1) { removed[drops[k]] = true; }
    }
    var out = [];
    for (var m = 0; m < selectors.length; m += 1) {
      if (removed[selectors[m]] === true) { continue; }
      out.push(selectors[m]);
    }
    if (out.length === 0) { return ""; }
    // 500 selectors per declaration keeps each injected sheet modest.
    var chunks = [];
    for (var n = 0; n < out.length; n += 500) {
      chunks.push(out.slice(n, n + 500).join(",") + "{display:none!important}");
    }
    return chunks.join("");
  }

  self.AIS6Filters = {
    compileNetwork: compileNetwork,
    matchNetwork: matchNetwork,
    cosmeticCss: cosmeticCss
  };
})();
