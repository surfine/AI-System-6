import ClioModelKit
import Foundation

// `serve`: one long-lived helper the Node server multiplexes over stdio.
//
// stdin, one JSON object per line:
//   {"id":"r1","op":"chat","request":{...chat request, as for `chat`...}}
//   {"id":"r2","op":"cancel","target":"r1"}         stop r1 (it ends with an error line, code "cancelled")
//   {"id":"r3","op":"status"}                        FoundationModels + MLX + runtime state
//   {"id":"r4","op":"prewarm","model":"qwen3.5-4b-4bit"}
//   {"id":"r5","op":"unload"}
// stdout, one JSON object per line, every line carries the request id:
//   {"type":"ready","pid":..}                        once, at start (no id)
//   {"id":..,"type":"delta","text":..}               MLX: new text only
//   {"id":..,"type":"snapshot","text":..}            FoundationModels: cumulative text
//   {"id":..,"type":"done",...} | {"id":..,"type":"error","code":..,"message":..}
//   {"id":..,"type":"status",...} | {"id":..,"type":"ok",...}
//
// The process stays up; the weights do not. They are released after CLIO_IDLE_UNLOAD_SECONDS
// (default 900) without a request, and at once when the system reports memory pressure
// (a warning lets a running generation finish; critical stops it). EOF on stdin exits.

final class LineWriter: @unchecked Sendable {
  private let lock = NSLock()
  func write(_ object: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(object),
      var data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    else { return }
    data.append(0x0A)
    lock.lock()
    FileHandle.standardOutput.write(data)
    lock.unlock()
  }
}

actor ServeState {
  var tasks: [String: Task<Void, Never>] = [:]
  var running = 0
  var lastActivity = Date()
  var lastVision: Date?
  func usedVision() { lastVision = Date() }
  func visionIdleSeconds() -> Double? {
    guard running == 0, let lastVision else { return nil }
    return Date().timeIntervalSince(lastVision)
  }

  func add(_ id: String, _ task: Task<Void, Never>) { tasks[id] = task }
  func remove(_ id: String) { tasks[id] = nil }
  func cancel(_ id: String) -> Bool {
    guard let task = tasks[id] else { return false }
    task.cancel()
    return true
  }
  func begin() {
    running += 1
    lastActivity = Date()
  }
  func end() {
    running -= 1
    lastActivity = Date()
  }
  func idleSeconds() -> Double { running > 0 ? 0 : Date().timeIntervalSince(lastActivity) }
}

nonisolated(unsafe) var memoryPressureSource: DispatchSourceMemoryPressure?
nonisolated(unsafe) var idleTimer: DispatchSourceTimer?

