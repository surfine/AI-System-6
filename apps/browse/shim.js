// Time Machine's web engine: the first script in every page it shows.
//
// The service worker serves a page from https://example.com/a?b at
// <browse>/__ais6/go?u=…; this script runs before any of the page's own
// scripts and makes the frame look, from the inside, like the site's own
// address: the path and query become the site's, cookies and storage are the
// site's alone, navigations stay inside Time Machine, and sockets go through
// the relay. What it cannot change (location.origin is the browse origin) is
// left alone rather than faked badly.
//
// It also speaks to the desk: it reports the address and title, answers
// "read the page" and "read the selection" for Reading View and Clip, and
// carries back, forward, reload and stop.
(function () {
  "use strict";
  var script = document.currentScript;
  var config;
  try {
    config = JSON.parse(decodeURIComponent(escape(atob(script.getAttribute("data-ais6") || ""))));
  } catch (error) {
    return;
  }
  try {
    script.remove();
  } catch (error) {}

  var browseOrigin = location.origin;
  var target = new URL(config.url);
  var siteOrigin = target.origin;
  var token = String(config.token || "");
  var deskOrigin = String(config.desk || "");
  var isTabFrame = !config.embed && window.parent !== window;
  var nativeHistory = { replaceState: history.replaceState, pushState: history.pushState };

  function guard(fn) {
    try {
      fn();
    } catch (error) {}
  }

  // --- The address ---------------------------------------------------------

  // Before the page reads it. The router of a single-page app sees its own
  // path; relative links and fetches resolve under it.
  guard(function () {
    nativeHistory.replaceState.call(history, history.state, "", target.pathname + target.search + target.hash);
  });
  guard(function () {
    sessionStorage.removeItem("ais6-boot-attempts");
  });

  /** The site's address for something on this frame's origin. */
  function toSite(value) {
    var url = new URL(String(value), location.href);
    if (url.origin === browseOrigin) {
      if (url.pathname.indexOf("/__ais6/") === 0) return null;
      return new URL(url.pathname + url.search + url.hash, siteOrigin);
    }
    return url;
  }

  function currentSiteUrl() {
    return siteOrigin + location.pathname + location.search + location.hash;
  }

  function goUrl(href, embed) {
    return "/__ais6/go?u=" + encodeURIComponent(href)
      + "&tab=" + encodeURIComponent(config.tab || "")
      + (deskOrigin ? "&d=" + encodeURIComponent(deskOrigin) : "")
      + (embed ? "&embed=1" : "");
  }

  guard(function () {
    Object.defineProperty(document, "referrer", { configurable: true, get: function () { return String(config.referrer || ""); } });
  });
  guard(function () {
    Object.defineProperty(document, "domain", { configurable: true, get: function () { return target.hostname; }, set: function () {} });
  });
  guard(function () {
    Object.defineProperty(window, "origin", { configurable: true, get: function () { return siteOrigin; } });
  });

  // --- Cookies -------------------------------------------------------------

  // The browser's own cookie store on this origin is shared by every site
  // shown here, so document.cookie is answered from the site's own cookies,
  // which came with the page, and assignments go to the relay's sealed jar.
  var cookies = new Map();
  String(config.cookies || "").split(/;\s*/).forEach(function (pair) {
    var index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
  });
  guard(function () {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: function () {
        var parts = [];
        cookies.forEach(function (value, name) {
          parts.push(name + "=" + value);
        });
        return parts.join("; ");
      },
      set: function (value) {
        var text = String(value);
        var first = text.split(";")[0];
        var index = first.indexOf("=");
        if (index <= 0) return;
        var name = first.slice(0, index).trim();
        var expired = /;\s*max-age\s*=\s*(-\d+|0)\b/i.test(text)
          || (function () {
            var match = /;\s*expires\s*=\s*([^;]+)/i.exec(text);
            return !!match && Date.parse(match[1]) <= Date.now();
          })();
        if (expired) cookies.delete(name);
        else cookies.set(name, first.slice(index + 1).trim());
        var controller = navigator.serviceWorker && navigator.serviceWorker.controller;
        if (controller) controller.postMessage({ ais6: 1, type: "doc-cookie", url: currentSiteUrl(), assignment: text });
      },
    });
  });

  // --- Storage -------------------------------------------------------------

  // localStorage, sessionStorage, IndexedDB and Cache Storage are filed under
  // the site's own name, so one site cannot read what another left here.
  var prefix = target.hostname + "\u0001";
  function partitionedStorage(storage) {
    function own(key) {
      return prefix + String(key);
    }
    function keys() {
      var out = [];
      for (var index = 0; index < storage.length; index += 1) {
        var key = storage.key(index);
        if (key && key.indexOf(prefix) === 0) out.push(key.slice(prefix.length));
      }
      return out;
    }
    var api = {
      getItem: function (key) { return storage.getItem(own(key)); },
      setItem: function (key, value) { storage.setItem(own(key), String(value)); },
      removeItem: function (key) { storage.removeItem(own(key)); },
      clear: function () { keys().forEach(function (key) { storage.removeItem(own(key)); }); },
      key: function (index) { return keys()[index] === undefined ? null : keys()[index]; },
    };
    return new Proxy(api, {
      get: function (object, name) {
        if (name === "length") return keys().length;
        if (typeof name === "symbol" || Object.prototype.hasOwnProperty.call(api, name)) return object[name];
        return storage.getItem(own(name));
      },
      set: function (object, name, value) {
        if (typeof name === "symbol") return false;
        storage.setItem(own(name), String(value));
        return true;
      },
      deleteProperty: function (object, name) {
        storage.removeItem(own(name));
        return true;
      },
      has: function (object, name) {
        return Object.prototype.hasOwnProperty.call(api, name) || storage.getItem(own(name)) !== null;
      },
      ownKeys: function () {
        return keys();
      },
      getOwnPropertyDescriptor: function (object, name) {
        var value = storage.getItem(own(name));
        return value === null ? undefined : { value: value, writable: true, enumerable: true, configurable: true };
      },
    });
  }
  ["localStorage", "sessionStorage"].forEach(function (name) {
    guard(function () {
      var storage = window[name];
      var wrapped = partitionedStorage(storage);
      Object.defineProperty(window, name, { configurable: true, get: function () { return wrapped; } });
    });
  });
  guard(function () {
    var factory = IDBFactory.prototype;
    var open = factory.open;
    var remove = factory.deleteDatabase;
    var databases = factory.databases;
    factory.open = function (name, version) {
      return arguments.length > 1 ? open.call(this, prefix + name, version) : open.call(this, prefix + name);
    };
    factory.deleteDatabase = function (name) {
      return remove.call(this, prefix + name);
    };
    if (databases) {
      factory.databases = function () {
        return databases.call(this).then(function (list) {
          return list
            .filter(function (entry) { return entry.name && entry.name.indexOf(prefix) === 0; })
            .map(function (entry) { return { name: entry.name.slice(prefix.length), version: entry.version }; });
        });
      };
    }
  });
  guard(function () {
    if (!window.CacheStorage) return;
    var storage = CacheStorage.prototype;
    ["open", "has", "delete"].forEach(function (method) {
      var original = storage[method];
      storage[method] = function (name) {
        return original.call(this, prefix + name);
      };
    });
    var keys = storage.keys;
    storage.keys = function () {
      return keys.call(this).then(function (names) {
        return names.filter(function (name) { return name.indexOf(prefix) === 0; }).map(function (name) { return name.slice(prefix.length); });
      });
    };
  });

  // The engine's own worker controls this origin; a site's worker would take
  // its place and the next page would leave the relay.
  guard(function () {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () {
        return Promise.reject(new DOMException("Service workers are not available in Time Machine.", "SecurityError"));
      };
    }
  });

  // --- Navigation ----------------------------------------------------------

  function navigateTo(href) {
    var site = toSite(href);
    if (!site) return false;
    if (site.protocol !== "http:" && site.protocol !== "https:") {
      post({ type: "external", url: site.href });
      return true;
    }
    location.assign(goUrl(site.href, !!config.embed));
    return true;
  }

  // Every navigation that would leave this document goes through /__ais6/go
  // with the site's full address, so the worker never has to guess which
  // site a path belongs to.
  guard(function () {
    if (!window.navigation) return;
    window.navigation.addEventListener("navigate", function (event) {
      if (!event.cancelable || event.hashChange || event.downloadRequest !== null) return;
      if (event.navigationType === "traverse" || event.navigationType === "reload") return;
      var destination = new URL(event.destination.url);
      if (destination.origin === browseOrigin && destination.pathname.indexOf("/__ais6/") === 0) return;
      if (event.destination.sameDocument) return;
      // A posted form keeps its method and body: it goes to this origin's
      // path, where the worker knows the site from the page that sent it.
      if (event.formData && destination.origin === browseOrigin) return;
      var site = toSite(destination.href);
      if (!site) return;
      event.preventDefault();
      navigateTo(site.href);
    });
  });

  // Without the Navigation API, links and forms are caught where they start.
  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    var element = event.target && event.target.closest ? event.target.closest("a[href], area[href]") : null;
    if (!element || element.hasAttribute("download")) return;
    var href = element.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#" || /^javascript:/i.test(href)) return;
    var site = toSite(element.href);
    if (!site) return;
    var newWindow = (element.getAttribute("target") || "").toLowerCase() === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey;
    if (newWindow) {
      event.preventDefault();
      post({ type: "open", url: site.href });
      return;
    }
    if (window.navigation) return;
    event.preventDefault();
    navigateTo(site.href);
  }, false);

  guard(function () {
    var open = window.open;
    window.open = function (url) {
      if (!url) return open.apply(window, arguments);
      var site = toSite(url);
      if (site) post({ type: "open", url: site.href });
      return null;
    };
  });

  // Frames another site provides are opened through the worker too.
  function frameSource(value) {
    try {
      var url = new URL(String(value), location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return value;
      if (url.origin === browseOrigin) return value;
      return goUrl(url.href, true);
    } catch (error) {
      return value;
    }
  }
  guard(function () {
    [window.HTMLIFrameElement, window.HTMLFrameElement].forEach(function (constructor) {
      if (!constructor) return;
      var descriptor = Object.getOwnPropertyDescriptor(constructor.prototype, "src");
      Object.defineProperty(constructor.prototype, "src", {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: function () {
          var value = descriptor.get.call(this);
          try {
            var url = new URL(value);
            if (url.origin === browseOrigin && url.pathname === "/__ais6/go") return url.searchParams.get("u") || value;
          } catch (error) {}
          return value;
        },
        set: function (value) {
          descriptor.set.call(this, frameSource(value));
        },
      });
    });
    var setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (String(name).toLowerCase() === "src" && (this instanceof HTMLIFrameElement || (window.HTMLFrameElement && this instanceof HTMLFrameElement))) {
        return setAttribute.call(this, name, frameSource(value));
      }
      return setAttribute.call(this, name, value);
    };
  });

  // --- Messages between frames ----------------------------------------------

  // Every frame here shares one origin, so a page that writes
  // frame.postMessage(data, "https://www.youtube.com") would be refused, and
  // a page that checks event.origin would see the browse origin. Both are
  // translated: messages go to the frame they were meant for, and arrive
  // carrying the site origin of the frame that sent them.
  guard(function () {
    window.__ais6SiteOrigin = siteOrigin;
    var postMessage = window.postMessage;
    window.postMessage = function (message, targetOrigin, transfer) {
      var origin = targetOrigin;
      if (typeof origin === "string" && origin !== "*" && origin !== "/" && origin !== browseOrigin) origin = browseOrigin;
      else if (origin && typeof origin === "object" && origin.targetOrigin && origin.targetOrigin !== "*" && origin.targetOrigin !== "/") {
        origin = Object.assign({}, origin, { targetOrigin: browseOrigin });
      }
      return arguments.length > 2 ? postMessage.call(this, message, origin, transfer) : postMessage.call(this, message, origin);
    };
    var descriptor = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "origin");
    Object.defineProperty(MessageEvent.prototype, "origin", {
      configurable: true,
      get: function () {
        var origin = descriptor.get.call(this);
        if (origin !== browseOrigin) return origin;
        try {
          var source = this.source;
          if (source && source.__ais6SiteOrigin) return source.__ais6SiteOrigin;
        } catch (error) {}
        return origin;
      },
    });
  });

  // --- Sockets ---------------------------------------------------------------

  guard(function () {
    var NativeWebSocket = window.WebSocket;
    if (!NativeWebSocket) return;
    function RelayedWebSocket(url, protocols) {
      var resolved = new URL(String(url), location.href);
      if (resolved.origin === browseOrigin.replace(/^http/, "ws")) {
        resolved = new URL(resolved.pathname + resolved.search, siteOrigin.replace(/^http/, "ws"));
      }
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        resolved.protocol = resolved.protocol === "https:" ? "wss:" : "ws:";
      }
      var list = protocols === undefined ? [] : [].concat(protocols);
      var relayUrl = browseOrigin.replace(/^http/, "ws") + "/__ais6/relay-ws"
        + "?u=" + encodeURIComponent(resolved.href)
        + "&k=" + encodeURIComponent(token)
        + "&j=" + encodeURIComponent(config.jar || "")
        + "&o=" + encodeURIComponent(siteOrigin)
        + "&p=" + encodeURIComponent(list.join(","));
      return new NativeWebSocket(relayUrl, list);
    }
    RelayedWebSocket.prototype = NativeWebSocket.prototype;
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function (name) {
      RelayedWebSocket[name] = NativeWebSocket[name];
    });
    window.WebSocket = RelayedWebSocket;
  });

  // --- Ads -------------------------------------------------------------------

  function applyCosmetic() {
    if (!config.adblock) return;
    fetch("/__ais6/cosmetic?h=" + encodeURIComponent(target.hostname), { cache: "no-store" })
      .then(function (response) { return response.ok ? response.text() : ""; })
      .then(function (css) {
        if (!css) return;
        var style = document.createElement("style");
        style.setAttribute("data-ais6", "cosmetic");
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
      })
      .catch(function () {});
  }
  applyCosmetic();

  // --- The desk --------------------------------------------------------------

  function post(message) {
    if (!deskOrigin) return;
    message.ais6 = 1;
    message.tab = config.tab || "";
    try {
      // The tab's own frame talks to the desk directly; a frame inside it
      // asks the top of the tab (window.top is the desk itself).
      window.top.postMessage(message, deskOrigin);
    } catch (error) {}
  }

  var stateTimer = 0;
  function reportState() {
    if (!isTabFrame) return;
    clearTimeout(stateTimer);
    stateTimer = setTimeout(function () {
      post({
        type: "state",
        url: currentSiteUrl(),
        title: document.title || "",
        // Loading until the document is parsed: a page whose last tracker
        // never answers is still a page to read, clip and ask about.
        loading: document.readyState === "loading",
        canGoBack: !!(window.navigation && window.navigation.canGoBack),
        canGoForward: !!(window.navigation && window.navigation.canGoForward),
      });
    }, 30);
  }
  guard(function () {
    history.pushState = function () {
      var result = nativeHistory.pushState.apply(history, arguments);
      reportState();
      return result;
    };
    history.replaceState = function () {
      var result = nativeHistory.replaceState.apply(history, arguments);
      reportState();
      return result;
    };
  });
  window.addEventListener("popstate", reportState);
  // Routers that move through the Navigation API instead of pushState.
  guard(function () {
    if (!window.navigation) return;
    window.navigation.addEventListener("navigatesuccess", reportState);
    window.navigation.addEventListener("currententrychange", reportState);
  });
  window.addEventListener("hashchange", reportState);
  document.addEventListener("DOMContentLoaded", function () {
    reportState();
    guard(function () {
      var title = document.querySelector("title");
      if (title) new MutationObserver(reportState).observe(title, { childList: true, characterData: true, subtree: true });
    });
  });
  window.addEventListener("load", reportState);
  // Back and forward may bring this page back from the browser's page cache
  // without running anything again; it still has to say where it is.
  window.addEventListener("pageshow", reportState);
  reportState();

  function selectionPayload() {
    var selection = window.getSelection();
    var text = selection ? String(selection.toString()) : "";
    var before = "";
    var after = "";
    if (selection && selection.rangeCount && text) {
      guard(function () {
        var range = selection.getRangeAt(0);
        var context = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode);
        var block = context.closest ? context.closest("p, li, blockquote, td, section, article, div") || context : context;
        var whole = block.textContent || "";
        var at = whole.indexOf(text);
        if (at >= 0) {
          before = whole.slice(Math.max(0, at - 240), at);
          after = whole.slice(at + text.length, at + text.length + 240);
        }
      });
    }
    return { text: text.slice(0, 20000), before: before, after: after };
  }

  // The desk keeps the current selection so Clip works from the menu
  // without a round trip at the moment it is chosen.
  var selectionTimer = 0;
  document.addEventListener("selectionchange", function () {
    if (!isTabFrame) return;
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(function () {
      post(Object.assign({ type: "selection" }, selectionPayload()));
    }, 160);
  });

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.ais6 !== 1) return;
    if (!isTabFrame || event.source !== window.parent || (deskOrigin && event.origin !== deskOrigin)) return;
    var reply = function (payload) {
      payload.ais6 = 1;
      payload.reply = data.id;
      payload.tab = config.tab || "";
      event.source.postMessage(payload, deskOrigin || "*");
    };
    switch (data.type) {
      case "read-dom":
        reply({
          type: "dom",
          url: currentSiteUrl(),
          title: document.title || "",
          html: (document.documentElement ? document.documentElement.outerHTML : "").slice(0, 5 * 1024 * 1024),
        });
        break;
      case "read-selection":
        reply(Object.assign({ type: "selection", url: currentSiteUrl(), title: document.title || "" }, selectionPayload()));
        break;
      case "back":
        history.back();
        break;
      case "forward":
        history.forward();
        break;
      case "reload":
        location.reload();
        break;
      case "stop":
        window.stop();
        break;
      case "token":
        token = String(data.token || token);
        guard(function () {
          navigator.serviceWorker.controller.postMessage({ ais6: 1, type: "token", token: token });
        });
        break;
      case "adblock":
        guard(function () {
          navigator.serviceWorker.controller.postMessage({ ais6: 1, type: "adblock", enabled: !!data.enabled });
        });
        break;
      case "clear":
        guard(function () {
          var channel = new MessageChannel();
          channel.port1.onmessage = function () {
            guard(function () {
              window.localStorage.clear();
            });
            reply({ type: "cleared" });
          };
          navigator.serviceWorker.controller.postMessage({ ais6: 1, type: "clear" }, [channel.port2]);
        });
        break;
      default:
        break;
    }
  });

  // The worker asks for a fresh token when the relay refuses an old one.
  guard(function () {
    navigator.serviceWorker.addEventListener("message", function (event) {
      var data = event.data || {};
      if (data.ais6 !== 1) return;
      if (data.type === "need-token") post({ type: "need-token" });
      if (data.type === "load-failed" && isTabFrame) post({ type: "load-failed", url: data.url, code: data.code, message: data.message });
    });
  });

  // Menu shortcuts the page did not use belong to the desk.
  window.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    var key = String(event.key || "").toLowerCase();
    if (["l", "t", "w", "[", "]", "r", "d"].indexOf(key) < 0) return;
    event.preventDefault();
    post({ type: "key", key: key, shift: event.shiftKey });
  });
  window.addEventListener("focus", function () {
    post({ type: "focus" });
  }, true);
  document.addEventListener("pointerdown", function () {
    post({ type: "focus" });
  }, true);
})();
