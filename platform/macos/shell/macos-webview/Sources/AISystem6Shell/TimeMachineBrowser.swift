import AppKit
import SwiftUI
import WebKit

// Time Machine's native engine: on macOS 26 and later the Mac app draws a
// web page with the system's own WebKit, over the Time Machine window's page
// area, instead of the snapshot the desk can draw by itself.
//
// The desk stays a web page; this file adds one native view per open tab and
// keeps it exactly where the desk says the page area is. The desk reports the
// rectangle and everything drawn over it (other windows, menus, balloons), so
// the view is clipped to what is actually uncovered and passes clicks through
// where it is covered. Nothing here decides what Time Machine shows: the desk
// asks, and the pages' own content is reported back as data.
//
//   desk → shell   window.webkit.messageHandlers.aisystem6Browser.postMessage
//   shell → desk   window.AISystem6TimeMachineNative.receive(event)
//
// See apps/desktop/app/features/time-machine-engine.js for the other half.

/// The page view plus the region the desk says is covered.
@available(macOS 26.0, *)
final class LivePageContainer: NSView {
  var covered: [CGRect] = [] {
    didSet { updateMask() }
  }

  override var isFlipped: Bool { true }

  override func layout() {
    super.layout()
    updateMask()
  }

  // Where another System 6 window is drawn over the page, clicks belong to
  // that window: the desk's web view underneath receives them.
  override func hitTest(_ point: NSPoint) -> NSView? {
    let local = convert(point, from: superview)
    if covered.contains(where: { $0.contains(local) }) { return nil }
    return super.hitTest(point)
  }

  private func updateMask() {
    wantsLayer = true
    guard let layer else { return }
    if covered.isEmpty {
      layer.mask = nil
      return
    }
    var visible = CGPath(rect: bounds, transform: nil)
    for rect in covered {
      visible = visible.subtracting(CGPath(rect: rect, transform: nil))
    }
    let mask = CAShapeLayer()
    mask.frame = bounds
    mask.path = visible
    layer.mask = mask
  }
}

@available(macOS 26.0, *)
@MainActor
final class TimeMachineBrowser: NSObject, WKScriptMessageHandlerWithReply, WKScriptMessageHandler {
  private final class LiveTab {
    let id: String
    let page: WebPage
    let container: LivePageContainer
    var lastUsed = Date()
    var lastSelection: [String: String] = [:]

    init(id: String, page: WebPage, container: LivePageContainer) {
      self.id = id
      self.page = page
      self.container = container
    }
  }

  private weak var deskWebView: WKWebView?
  private weak var hostView: NSView?
  private weak var window: NSWindow?
  private let isDeskURL: (URL) -> Bool
  private var tabs: [String: LiveTab] = [:]
  private var activeTab = ""
  private let maxLiveTabs = 6
  private let pageWorld = WKContentWorld.world(name: "ai-system-6-time-machine")
  private let extensionURL: URL?
  private var extensionController: WKWebExtensionController?
  private var extensionContext: WKWebExtensionContext?
  private var blockingAds = true

  // One fixed identifier: the pages' cookies and storage live in their own
  // persistent store, never in the desk's default store (which holds the
  // writer's projects), and "Clear Browsing Data" removes exactly this one.
  private static let storeIdentifier = UUID(uuidString: "6A1D5E2C-7F3B-4C1A-9E8D-2B6F0C4A9D11")!

  init(deskWebView: WKWebView, hostView: NSView, window: NSWindow, extensionURL: URL?, isDeskURL: @escaping (URL) -> Bool) {
    self.deskWebView = deskWebView
    self.hostView = hostView
    self.window = window
    self.extensionURL = extensionURL
    self.isDeskURL = isDeskURL
    super.init()
    let controller = deskWebView.configuration.userContentController
    controller.addScriptMessageHandler(self, contentWorld: .page, name: "aisystem6Browser")
    // The capability the desk looks for; main frame only, so a frame inside
    // the desk (Time Machine's own snapshot, a game) never sees the bridge.
    controller.addUserScript(WKUserScript(
      source: "Object.defineProperty(window, 'AISystem6Native', { value: Object.freeze({ browser: 1 }), configurable: false });",
      injectionTime: .atDocumentStart,
      forMainFrameOnly: true
    ))
    // The extension load stays off `Bundle.main`'s paths (see
    // shellExecutableURL in main.swift): macOS 27 WebKit's manifest
    // localization for `__MSG_*__` extensions asserts if the app's main
    // bundle was touched first, and the trap cannot be caught here.
    Task { @MainActor in
      await loadAdBlocker()
    }
  }

