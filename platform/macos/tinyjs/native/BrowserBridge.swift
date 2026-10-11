import AppKit
import WebKit

// Reuse the existing Time Machine engine as a native helper. The retired
// Swift shell entrypoint is neither compiled nor shipped.
private var retainedBrowser: AnyObject?

func shellLog(_ message: String) {
  // No material contents, addresses or credentials in native diagnostics.
  NSLog("AI System 6 browser: %@", message)
}

@_cdecl("AISystem6InstallBrowser")
@MainActor
func installBrowser(
  _ webViewPointer: UnsafeMutableRawPointer?,
  _ hostPointer: UnsafeMutableRawPointer?,
  _ windowPointer: UnsafeMutableRawPointer?,
  _ extensionPath: UnsafePointer<CChar>?
) {
  guard #available(macOS 26.0, *), retainedBrowser == nil,
        let webViewPointer, let hostPointer, let windowPointer else { return }
  let webView = Unmanaged<WKWebView>.fromOpaque(webViewPointer).takeUnretainedValue()
  let host = Unmanaged<NSView>.fromOpaque(hostPointer).takeUnretainedValue()
  let window = Unmanaged<NSWindow>.fromOpaque(windowPointer).takeUnretainedValue()
  let extensionURL = extensionPath.map { URL(fileURLWithPath: String(cString: $0)) }
  retainedBrowser = TimeMachineBrowser(
    deskWebView: webView, hostView: host, window: window, extensionURL: extensionURL,
    isDeskURL: { url in
      url.scheme == "http" && url.host == "127.0.0.1" && url.port == 4173
    }
  )
}
