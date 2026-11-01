import ClioModelKit
import Foundation

// MLX engine for the helper (ClioModelKit). Same NDJSON vocabulary as the FoundationModels
// path: snapshot (cumulative text) / done / error, SIGTERM cancels and exits 143.
//
//   mlx-catalog                       one JSON object: curated packs, install state, memory gate
//   mlx-status                        one JSON object: is any pack ready to run
//   mlx-download <id> --consent <n>   NDJSON {"type":"progress",...} then {"type":"done"} / error;
//                                     <n> must equal the pack's totalBytes (the size the writer saw)
//   chat  {"engine":"mlx","model":id,"instructions"?,"prompt","options"?,"images"?:[path]}
//                                     snapshots (one-shot) or deltas (serve), then
//                                     {"type":"done","model":id,"usage":{...}}
//         options: temperature, maxTokens, topP, topK, seed. images: local image files; a request
//         with images loads the pack's vision tower on demand.

func packObject(_ pack: ModelPack, store: ModelStore) -> [String: Any] {
  var o: [String: Any] = [
    "id": pack.id, "repo": pack.repo, "revision": pack.revision,
    "displayName": pack.displayName, "license": pack.license, "licenseURL": pack.licenseURL,
    "totalBytes": pack.totalBytes, "estimatedResidentBytes": pack.estimatedResidentBytes,
    "contextTokens": pack.contextTokens, "languages": pack.languages,
    "hasVision": pack.hasVision, "drafter": pack.drafterID ?? NSNull(),
  ]
  switch store.state(of: pack) {
  case .installed: o["state"] = "installed"
  case .partial(let n):
    o["state"] = "partial"
    o["bytesOnDisk"] = n
  case .notInstalled: o["state"] = "notInstalled"
  }
  let gate = MemoryGate.evaluate(pack)
  o["memoryGate"] = ["allowed": gate.allowed, "limitBytes": gate.limitBytes]
  return o
}

func mlxArchitectureReason() -> String? {
  #if arch(arm64)
  return nil
  #else
  return "notAppleSilicon"
  #endif
}

func mlxCatalogObject() -> [String: Any] {
  let store = ModelStore.standard()
  return [
    "packs": ModelCatalog.curated.map { packObject($0, store: store) },
    "drafters": ModelCatalog.drafters.map { packObject($0, store: store) },
    "physicalMemoryBytes": ProcessInfo.processInfo.physicalMemory,
    "root": store.root.path,
    "lastGood": store.lastGoodPackID() ?? NSNull(),
  ]
}

func mlxStatusObject() -> [String: Any] {
  let store = ModelStore.standard()
  let installed = ModelCatalog.curated.filter { store.state(of: $0) == .installed }
  let runnable = installed.filter { MemoryGate.evaluate($0).allowed }
  var o: [String: Any] = [
    "engine": "mlx", "os": osString(),
    "installed": installed.map(\.id), "runnable": runnable.map(\.id),
    "vision": runnable.filter(\.hasVision).map(\.id),
    "contextTokens": Dictionary(uniqueKeysWithValues: installed.map { ($0.id, $0.contextTokens) }),
    "drafters": ModelCatalog.drafters.filter { store.state(of: $0) == .installed }.map(\.id),
    "lastGood": store.lastGoodPackID() ?? NSNull(),
  ]
  var reason: String?
  if let r = mlxArchitectureReason() { reason = r }
  else if installed.isEmpty { reason = "noModelDownloaded" }
  else if runnable.isEmpty { reason = "memoryGate" }
  o["available"] = reason == nil
  o["reason"] = reason ?? NSNull()
  return o
}

func runMLXDownload(_ args: [String]) async -> Int32 {
  guard let id = args.first, let pack = ModelCatalog.pack(id: id) else {
    writeLine(["type": "error", "code": "badRequest", "message": "unknown model id"])
    return 2
  }
  var consentBytes: Int64?
  if let i = args.firstIndex(of: "--consent"), args.indices.contains(i + 1) {
    consentBytes = Int64(args[i + 1])
  }
  guard let bytes = consentBytes,
    let consent = DownloadConsent.granting(pack: pack, acknowledgedBytes: bytes)
  else {
    writeLine([
      "type": "error", "code": "consentRequired",
      "message": "Pass --consent \(pack.totalBytes) after showing the writer that size.",
      "totalBytes": pack.totalBytes,
    ])
    return 2
  }
  let decision = MemoryGate.evaluate(pack)
  guard decision.allowed else {
    writeLine(["type": "error", "code": "memoryGate", "message": decision.reason ?? ""])
    return 3
  }
  do {
    let url = try await ModelDownloader(store: .standard()).download(pack, consent: consent) { p in
      writeLine([
        "type": "progress", "bytesDone": p.bytesDone, "totalBytes": p.totalBytes,
        "file": p.currentFile,
      ])
    }
    writeLine(["type": "done", "id": pack.id, "path": url.path])
    return 0
  } catch is CancellationError {
    return 143
  } catch {
    writeLine(["type": "error", "code": "downloadFailed", "message": error.localizedDescription])
    return 1
  }
}

