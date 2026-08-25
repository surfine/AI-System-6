(function installSameOriginProviders() {
  "use strict";

  const sameOriginNode = {
    id: "same-origin-node",
    request(input = {}) {
      const url = input.url || input.path;
      const init = {
        ...(input.init || {}),
        signal: input.signal || input.init?.signal,
      };
      return fetch(url, init);
    },
  };

  window.AISystem6Capabilities?.registerServiceProvider?.("reader.remote", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: `/api/reader?url=${encodeURIComponent(input.url || "")}`,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("reader.subtitlesTranslate", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/subtitles/translate",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("search.remote", {
    id: "same-origin-node",
    request(input = {}) {
      if (input.path) {
        return sameOriginNode.request({
          url: input.path,
          init: input.init,
          signal: input.signal,
        });
      }
      const params = new URLSearchParams();
      if (input.query) params.set("q", input.query);
      if (input.limit !== undefined) params.set("limit", String(input.limit));
      if (input.start !== undefined) params.set("start", String(input.start));
      if (input.provider) params.set("provider", input.provider);
      return sameOriginNode.request({
        url: `/api/search?${params.toString()}`,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("timeMachine.remote", {
    id: "same-origin-node",
    request(input = {}) {
      const path = input.route
        ? `/api/time-machine/${input.route}${input.params ? `?${input.params}` : ""}`
        : input.path;
      return sameOriginNode.request({
        url: path,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("timeMachine.renderUrl", {
    id: "same-origin-node",
    request(input = {}) {
      const params = new URLSearchParams({
        url: input.fetchedUrl || input.url || "",
        original: input.url || "",
      });
      return `/api/time-machine/render?${params}`;
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("cloud.credentials", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/cloud/credentials",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("cloud.status", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/cloud/status",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("cloud.models", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/cloud/models",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("vision.analyze", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/vision/analyze",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("cloud.chat", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: typeof cloudCredentialMode === "function" && cloudCredentialMode() === "shared-remote"
          ? "/api/mac-shared/chat"
          : "/api/cloud/chat",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("cloud.quota", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: typeof cloudCredentialMode === "function" && cloudCredentialMode() === "shared-remote"
          ? "/api/mac-shared/quota"
          : "/api/cloud/quota",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("local.lmstudio.start", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/lmstudio/start",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("macShared.session", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/mac-shared/session",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("cloud.embeddings", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: input.path || "/api/cloud/embeddings",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("endfield.search", {
    id: "same-origin-node",
    request(input = {}) {
      const query = input.query ? `?q=${encodeURIComponent(input.query)}&limit=${encodeURIComponent(input.limit || 18)}` : "";
      return sameOriginNode.request({
        url: `/api/endfield/search${query}`,
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("endfield.ask", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/endfield/ask",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("cmf.capabilities", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/cmf/capabilities",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("cmf.exportUsdz", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/cmf/export-usdz",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("system.music", {
    id: "same-origin-node",
    request(input = {}) {
      if (input.action !== undefined) {
        const publicWeb = input.publicWeb === true;
        const url = publicWeb
          ? "http://127.0.0.1:4173/api/music/system"
          : "/api/music/system";
        const init = input.action === "state"
          ? { cache: "no-store" }
          : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: input.action, ...(input.payload || {}) }),
          };
        if (publicWeb) {
          init.mode = "cors";
          init.credentials = "omit";
          if (!window.AISystem6LocalLMStudio?.isSafariPublicWebUnsupported?.()
            && !window.AISystem6LocalLMStudio?.isSafariHttpLocalMode?.()) {
            init.targetAddressSpace = "loopback";
          }
        }
        return fetch(url, init);
      }
      return sameOriginNode.request({
        url: input.url || "/api/music/system",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("soundscape.gamdl", {
    id: "same-origin-node",
    request(input = {}) {
      if (input.jobId) {
        return sameOriginNode.request({
          url: `/api/music/gamdl/jobs/${input.jobId}`,
          init: { cache: "no-store" },
          signal: input.signal,
        });
      }
      if (input.url) {
        return sameOriginNode.request({
          url: "/api/music/gamdl/jobs",
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: input.url }),
          },
          signal: input.signal,
        });
      }
      return sameOriginNode.request({
        url: input.path || "/api/music/gamdl/jobs",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("artifact.import.ocr", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/import-ocr-pages",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("artifact.import.text", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/import-text",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("system.version", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/version",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("quickDraft.thesis", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/draft/thesis",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("bureaucracyMeme.captions", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: "/api/bureaucracy/captions",
        init: input.init,
        signal: input.signal,
      });
    },
  });

  window.AISystem6Capabilities?.registerServiceProvider?.("importer.remote", {
    id: "same-origin-node",
    request(input = {}) {
      return sameOriginNode.request({
        url: input.path || "/api/importer-status",
        signal: input.signal,
      });
    },
  });

  window.AISystem6SameOriginProviders = Object.freeze({
    activate(enabledNames) {
      const names = enabledNames || [
        "reader.remote",
        "reader.subtitlesTranslate",
        "search.remote",
        "timeMachine.remote",
        "timeMachine.renderUrl",
        "importer.remote",
        "cloud.credentials",
        "cloud.status",
        "cloud.models",
        "cloud.chat",
        "vision.analyze",
        "cloud.quota",
        "cloud.embeddings",
        "local.lmstudio.start",
        "macShared.session",
        "endfield.search",
        "endfield.ask",
        "cmf.capabilities",
        "cmf.exportUsdz",
        "system.music",
        "soundscape.gamdl",
        "artifact.import.ocr",
        "artifact.import.text",
        "system.version",
        "quickDraft.thesis",
        "bureaucracyMeme.captions",
      ];
      names.forEach((name) => {
        window.AISystem6Capabilities?.setCapability?.(name, "same-origin-node");
      });
    },
  });
})();