  // MARK: Ad blocking

  /// uBlock Origin Lite's own Safari build, loaded through WebKit's web
  /// extension support: the same filters Safari users run, unmodified. The
  /// release bundle uses a ZIP because older WebKit builds can assert while
  /// loading a directory resource URL.
  private func loadAdBlocker() async {
    guard let extensionURL else {
      shellLog("time machine: no ad blocker bundled")
      return
    }
    let isArchive = extensionURL.pathExtension.lowercased() == "zip"
    let hasManifest = FileManager.default.fileExists(atPath: extensionURL.appendingPathComponent("manifest.json").path)
    guard FileManager.default.fileExists(atPath: extensionURL.path), isArchive || hasManifest else {
      shellLog("time machine: no ad blocker bundled")
      return
    }
    do {
      let webExtension = try await WKWebExtension(resourceBaseURL: extensionURL)
      let context = WKWebExtensionContext(for: webExtension)
      for permission in webExtension.requestedPermissions {
        context.setPermissionStatus(.grantedExplicitly, for: permission)
      }
      for pattern in webExtension.allRequestedMatchPatterns {
        context.setPermissionStatus(.grantedExplicitly, for: pattern)
      }
      context.setPermissionStatus(.grantedExplicitly, for: WKWebExtension.MatchPattern.allURLs())
      let controller = WKWebExtensionController()
      try controller.load(context)
      extensionController = controller
      extensionContext = context
      shellLog("time machine: ad blocker loaded \(webExtension.version ?? "")")
    } catch {
      shellLog("time machine: ad blocker failed \(error.localizedDescription)")
    }
  }

  private func setBlocking(_ enabled: Bool) {
    blockingAds = enabled
    guard let controller = extensionController, let context = extensionContext else { return }
    do {
      if enabled, !controller.extensionContexts.contains(context) {
        try controller.load(context)
      } else if !enabled, controller.extensionContexts.contains(context) {
        try controller.unload(context)
      }
    } catch {
      shellLog("time machine: ad blocker toggle failed \(error.localizedDescription)")
    }
  }