func runServe() async -> Int32 {
  let out = LineWriter()
  let runtime = MLXRuntime(tuning: .fromEnvironment())
  let state = ServeState()
  let idleLimit = Double(ProcessInfo.processInfo.environment["CLIO_IDLE_UNLOAD_SECONDS"] ?? "")
    ?? 900
  // The vision model holds a second copy of the language weights (about 3 GB), so it goes
  // sooner: two minutes after the last image request.
  let visionIdleLimit = Double(ProcessInfo.processInfo.environment["CLIO_VISION_IDLE_UNLOAD_SECONDS"] ?? "")
    ?? 120

  let pressure = DispatchSource.makeMemoryPressureSource(eventMask: [.warning, .critical])
  pressure.setEventHandler {
    let critical = pressure.data.contains(.critical)
    Task {
      if critical { await runtime.unload() } else { await runtime.unloadAfterCurrent() }
      out.write(["type": "unloaded", "reason": critical ? "memoryCritical" : "memoryWarning"])
    }
  }
  pressure.resume()
  memoryPressureSource = pressure

  let timer = DispatchSource.makeTimerSource(queue: .global())
  let tick = max(1.0, min(30.0, min(idleLimit, visionIdleLimit) / 4))
  timer.schedule(deadline: .now() + tick, repeating: tick)
  timer.setEventHandler {
    Task {
      if let idle = await state.visionIdleSeconds(), idle >= visionIdleLimit, await runtime.snapshot().visionLoaded {
        await runtime.unloadVision()
        out.write(["type": "unloaded", "reason": "visionIdle"])
      }
      guard await state.idleSeconds() >= idleLimit, await runtime.loadedPackID != nil else { return }
      await runtime.unloadAfterCurrent()
      out.write(["type": "unloaded", "reason": "idle"])
    }
  }
  timer.resume()
  idleTimer = timer

  out.write(["type": "ready", "pid": Int(ProcessInfo.processInfo.processIdentifier)])

  do {
    for try await line in FileHandle.standardInput.bytes.lines {
      guard let data = line.data(using: .utf8),
        let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      else {
        out.write(["type": "error", "code": "badRequest", "message": "each line must be one JSON object"])
        continue
      }
      let id = message["id"] as? String ?? ""
      let op = message["op"] as? String ?? ""
      let emit: @Sendable ([String: Any]) -> Void = { event in
        var tagged = event
        tagged["id"] = id
        out.write(tagged)
      }
      switch op {
      case "chat":
        guard let request = message["request"] as? [String: Any] else {
          emit(["type": "error", "code": "badRequest", "message": "request is required"])
          continue
        }
        let box = RequestBox(request)
        let task = Task {
          await state.begin()
          if !((box.value["images"] as? [String]) ?? []).isEmpty { await state.usedVision() }
          let code: Int32
          if (box.value["engine"] as? String) == "mlx" {
            code = await runMLXChat(box.value, runtime: runtime, emit: emit, deltas: true)
          } else {
            code = await runFoundationChat(box.value, emit: emit)
          }
          if code == 143 {
            emit(["type": "error", "code": "cancelled", "message": "cancelled"])
          }
          await state.end()
          await state.remove(id)
        }
        await state.add(id, task)
      case "cancel":
        let target = message["target"] as? String ?? ""
        let found = await state.cancel(target)
        emit(["type": "ok", "cancelled": found])
      case "status":
        var status = foundationStatus()
        status["mlx"] = mlxStatusObject()
        status["runtime"] = runtimeObject(await runtime.snapshot())
        status["type"] = "status"
        emit(status)
      case "prewarm":
        let modelID = message["model"] as? String
        Task {
          await state.begin()
          guard let pack = (modelID.flatMap { ModelCatalog.pack(id: $0) }) ?? defaultMLXPack() else {
            emit(["type": "error", "code": "unavailable", "reason": "noModelDownloaded", "message": "no MLX model"])
            await state.end()
            return
          }
          do {
            let seconds = try await runtime.prewarm(pack: pack)
            emit(["type": "ok", "prewarmSeconds": seconds, "runtime": runtimeObject(await runtime.snapshot())])
          } catch {
            emit(["type": "error", "code": "other", "message": error.localizedDescription])
          }
          await state.end()
        }
      case "unload":
        await runtime.unload()
        emit(["type": "ok"])
      default:
        emit(["type": "error", "code": "badRequest", "message": "unknown op \(op)"])
      }
    }
  } catch {
    return 1
  }
  return 0
}

final class RequestBox: @unchecked Sendable {
  let value: [String: Any]
  init(_ value: [String: Any]) { self.value = value }
}

func runtimeObject(_ s: RuntimeSnapshot) -> [String: Any] {
  [
    "loaded": s.loadedPackID ?? NSNull(), "visionLoaded": s.visionLoaded,
    "drafterLoaded": s.drafterLoaded, "prefixEntries": s.prefixEntries,
    "activeMemory": s.activeMemoryBytes, "cacheMemory": s.cacheMemoryBytes,
    "peakMemory": s.peakMemoryBytes, "lastLoadSeconds": s.lastLoadSeconds.map { $0 as Any } ?? NSNull(),
    "lastLoadSkippedBytes": s.lastLoadSkippedBytes,
    "gpuArchitecture": s.gpuArchitecture, "neuralAcceleratorEligible": s.neuralAcceleratorEligible,
  ]
}

func defaultMLXPack() -> ModelPack? {
  let store = ModelStore.standard()
  if let id = store.lastGoodPackID(), let pack = ModelCatalog.curated.first(where: { $0.id == id }),
    store.state(of: pack) == .installed
  {
    return pack
  }
  return ModelCatalog.curated.first { store.state(of: $0) == .installed }
}
