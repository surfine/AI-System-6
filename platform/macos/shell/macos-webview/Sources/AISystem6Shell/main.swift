import AppKit
import Foundation
import WebKit

private struct ShellOptions {
  var url = URL(string: "http://127.0.0.1:4173")!
  var root: URL?
  var startsServer = true
}

private func parseOptions() -> ShellOptions {
  var options = ShellOptions()
  var args = Array(CommandLine.arguments.dropFirst())

  while !args.isEmpty {
    let arg = args.removeFirst()
    switch arg {
    case "--url":
      if let value = args.first, let url = URL(string: value) {
        options.url = url
        args.removeFirst()
      }
    case "--root":
      if let value = args.first {
        options.root = URL(fileURLWithPath: value, isDirectory: true)
        args.removeFirst()
      }
    case "--no-server":
      options.startsServer = false
    default:
      break
    }
  }

  return options
}

private func findRepoRoot(startingAt start: URL) -> URL? {
  var current = start.standardizedFileURL
  let fileManager = FileManager.default

  while true {
    let packagePath = current.appendingPathComponent("package.json").path
    if
      fileManager.fileExists(atPath: packagePath),
      let data = fileManager.contents(atPath: packagePath),
      let text = String(data: data, encoding: .utf8),
      text.contains("\"name\": \"ai-system-6\"")
    {
      return current
    }

    let parent = current.deletingLastPathComponent()
    if parent.path == current.path {
      return nil
    }
    current = parent
  }
}

private func resolveRepoRoot(options: ShellOptions) -> URL? {
  if let root = options.root {
    return root
  }

  if let envRoot = ProcessInfo.processInfo.environment["AI_SYSTEM6_ROOT"], !envRoot.isEmpty {
    let root = URL(fileURLWithPath: envRoot, isDirectory: true)
    if findRepoRoot(startingAt: root) != nil {
      return root
    }
  }

  let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
  if let root = findRepoRoot(startingAt: cwd) {
    return root
  }

  if let executable = Bundle.main.executableURL, let root = findRepoRoot(startingAt: executable) {
    return root
  }

  let bundleParent = Bundle.main.bundleURL.deletingLastPathComponent()
  if let root = findRepoRoot(startingAt: bundleParent) {
    return root
  }

  return nil
}