  // MARK: Desk messages

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage,
    replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
  ) {
    // Only the desk's own main frame drives the native view.
    guard message.frameInfo.isMainFrame,
          let url = message.frameInfo.request.url,
          isDeskURL(url),
          let body = message.body as? [String: Any],
          let method = body["method"] as? String
    else {
      replyHandler(nil, "refused")
      return
    }
    let tab = String((body["tab"] as? String ?? "").prefix(80))
    switch method {
    case "open":
      guard let target = body["url"] as? String, let targetURL = URL(string: target), ["http", "https"].contains(targetURL.scheme?.lowercased() ?? "") else {
        replyHandler(nil, "bad-url")
        return
      }
      if let blockAds = body["blockAds"] as? Bool, blockAds != blockingAds { setBlocking(blockAds) }
      open(tab: tab, url: targetURL)
      replyHandler(true, nil)
    case "layout":
      layout(tab: tab, body: body)
      replyHandler(true, nil)
    case "close":
      close(tab: tab)
      replyHandler(true, nil)
    case "history":
      history(tab: tab, action: body["action"] as? String ?? "")
      replyHandler(true, nil)
    case "readDOM":
      Task { @MainActor in
        let result = await self.readDocument(tab: tab)
        replyHandler(result, result == nil ? "no-page" : nil)
      }
    case "setBlocking":
      setBlocking(body["enabled"] as? Bool ?? true)
      replyHandler(true, nil)
    case "clearData":
      Task { @MainActor in
        let ok = await self.clearData()
        replyHandler(ok, nil)
      }
    case "renderForReader":
      guard let target = body["url"] as? String, let targetURL = URL(string: target), ["http", "https"].contains(targetURL.scheme?.lowercased() ?? "") else {
        replyHandler(nil, "bad-url")
        return
      }
      Task { @MainActor in
        let result = await self.renderForReader(url: targetURL)
        replyHandler(result, result == nil ? "render-failed" : nil)
      }
    default:
      replyHandler(nil, "unknown-method")
    }
  }

  // Events from the pages, posted by the script injected into this engine's
  // own content world; the pages' own scripts cannot reach this handler.
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let type = body["type"] as? String, let tab = body["tab"] as? String, tabs[tab] != nil else { return }
    switch type {
    case "selection":
      let value: [String: String] = [
        "text": String((body["text"] as? String ?? "").prefix(20000)),
        "before": String((body["before"] as? String ?? "").prefix(400)),
        "after": String((body["after"] as? String ?? "").prefix(400)),
      ]
      tabs[tab]?.lastSelection = value
      send(["type": "selection", "tab": tab].merging(value) { first, _ in first })
    case "key":
      send(["type": "key", "tab": tab, "key": String((body["key"] as? String ?? "").prefix(4)), "shift": body["shift"] as? Bool ?? false])
    case "focus":
      send(["type": "focus", "tab": tab])
    default:
      break
    }
  }

  private func send(_ event: [String: Any]) {
    deskWebView?.callAsyncJavaScript(
      "window.AISystem6TimeMachineNative && window.AISystem6TimeMachineNative.receive(event)",
      arguments: ["event": event],
      in: nil,
      in: .page,
      completionHandler: nil
    )
  }

  // MARK: Pages

  private static let pageScript = """
  (function () {
    var tab = %TAB%;
    var post = function (message) {
      message.tab = tab;
      try { window.webkit.messageHandlers.ais6page.postMessage(message); } catch (error) {}
    };
    var timer = 0;
    document.addEventListener('selectionchange', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var selection = window.getSelection();
        var text = selection ? String(selection.toString()) : '';
        var before = '', after = '';
        if (text && selection.rangeCount) {
          var node = selection.getRangeAt(0).commonAncestorContainer;
          var block = (node.nodeType === 1 ? node : node.parentNode);
          block = (block && block.closest && block.closest('p, li, blockquote, td, section, article, div')) || block;
          var whole = (block && block.textContent) || '';
          var at = whole.indexOf(text);
          if (at >= 0) {
            before = whole.slice(Math.max(0, at - 240), at);
            after = whole.slice(at + text.length, at + text.length + 240);
          }
        }
        post({ type: 'selection', text: text.slice(0, 20000), before: before, after: after });
      }, 160);
    });
    window.addEventListener('keydown', function (event) {
      if (event.defaultPrevented || !event.metaKey || event.altKey || event.ctrlKey) return;
      var key = String(event.key || '').toLowerCase();
      if (['l', 't', 'w', '[', ']', 'r'].indexOf(key) < 0) return;
      event.preventDefault();
      post({ type: 'key', key: key, shift: event.shiftKey });
    }, true);
    document.addEventListener('pointerdown', function () { post({ type: 'focus' }); }, true);
  })();
  """

  private func makePage(tab: String) -> WebPage {
    var configuration = WebPage.Configuration()
    configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: Self.storeIdentifier)
    let userContent = WKUserContentController()
    let tabLiteral = (try? String(data: JSONSerialization.data(withJSONObject: [tab]), encoding: .utf8)).flatMap { $0 }.map { String($0.dropFirst().dropLast()) } ?? "\"\""
    userContent.addUserScript(WKUserScript(
      source: Self.pageScript.replacingOccurrences(of: "%TAB%", with: tabLiteral),
      injectionTime: .atDocumentEnd,
      forMainFrameOnly: true,
      in: pageWorld
    ))
    userContent.add(self, contentWorld: pageWorld, name: "ais6page")
    configuration.userContentController = userContent
    if blockingAds, let controller = extensionController {
      configuration.webExtensionController = controller
    }
    var preferences = WebPage.NavigationPreferences()
    preferences.preferredHTTPSNavigationPolicy = .automaticFallbackToHTTP
    configuration.defaultNavigationPreferences = preferences
    // Sites serve the layout they serve Safari.
    let major = ProcessInfo.processInfo.operatingSystemVersion.majorVersion
    configuration.applicationNameForUserAgent = "Version/\(major).0 Safari/605.1.15"
    let page = WebPage(
      configuration: configuration,
      navigationDecider: NavigationDecider(browser: self, tab: tab),
      dialogPresenter: DialogPresenter(window: window)
    )
    return page
  }

  private func open(tab: String, url: URL) {
    let live: LiveTab
    if let existing = tabs[tab] {
      live = existing
    } else {
      let page = makePage(tab: tab)
      let container = LivePageContainer(frame: .zero)
      let content = WebView(page)
        .webViewBackForwardNavigationGestures(.enabled)
        .webViewMagnificationGestures(.enabled)
        .webViewLinkPreviews(.enabled)
      let hosting = NSHostingView(rootView: content)
      hosting.translatesAutoresizingMaskIntoConstraints = true
      hosting.autoresizingMask = [.width, .height]
      container.addSubview(hosting)
      container.isHidden = true
      if let hostView, let deskWebView {
        hostView.addSubview(container, positioned: .above, relativeTo: deskWebView)
      }
      live = LiveTab(id: tab, page: page, container: container)
      tabs[tab] = live
      observe(live)
      evictIfNeeded()
    }
    live.lastUsed = Date()
    activeTab = tab
    _ = live.page.load(URLRequest(url: url))
    sendState(live)
  }

  private func evictIfNeeded() {
    guard tabs.count > maxLiveTabs else { return }
    let oldest = tabs.values.filter { $0.id != activeTab }.min { $0.lastUsed < $1.lastUsed }
    if let oldest { close(tab: oldest.id) }
  }

  private func close(tab: String) {
    guard let live = tabs.removeValue(forKey: tab) else { return }
    live.page.stopLoading()
    live.container.removeFromSuperview()
    if activeTab == tab { activeTab = "" }
  }

  /// Every change WebKit reports about a page goes to the desk as one state.
  private func observe(_ live: LiveTab) {
    withObservationTracking {
      _ = live.page.url
      _ = live.page.title
      _ = live.page.isLoading
      _ = live.page.backForwardList
    } onChange: { [weak self, id = live.id, identity = ObjectIdentifier(live)] in
      Task { @MainActor in
        // Only the tab this observation was made for: a tab closed and
        // reopened under the same id has its own observation already.
        guard let self, let current = self.tabs[id], ObjectIdentifier(current) == identity else { return }
        self.sendState(current)
        self.observe(current)
      }
    }
  }

  private func sendState(_ live: LiveTab) {
    send([
      "type": "state",
      "tab": live.id,
      "url": live.page.url?.absoluteString ?? "",
      "title": live.page.title,
      "loading": live.page.isLoading,
      "canGoBack": !live.page.backForwardList.backList.isEmpty,
      "canGoForward": !live.page.backForwardList.forwardList.isEmpty,
    ])
  }

  fileprivate func requestNewTab(url: URL) {
    send(["type": "open", "url": url.absoluteString])
  }

  fileprivate func reportFailure(tab: String, url: URL?, message: String) {
    send(["type": "load-failed", "tab": tab, "url": url?.absoluteString ?? "", "message": message])
  }

  private func history(tab: String, action: String) {
    guard let live = tabs[tab] else { return }
    switch action {
    case "back":
      if let item = live.page.backForwardList.backList.last { _ = live.page.load(item) }
    case "forward":
      if let item = live.page.backForwardList.forwardList.first { _ = live.page.load(item) }
    case "reload":
      _ = live.page.reload()
    case "stop":
      live.page.stopLoading()
    default:
      break
    }
  }

  // MARK: Layout

  /// The desk reports CSS pixels in its own viewport; this places the view
  /// over exactly that rectangle and cuts out what is drawn over it.
  private func layout(tab: String, body: [String: Any]) {
    guard let deskWebView, let hostView else { return }
    let visible = body["visible"] as? Bool ?? false
    let scale = deskWebView.pageZoom * deskWebView.magnification
    func rect(_ value: Any?) -> CGRect? {
      guard let box = value as? [String: Any],
            let x = (box["x"] as? NSNumber)?.doubleValue,
            let y = (box["y"] as? NSNumber)?.doubleValue,
            let width = (box["width"] as? NSNumber)?.doubleValue,
            let height = (box["height"] as? NSNumber)?.doubleValue,
            width >= 0, height >= 0
      else { return nil }
      return CGRect(x: x * scale, y: y * scale, width: width * scale, height: height * scale)
    }
    for (id, live) in tabs where id != tab {
      live.container.isHidden = true
    }
    guard let live = tabs[tab], visible, let pageRect = rect(body["rect"]), pageRect.width > 1, pageRect.height > 1 else {
      tabs[tab]?.container.isHidden = true
      return
    }
    activeTab = tab
    live.lastUsed = Date()
    // The desk's coordinates are top-down from the web view's top-left.
    let flipped = deskWebView.isFlipped
      ? pageRect
      : CGRect(x: pageRect.minX, y: deskWebView.bounds.height - pageRect.maxY, width: pageRect.width, height: pageRect.height)
    let frame = deskWebView.convert(flipped, to: hostView)
    live.container.frame = frame.integral
    live.container.subviews.first?.frame = live.container.bounds
    let occluders = (body["occluders"] as? [Any] ?? []).compactMap(rect).map { occluder in
      // Into the container's own top-down coordinates.
      CGRect(x: occluder.minX - pageRect.minX, y: occluder.minY - pageRect.minY, width: occluder.width, height: occluder.height)
    }
    live.container.covered = occluders
    live.container.isHidden = false
  }

  // MARK: Reading

  private static let readScript = """
  return {
    html: document.documentElement ? document.documentElement.outerHTML.slice(0, 5242880) : '',
    url: location.href,
    title: document.title || ''
  };
  """

  private func readDocument(tab: String) async -> [String: Any]? {
    guard let live = tabs[tab] else { return nil }
    do {
      let value = try await live.page.callJavaScript(Self.readScript, contentWorld: pageWorld)
      return value as? [String: Any]
    } catch {
      return nil
    }
  }

  /// Reader's rung for pages that build their text with JavaScript: an
  /// off-screen page that keeps nothing (a non-persistent store), loaded,
  /// given a moment to settle, read, and dropped.
  private func renderForReader(url: URL) async -> [String: Any]? {
    var configuration = WebPage.Configuration()
    configuration.websiteDataStore = .nonPersistent()
    if blockingAds, let controller = extensionController {
      configuration.webExtensionController = controller
    }
    let page = WebPage(configuration: configuration)
    let deadline = Date().addingTimeInterval(25)
    do {
      for try await event in page.load(URLRequest(url: url)) {
        if event == .finished || Date() > deadline { break }
      }
    } catch {
      return nil
    }
    // Text that arrives after load (a feed, an article fetched by the app)
    // usually lands within a second; wait until the length stops changing.
    var previous = -1
    for _ in 0..<8 {
      try? await Task.sleep(for: .milliseconds(400))
      let length = (try? await page.callJavaScript("return document.body ? document.body.innerText.length : 0", contentWorld: pageWorld)) as? Int ?? 0
      if length == previous { break }
      previous = length
    }
    let value = try? await page.callJavaScript(Self.readScript, contentWorld: pageWorld)
    page.stopLoading()
    return value as? [String: Any]
  }

  // MARK: Clearing

  private func clearData() async -> Bool {
    for id in Array(tabs.keys) { close(tab: id) }
    return await withCheckedContinuation { continuation in
      WKWebsiteDataStore.remove(forIdentifier: Self.storeIdentifier) { error in
        if let error { shellLog("time machine: clear failed \(error.localizedDescription)") }
        continuation.resume(returning: error == nil)
      }
    }
  }
}