func runMLXChat(
  _ request: [String: Any], runtime: MLXRuntime, emit writeLine: Emit, deltas: Bool
) async -> Int32 {
  guard mlxArchitectureReason() == nil else {
    writeLine(["type": "error", "code": "unavailable", "reason": "notAppleSilicon",
               "message": "MLX needs Apple silicon."])
    return 3
  }
  let prompt = request["prompt"] as? String ?? ""
  guard !prompt.isEmpty || !((request["messages"] as? [[String: Any]]) ?? []).isEmpty else {
    writeLine(["type": "error", "code": "badRequest", "message": "prompt or messages is required"])
    return 2
  }
  let store = ModelStore.standard()
  var requested: ModelPack?
  if let id = request["model"] as? String {
    guard let pack = ModelCatalog.curated.first(where: { $0.id == id }) else {
      writeLine(["type": "error", "code": "badRequest", "message": "unknown model id"])
      return 2
    }
    requested = pack
  } else if let id = store.lastGoodPackID() {
    requested = ModelCatalog.pack(id: id)
  }
  guard let requested else {
    writeLine(["type": "error", "code": "unavailable", "reason": "noModelDownloaded",
               "message": "No MLX model is downloaded."])
    return 3
  }
  let resolution = store.resolve(requested: requested)
  guard let pack = resolution.pack else {
    let gate = MemoryGate.evaluate(requested)
    if store.state(of: requested) == .installed, !gate.allowed {
      writeLine(["type": "error", "code": "memoryGate", "message": gate.reason ?? ""])
    } else {
      writeLine(["type": "error", "code": "unavailable", "reason": "notDownloaded",
                 "message": "Model \(requested.id) is not downloaded."])
    }
    return 3
  }

  let options = request["options"] as? [String: Any] ?? [:]
  var messages: [Message] = []
  if let turns = request["messages"] as? [[String: Any]], !turns.isEmpty {
    // General chat: the conversation as the page sent it (system first, then turns).
    for turn in turns {
      guard let content = turn["content"] as? String else { continue }
      switch turn["role"] as? String {
      case "system": messages.append(Message(role: .system, content: content))
      case "assistant": messages.append(Message(role: .assistant, content: content))
      default: messages.append(Message(role: .user, content: content))
      }
    }
  } else {
    if let instructions = request["instructions"] as? String, !instructions.isEmpty {
      messages.append(Message(role: .system, content: instructions))
    }
    messages.append(Message(role: .user, content: prompt))
  }
  let images = (request["images"] as? [String] ?? []).map { URL(fileURLWithPath: $0) }
  if !images.isEmpty, !pack.hasVision {
    writeLine(["type": "error", "code": "unavailable", "reason": "noVision",
               "message": "Model \(pack.id) cannot read images."])
    return 3
  }
  let modelRequest = ModelRequest(
    messages: messages,
    temperature: (options["temperature"] as? Double).map { Float($0) },
    maxTokens: (options["maxTokens"] as? Int).flatMap { $0 > 0 ? $0 : nil },
    topP: (options["topP"] as? Double).map { Float($0) },
    seed: (options["seed"] as? Int).map { UInt64(truncatingIfNeeded: $0) },
    images: images,
    topK: (options["topK"] as? Int).flatMap { $0 > 0 ? $0 : nil })

  let started = Date()
  var firstDelta: Double?
  var text = ""
  var usage: Usage?
  var reason = FinishReason.stop
  do {
    for try await event in await runtime.generate(pack: pack, request: modelRequest) {
      try Task.checkCancellation()
      switch event {
      case .delta(let d):
        if firstDelta == nil { firstDelta = Date().timeIntervalSince(started) }
        text += d
        if deltas { writeLine(["type": "delta", "text": d]) } else { writeLine(["type": "snapshot", "text": text]) }
      case .usage(let u): usage = u
      case .finished(let r): reason = r
      }
    }
    // A cancelled task ends the stream quietly instead of throwing; never report that as done.
    if Task.isCancelled || reason == .cancelled { return 143 }
    var done: [String: Any] = ["type": "done", "model": pack.id, "finish": "\(reason)"]
    if let from = resolution.fellBackFrom { done["fellBackFrom"] = from.id }
    if let u = usage {
      done["usage"] = [
        "promptTokens": u.promptTokens, "completionTokens": u.completionTokens,
        "tokensPerSecond": (u.tokensPerSecond * 10).rounded() / 10,
        "promptSeconds": u.promptSeconds, "generateSeconds": u.generateSeconds,
        "cachedPromptTokens": u.cachedPromptTokens, "decoder": u.decoder,
      ]
    }
    let snap = await runtime.snapshot()
    done["phases"] = [
      "firstDeltaSeconds": firstDelta.map { $0 as Any } ?? NSNull(),
      "totalSeconds": Date().timeIntervalSince(started),
      "lastLoadSeconds": snap.lastLoadSeconds.map { $0 as Any } ?? NSNull(),
    ] as [String: Any]
    done["memory"] = runtimeObject(snap)
    done["pid"] = Int(ProcessInfo.processInfo.processIdentifier)
    writeLine(done)
    return 0
  } catch is CancellationError {
    return 143
  } catch let error as RuntimeError {
    switch error {
    case .memoryGate: writeLine(["type": "error", "code": "memoryGate", "message": error.localizedDescription])
    case .notInstalled:
      writeLine(["type": "error", "code": "unavailable", "reason": "notDownloaded", "message": error.localizedDescription])
    case .contextExceeded:
      writeLine(["type": "error", "code": "exceededContextWindowSize", "message": error.localizedDescription])
    case .emptyRequest: writeLine(["type": "error", "code": "badRequest", "message": error.localizedDescription])
    case .noVision:
      writeLine(["type": "error", "code": "unavailable", "reason": "noVision", "message": error.localizedDescription])
    }
    return 1
  } catch {
    writeLine(["type": "error", "code": "other", "message": error.localizedDescription])
    return 1
  }
}
