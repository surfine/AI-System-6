import AppKit
import WebKit
import Darwin

// Native browse downloads use the browse store's cookies, never the writing
// desk's credentials. Only a native navigation decision starts a download.
@MainActor
final class NativeDownloads {
  static let shared = NativeDownloads()
  private var tasks: [String: Task<Void, Never>] = [:]
  private var completed: [String: URL] = [:]
  var hasActiveDownloads: Bool { !tasks.isEmpty }
  private let storeID = UUID(uuidString: "6A1D5E2C-7F3B-4C1A-9E8D-2B6F0C4A9D11")!

  func start(_ url: URL, emit: @escaping ([String: Any]) -> Void) {
    guard ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
          url.user == nil, url.password == nil, tasks.count < 4 else { return }
    let id = UUID().uuidString
    emit(["id": id, "state": "started", "filename": url.lastPathComponent])
    tasks[id] = Task { @MainActor in
      var ownedDestination: URL?
      let configuration = URLSessionConfiguration.ephemeral
      configuration.httpCookieStorage = nil
      configuration.timeoutIntervalForRequest = 60
      configuration.timeoutIntervalForResource = 300
      let session = URLSession(configuration: configuration)
      defer { session.invalidateAndCancel(); tasks.removeValue(forKey: id) }
      do {
        var request = URLRequest(url: url)
        let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
          WKWebsiteDataStore(forIdentifier: storeID).httpCookieStore.getAllCookies {
            continuation.resume(returning: $0)
          }
        }
        let host = url.host?.lowercased() ?? ""
        let selected = cookies.filter { cookie in
          let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
          let domainMatch = host == domain || (cookie.domain.hasPrefix(".") && host.hasSuffix("." + domain))
          let route = url.path.isEmpty ? "/" : url.path
          let cookiePath = cookie.path
          let pathMatch = route == cookiePath || (route.hasPrefix(cookiePath) &&
            (cookiePath.hasSuffix("/") || route.dropFirst(cookiePath.count).hasPrefix("/")))
          return domainMatch && pathMatch && (!cookie.isSecure || url.scheme == "https")
            && (cookie.expiresDate == nil || cookie.expiresDate! > Date())
        }
        request.allHTTPHeaderFields = HTTPCookie.requestHeaderFields(with: selected)
        let limiter = DownloadLimit(cookies: cookies)
        let (temporary, response) = try await session.download(for: request, delegate: limiter)
        defer { try? FileManager.default.removeItem(at: temporary) }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
          throw URLError(.badServerResponse)
        }
        try Task.checkCancellation()
        let proposed = response.suggestedFilename ?? url.lastPathComponent
        let destination = try Self.copyWithoutReplacing(temporary, filename: proposed)
        ownedDestination = destination
        try Task.checkCancellation()
        completed[id] = destination
        if completed.count > 40, let first = completed.keys.first { completed.removeValue(forKey: first) }
        emit(["id": id, "state": "done", "filename": destination.lastPathComponent])
      } catch {
        if let ownedDestination { try? FileManager.default.removeItem(at: ownedDestination) }
        let cancelled = Task.isCancelled && !DownloadLimit.isSizeError(error)
        emit(["id": id, "state": cancelled ? "cancelled" : "failed"])
      }
    }
  }

  func cancel(_ id: String) -> Bool {
    guard let task = tasks[id] else { return false }
    task.cancel(); return true
  }
  func reveal(_ id: String) -> Bool {
    guard let url = completed[id], FileManager.default.fileExists(atPath: url.path) else { return false }
    NSWorkspace.shared.activateFileViewerSelecting([url]); return true
  }

  static func copyWithoutReplacing(_ source: URL, filename: String, directory: URL? = nil) throws -> URL {
    let folder = directory ?? FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
    let leaf = (filename as NSString).lastPathComponent
      .components(separatedBy: .controlCharacters).joined().prefix(180)
    let safe = leaf.isEmpty || leaf == "." || leaf == ".." ? "Download" : String(leaf)
    let ext = (safe as NSString).pathExtension
    let stem = (safe as NSString).deletingPathExtension
    for index in 0..<1000 {
      let name = index == 0 ? safe : stem + " (\(index))" + (ext.isEmpty ? "" : "." + ext)
      let destination = folder.appendingPathComponent(name)
      let fd = Darwin.open(destination.path, O_CREAT | O_EXCL | O_WRONLY, 0o600)
      if fd < 0 { if errno == EEXIST { continue }; throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
      let output = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
      do {
        let input = try FileHandle(forReadingFrom: source)
        defer { try? input.close() }
        var total = 0
        while let chunk = try input.read(upToCount: 65536), !chunk.isEmpty {
          total += chunk.count
          if total > 1024 * 1024 * 1024 { throw URLError(.dataLengthExceedsMaximum) }
          try output.write(contentsOf: chunk)
        }
        try output.synchronize(); try output.close()
        return destination
      } catch {
        try? output.close(); try? FileManager.default.removeItem(at: destination); throw error
      }
    }
    throw CocoaError(.fileWriteFileExists)
  }
}

private final class DownloadLimit: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
  private let cookies: [HTTPCookie]
  private var redirects = 0
  init(cookies: [HTTPCookie]) { self.cookies = cookies }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    redirects += 1
    guard redirects <= 5, let url = request.url, ["http", "https"].contains(url.scheme ?? ""),
          url.user == nil, url.password == nil,
          !(response.url?.scheme == "https" && url.scheme != "https") else { completionHandler(nil); return }
    var clean = request
    clean.setValue(nil, forHTTPHeaderField: "Cookie")
    clean.setValue(nil, forHTTPHeaderField: "Authorization")
    let host = url.host?.lowercased() ?? ""
    let selected = cookies.filter { cookie in
      let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
      let domainMatch = host == domain || (cookie.domain.hasPrefix(".") && host.hasSuffix("." + domain))
      let route = url.path.isEmpty ? "/" : url.path
      let pathMatch = route == cookie.path || (route.hasPrefix(cookie.path) &&
        (cookie.path.hasSuffix("/") || route.dropFirst(cookie.path.count).hasPrefix("/")))
      return domainMatch && pathMatch && (!cookie.isSecure || url.scheme == "https")
        && (cookie.expiresDate == nil || cookie.expiresDate! > Date())
    }
    for (key, value) in HTTPCookie.requestHeaderFields(with: selected) { clean.setValue(value, forHTTPHeaderField: key) }
    completionHandler(clean)
  }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                  didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    if max(totalBytesWritten, totalBytesExpectedToWrite) > 1024 * 1024 * 1024 { downloadTask.cancel() }
  }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
  // Cancellation caused by a bounded download is reported as failure, unless
  // the user explicitly cancelled the structured task.
  static func isSizeError(_ error: Error) -> Bool { (error as? URLError)?.code == .dataLengthExceedsMaximum }
}