// MARK: - Navigation policy

@available(macOS 26.0, *)
@MainActor
private struct NavigationDecider: WebPage.NavigationDeciding {
  weak var browser: TimeMachineBrowser?
  let tab: String

  mutating func decidePolicy(for action: WebPage.NavigationAction, preferences: inout WebPage.NavigationPreferences) async -> WKNavigationActionPolicy {
    guard let url = action.request.url else { return .cancel }
    let scheme = url.scheme?.lowercased() ?? ""
    if ["mailto", "tel", "sms", "facetime", "maps"].contains(scheme) {
      // The writer's own apps answer these.
      NSWorkspace.shared.open(url)
      return .cancel
    }
    guard ["http", "https", "about", "blob", "data"].contains(scheme) else { return .cancel }
    if #available(macOS 27.0, *) {
      preferences.isGlobalPrivacyControlEnabled = true
    }
    // A link meant for a new window opens as a new Time Machine tab.
    if action.target == nil, scheme == "http" || scheme == "https" {
      browser?.requestNewTab(url: url)
      return .cancel
    }
    if action.shouldPerformDownload {
      NSWorkspace.shared.open(url)
      return .cancel
    }
    return .allow
  }

  mutating func decidePolicy(for response: WebPage.NavigationResponse) async -> WKNavigationResponsePolicy {
    // Something WebKit cannot draw (an installer, an archive) is a download;
    // the writer's own browser handles those, with its own download list.
    if !response.canShowMimeType {
      if let url = response.response.url { NSWorkspace.shared.open(url) }
      return .cancel
    }
    return .allow
  }
}