private func shellLog(_ message: String) {
  let logsDir = FileManager.default
    .homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Logs/AI System 6 Beta", isDirectory: true)
  try? FileManager.default.createDirectory(at: logsDir, withIntermediateDirectories: true)
  let logURL = logsDir.appendingPathComponent("shell.log")
  let line = "[\(Date())] \(message)\n"

  if !FileManager.default.fileExists(atPath: logURL.path) {
    FileManager.default.createFile(atPath: logURL.path, contents: nil)
  }
  if let handle = try? FileHandle(forWritingTo: logURL) {
    handle.seekToEndOfFile()
    handle.write(Data(line.utf8))
    try? handle.close()
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
  private var window: NSWindow!
  private var webView: WKWebView!
  private var statusLabel: NSTextField!
  private var serverProcess: Process?
  private let options = parseOptions()
  private var loadAttempts = 0
  /// A deep link (aisystem6://launch?route=…) received before the local
  /// desktop finished loading. Consumed by the first successful load.
  private var pendingDeepLink: URL?

  func applicationDidFinishLaunching(_ notification: Notification) {
    shellLog("applicationDidFinishLaunching args=\(CommandLine.arguments.joined(separator: " "))")
    NSApp.setActivationPolicy(.regular)
    buildMenu()
    buildWindow()

    if options.startsServer {
      startServerIfPossible()
    }

    loadLocalDesktopWhenReady()
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  func application(_ application: NSApplication, open urls: [URL]) {
    guard let url = urls.first, url.scheme?.lowercased() == "aisystem6" else { return }
    // Keep in sync with launch-intent.js route table and the /go redirectors.
    let allowedRoutes = [
      "endfield-terminal", "bonsai-city", "micropolis", "openttd", "doom",
      "time-machine", "liquid-cover",
    ]
    guard
      let incoming = URLComponents(url: url, resolvingAgainstBaseURL: false),
      let route = incoming.queryItems?.first(where: { $0.name == "route" })?.value?.lowercased(),
      allowedRoutes.contains(route)
    else { return }

    var target = URLComponents(url: options.url, resolvingAgainstBaseURL: false) ?? URLComponents()
    var items = [URLQueryItem(name: "launch", value: route)]
    if incoming.queryItems?.first(where: { $0.name == "mode" })?.value == "fullscreen" {
      items.append(URLQueryItem(name: "mode", value: "fullscreen"))
    }
    target.queryItems = items
    guard let launchURL = target.url else { return }

    NSApp.activate(ignoringOtherApps: true)
    window.makeKeyAndOrderFront(nil)
    window.orderFrontRegardless()

    if webView.url != nil && loadAttempts > 0 {
      webView.load(URLRequest(url: launchURL))
    } else {
      pendingDeepLink = launchURL
    }
  }

  func applicationWillTerminate(_ notification: Notification) {
    shellLog("applicationWillTerminate")
    serverProcess?.terminate()
  }

  private func buildWindow() {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()

    webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true

    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.center()
    window.title = "AI System 6"
    window.isReleasedWhenClosed = false
    window.collectionBehavior.insert(.moveToActiveSpace)
    // A desk you arranged should still be arranged tomorrow. Without this the
    // window returns to a centred 1180x780 on every launch, so coming back to
    // the work means setting the room up again first. AppKit restores the
    // saved frame over the one set above when there is one.
    window.setFrameAutosaveName("AISystem6ShellWindow")
    // 640x480 is where this desk's own furniture still fits — it is the size
    // OpenTTD's interface was drawn against, and below it the window is not
    // small, it is broken.
    window.minSize = NSSize(width: 640, height: 480)

    let container = NSView(frame: window.contentView?.bounds ?? .zero)
    container.autoresizingMask = [.width, .height]
    webView.frame = container.bounds
    webView.autoresizingMask = [.width, .height]

    statusLabel = NSTextField(labelWithString: "Starting AI System 6 Beta...")
    statusLabel.alignment = .center
    statusLabel.font = NSFont.monospacedSystemFont(ofSize: 14, weight: .regular)
    statusLabel.textColor = .labelColor
    statusLabel.frame = NSRect(x: 24, y: 24, width: container.bounds.width - 48, height: 24)
    statusLabel.autoresizingMask = [.width, .minYMargin]

    container.addSubview(webView)
    container.addSubview(statusLabel)
    window.contentView = container
    window.makeKeyAndOrderFront(nil)
    window.orderFrontRegardless()
    shellLog("window built frame=\(window.frame)")
  }

  private func buildMenu() {
    let menuBar = NSMenu()
    let appMenuItem = NSMenuItem()
    let appMenu = NSMenu()

    appMenu.addItem(
      withTitle: "About AI System 6 Shell",
      action: #selector(showAbout),
      keyEquivalent: ""
    )
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(
      withTitle: "Quit AI System 6 Shell",
      action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: "q"
    )
    appMenuItem.submenu = appMenu
    menuBar.addItem(appMenuItem)

    // Without these, a Mac cannot paste into this app at all. AppKit routes
    // Command-X/C/V/A to the first responder through menu key equivalents, so
    // a web view inside a shell that declares no Edit menu simply never
    // receives them — in a writing application. Nothing here is custom: the
    // standard selectors let the responder chain deliver to whatever is
    // focused, which is the web view's own editing.
    let editMenuItem = NSMenuItem()
    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
    redo.keyEquivalentModifierMask = [.command, .shift]
    editMenu.addItem(NSMenuItem.separator())
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    let pasteMatch = editMenu.addItem(
      withTitle: "Paste and Match Style",
      action: #selector(NSTextView.pasteAsPlainText(_:)),
      keyEquivalent: "v"
    )
    pasteMatch.keyEquivalentModifierMask = [.command, .option, .shift]
    editMenu.addItem(withTitle: "Delete", action: #selector(NSText.delete(_:)), keyEquivalent: "")
    editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editMenuItem.submenu = editMenu
    menuBar.addItem(editMenuItem)

    let viewMenuItem = NSMenuItem()
    let viewMenu = NSMenu(title: "View")
    viewMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
    viewMenu.addItem(withTitle: "Open Local Desktop", action: #selector(openLocalDesktop), keyEquivalent: "l")
    viewMenuItem.submenu = viewMenu
    menuBar.addItem(viewMenuItem)

    // Command-M and the window list are things every Mac window has; a shell
    // that omits them makes its window the one exception on the desk.
    let windowMenuItem = NSMenuItem()
    let windowMenu = NSMenu(title: "Window")
    windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
    windowMenuItem.submenu = windowMenu
    menuBar.addItem(windowMenuItem)
    NSApp.windowsMenu = windowMenu

    NSApp.mainMenu = menuBar
  }

  private func startServerIfPossible() {
    shellLog("startServerIfPossible startsServer=\(options.startsServer)")
    if startBundledServerIfPresent() {
      return
    }

    guard let root = resolveRepoRoot(options: options) else {
      showStartupAlert("Could not find the AI System 6 repo root. Start the server manually, or pass --root /path/to/repo.")
      return
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = ["-lc", "npm start"]
    process.currentDirectoryURL = root
    attachLogs(to: process, name: "npm-server")

    do {
      try process.run()
      serverProcess = process
      shellLog("started npm server root=\(root.path)")
    } catch {
      shellLog("failed npm server error=\(error.localizedDescription)")
      showStartupAlert("Could not start npm from the shell. Start AI System 6 manually with npm start.\n\n\(error.localizedDescription)")
    }
  }

  private func startBundledServerIfPresent() -> Bool {
    shellLog("resourceURL=\(Bundle.main.resourceURL?.path ?? "[nil]")")
    guard
      let resources = Bundle.main.resourceURL,
      let serverURL = bundledServerURL(in: resources)
    else {
      shellLog("no bundled server found")
      return false
    }

    let process = Process()
    process.executableURL = serverURL
    process.currentDirectoryURL = resources
    process.environment = serverEnvironment()
    attachLogs(to: process, name: "bundled-server")

    do {
      try process.run()
      serverProcess = process
      shellLog("started bundled server path=\(serverURL.path)")
      return true
    } catch {
      shellLog("failed bundled server error=\(error.localizedDescription)")
      showStartupAlert("Could not start the bundled AI System 6 server.\n\n\(error.localizedDescription)")
      return false
    }
  }

  private func bundledServerURL(in resources: URL) -> URL? {
    let candidates = [
      "ai-system-6-server",
      "ai-system-6-server-arm64",
      "ai-system-6-macos-arm64",
      "ai-system-6-macos",
    ]

    for name in candidates {
      let url = resources.appendingPathComponent(name)
      shellLog("checking bundled server candidate=\(url.path) exists=\(FileManager.default.fileExists(atPath: url.path)) executable=\(FileManager.default.isExecutableFile(atPath: url.path))")
      if FileManager.default.isExecutableFile(atPath: url.path) {
        return url
      }
    }
    return nil
  }

  private func serverEnvironment() -> [String: String] {
    var environment = ProcessInfo.processInfo.environment
    environment["PORT"] = environment["PORT"] ?? String(options.url.port ?? 4173)
    environment["AI_SYSTEM6_HOST"] = "127.0.0.1"
    environment["AI_SYSTEM6_SHELL"] = "macos"
    return environment
  }

  private func attachLogs(to process: Process, name: String) {
    let logsDir = FileManager.default
      .homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Logs/AI System 6 Beta", isDirectory: true)
    try? FileManager.default.createDirectory(at: logsDir, withIntermediateDirectories: true)

    let logURL = logsDir.appendingPathComponent("\(name).log")
    if !FileManager.default.fileExists(atPath: logURL.path) {
      FileManager.default.createFile(atPath: logURL.path, contents: nil)
    }

    do {
      let handle = try FileHandle(forWritingTo: logURL)
      handle.seekToEndOfFile()
      let stamp = "\n--- \(Date()) ---\n"
      handle.write(Data(stamp.utf8))
      process.standardOutput = handle
      process.standardError = handle
    } catch {
      process.standardOutput = Pipe()
      process.standardError = Pipe()
    }
  }

  private func loadLocalDesktopWhenReady() {
    loadAttempts += 1
    let launchURL = pendingDeepLink
    shellLog("load attempt \(loadAttempts) url=\(options.url.absoluteString) deepLink=\(launchURL?.absoluteString ?? "none")")
    window.title = loadAttempts <= 1 ? "AI System 6 — starting..." : "AI System 6 — waiting for server..."
    statusLabel?.stringValue = loadAttempts <= 1
      ? "Starting AI System 6 Beta..."
      : "Waiting for local desktop..."
    statusLabel?.isHidden = false
    window.makeKeyAndOrderFront(nil)
    window.orderFrontRegardless()
    NSApp.activate(ignoringOtherApps: true)

    let request = URLRequest(
      url: launchURL ?? options.url,
      cachePolicy: .reloadIgnoringLocalCacheData,
      timeoutInterval: 0.8
    )

    URLSession.shared.dataTask(with: request) { _, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      DispatchQueue.main.async {
        let errorMessage = error?.localizedDescription ?? "none"
        shellLog("probe status=\(status) attempt=\(self.loadAttempts) error=\(errorMessage)")
        if status > 0 {
          self.statusLabel?.stringValue = "Opening AI System 6..."
          self.webView.load(URLRequest(url: launchURL ?? self.options.url))
          self.pendingDeepLink = nil
          return
        }

        if self.loadAttempts >= 35 {
          self.statusLabel?.stringValue = "Could not reach the local server."
          self.showStartupAlert("The bundled server did not answer at \(self.options.url.absoluteString). See ~/Library/Logs/AI System 6 Beta for the connection error.")
          return
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
          self.loadLocalDesktopWhenReady()
        }
      }
    }.resume()
  }

  private func showStartupAlert(_ message: String) {
    let alert = NSAlert()
    alert.messageText = "AI System 6 Shell"
    alert.informativeText = message
    alert.alertStyle = .warning
    alert.addButton(withTitle: "Continue")
    alert.beginSheetModal(for: window)
  }

  @objc private func showAbout() {
    let alert = NSAlert()
    alert.messageText = "AI System 6 Shell"
    alert.informativeText = "AI System 6 running on this Mac. The desk is the web build, served locally by this app; nothing it holds leaves this machine unless you send it."
    alert.addButton(withTitle: "OK")
    alert.beginSheetModal(for: window)
  }

  @objc private func reload() {
    webView.reload()
  }

  @objc private func openLocalDesktop() {
    loadAttempts = 0
    loadLocalDesktopWhenReady()
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    window.title = webView.title?.isEmpty == false ? webView.title! : "AI System 6"
    statusLabel?.isHidden = true
  }

  // target="_blank" has no second window to open into, and WebKit answers a
  // nil web view by doing nothing at all — a link that looks live and is not.
  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = navigationAction.request.url, !isLocalDesktopURL(url) {
      NSWorkspace.shared.open(url)
    }
    return nil
  }

  func webView(
    _ webView: WKWebView,
    runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void
  ) {
    let panel = NSOpenPanel()
    panel.canChooseFiles = true
    panel.canChooseDirectories = parameters.allowsDirectories
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canCreateDirectories = false

    panel.beginSheetModal(for: window) { response in
      if response == .OK {
        completionHandler(panel.urls)
      } else {
        completionHandler(nil)
      }
    }
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor @Sendable () -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = "AI System 6"
    alert.informativeText = message
    alert.alertStyle = .warning
    alert.addButton(withTitle: "OK")
    alert.beginSheetModal(for: window) { _ in
      completionHandler()
    }
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor @Sendable (Bool) -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = "AI System 6"
    alert.informativeText = message
    alert.alertStyle = .warning
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    alert.beginSheetModal(for: window) { response in
      completionHandler(response == .alertFirstButtonReturn)
    }
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptTextInputPanelWithPrompt prompt: String,
    defaultText: String?,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor @Sendable (String?) -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = prompt
    alert.alertStyle = .informational
    let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
    input.stringValue = defaultText ?? ""
    alert.accessoryView = input
    alert.window.initialFirstResponder = input
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    alert.beginSheetModal(for: window) { response in
      completionHandler(response == .alertFirstButtonReturn ? input.stringValue : nil)
    }
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
  ) {
    if #available(macOS 11.3, *), navigationAction.shouldPerformDownload {
      decisionHandler(.download)
      return
    }
    // A link out of the desk used to navigate the desk away: the window went
    // to the web page and the only way home was the View menu. Anything the
    // visitor clicks that leaves the local server belongs to their browser,
    // which is also where they are already signed in. The desk stays put.
    if navigationAction.navigationType == .linkActivated,
       let url = navigationAction.request.url,
       !isLocalDesktopURL(url) {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }

  // The desk is whatever this shell is serving; everything else is the web.
  private func isLocalDesktopURL(_ url: URL) -> Bool {
    guard let host = url.host else { return true }
    return host == "127.0.0.1" || host == "localhost" || host == "::1"
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationResponse: WKNavigationResponse,
    decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void
  ) {
    if navigationResponse.canShowMIMEType {
      decisionHandler(.allow)
    } else if #available(macOS 11.3, *) {
      decisionHandler(.download)
    } else {
      decisionHandler(.cancel)
      showStartupAlert("This export needs macOS 11.3 or later. The rest of AI System 6 remains available on this Mac.")
    }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    guard loadAttempts < 35 else {
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
      self.loadLocalDesktopWhenReady()
    }
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    window.makeKeyAndOrderFront(nil)
    window.orderFrontRegardless()
    NSApp.activate(ignoringOtherApps: true)
    return true
  }
}

@available(macOS 11.3, *)
extension AppDelegate: WKDownloadDelegate {
  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
    download.delegate = self
  }

  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
    download.delegate = self
  }

  func download(
    _ download: WKDownload,
    decideDestinationUsing response: URLResponse,
    suggestedFilename: String,
    completionHandler: @escaping @MainActor @Sendable (URL?) -> Void
  ) {
    let panel = NSSavePanel()
    panel.canCreateDirectories = true
    panel.nameFieldStringValue = suggestedFilename

    panel.beginSheetModal(for: window) { result in
      guard result == .OK, let url = panel.url else {
        completionHandler(nil)
        return
      }
      // WKDownload refuses to write over an existing file; the save panel
      // already confirmed replacement with the user.
      try? FileManager.default.removeItem(at: url)
      completionHandler(url)
    }
  }

  func downloadDidFinish(_ download: WKDownload) {
    shellLog("download finished url=\(download.progress.fileURL?.path ?? "[unknown]")")
    if let url = download.progress.fileURL {
      NSWorkspace.shared.activateFileViewerSelecting([url])
    }
  }

  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    shellLog("download failed error=\(error.localizedDescription)")
    let alert = NSAlert()
    alert.messageText = "Export failed"
    alert.informativeText = error.localizedDescription
    alert.alertStyle = .warning
    alert.addButton(withTitle: "OK")
    alert.beginSheetModal(for: window)
  }
}

@main
struct ShellMain {
  @MainActor
  static func main() {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
  }
}