// MARK: - Dialogs

@available(macOS 26.0, *)
@MainActor
private struct DialogPresenter: WebPage.DialogPresenting {
  weak var window: NSWindow?

  private func run(_ alert: NSAlert) async -> NSApplication.ModalResponse {
    guard let window else { return alert.runModal() }
    return await withCheckedContinuation { continuation in
      alert.beginSheetModal(for: window) { continuation.resume(returning: $0) }
    }
  }

  private func alert(_ message: String, frame: WebPage.FrameInfo) -> NSAlert {
    let alert = NSAlert()
    // The page's words, attributed to the page that wrote them.
    alert.messageText = frame.securityOrigin.host.isEmpty ? "Time Machine" : frame.securityOrigin.host
    alert.informativeText = message
    return alert
  }

  func handleJavaScriptAlert(message: String, initiatedBy frame: WebPage.FrameInfo) async {
    let alert = alert(message, frame: frame)
    alert.addButton(withTitle: "OK")
    _ = await run(alert)
  }

  func handleJavaScriptConfirm(message: String, initiatedBy frame: WebPage.FrameInfo) async -> WebPage.JavaScriptConfirmResult {
    let alert = alert(message, frame: frame)
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    return await run(alert) == .alertFirstButtonReturn ? .ok : .cancel
  }

  func handleJavaScriptPrompt(message: String, defaultText: String?, initiatedBy frame: WebPage.FrameInfo) async -> WebPage.JavaScriptPromptResult {
    let alert = alert(message, frame: frame)
    let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
    input.stringValue = defaultText ?? ""
    alert.accessoryView = input
    alert.window.initialFirstResponder = input
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    return await run(alert) == .alertFirstButtonReturn ? .ok(input.stringValue) : .cancel
  }

  func handleFileInputPrompt(parameters: WKOpenPanelParameters, initiatedBy frame: WebPage.FrameInfo) async -> WebPage.FileInputPromptResult {
    let panel = NSOpenPanel()
    panel.canChooseFiles = true
    panel.canChooseDirectories = parameters.allowsDirectories
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canCreateDirectories = false
    let response: NSApplication.ModalResponse
    if let window {
      response = await withCheckedContinuation { continuation in
        panel.beginSheetModal(for: window) { continuation.resume(returning: $0) }
      }
    } else {
      response = panel.runModal()
    }
    return response == .OK ? .selected(panel.urls) : .cancel
  }
}
