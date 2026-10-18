import ClioModelKit
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

// Apple's on-device language model (FoundationModels) and MLX models as a helper.
// The Node server keeps one `serve` process (Serve.swift: NDJSON with request ids,
// cancellation by message, idle and memory-pressure unload). The one-shot commands below
// stay for tools and tests: one process per request, JSON lines.
//
//   AISystem6Intelligence serve         long-lived, see Serve.swift
//   AISystem6Intelligence status        one JSON object on stdout, exit 0
//   AISystem6Intelligence chat          one JSON request on stdin, NDJSON on stdout
//                                       ("engine":"mlx" + "model":id selects an MLX model;
//                                        absent engine keeps FoundationModels)
//   AISystem6Intelligence mlx-catalog | mlx-status | mlx-download <id> --consent <bytes>
//                                       see MLXCommands.swift
//
// status -> {"available":bool,"reason":str|null,"contextSize":int|null,
//            "contextSizeSource":str,"variant":str|null,"useCase":str|null,
//            "os":str,"locales":{"zh-Hans":bool|null,"zh-Hant":..,"en":..}}
// chat request -> {"instructions":str?,"prompt":str,
//            "options":{"temperature":num?,"maxTokens":int?,
//                       "permissiveContentTransformations":bool?}}
// chat events  -> {"type":"snapshot","text":<cumulative text>}
//                 then {"type":"done"} or {"type":"error","code":..,"message":..}
// SIGTERM / SIGINT cancel generation and exit 143 / 130 without a done line.
// Nothing is rewritten, summarised or retried here; guardrail violations are
// reported once and never retried.

func writeLine(_ object: [String: Any]) {
  guard JSONSerialization.isValidJSONObject(object),
        var data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  else { return }
  data.append(0x0A)
  FileHandle.standardOutput.write(data)
}

func osString() -> String {
  let v = ProcessInfo.processInfo.operatingSystemVersion
  return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
}

func unavailableStatus(_ reason: String) -> [String: Any] {
  ["available": false, "reason": reason, "os": osString()]
}

/// FoundationModels availability, the same object `status` prints.
func foundationStatus() -> [String: Any] {
  #if canImport(FoundationModels)
  if #available(macOS 26.0, *) { return statusObject() }
  return unavailableStatus("osTooOld")
  #else
  return unavailableStatus("frameworkMissingAtBuild")
  #endif
}

/// One-shot `chat` writes untagged lines; `serve` tags each with the request id.
typealias Emit = @Sendable ([String: Any]) -> Void
let emitLine: Emit = { writeLine($0) }

/// FoundationModels chat, or the plain "needs macOS 26" error.
func runFoundationChat(_ request: [String: Any], emit: Emit) async -> Int32 {
  #if canImport(FoundationModels)
  if #available(macOS 26.0, *) {
    return await runChat(request, emit: emit)
  }
  #endif
  emit(["type": "error", "code": "unavailable", "reason": "osTooOld",
        "message": "Apple on-device model needs macOS 26 or later."])
  return 3
}

#if canImport(FoundationModels)

@available(macOS 26.0, *)
func reasonName(_ r: SystemLanguageModel.Availability.UnavailableReason) -> String {
  switch r {
  case .deviceNotEligible: return "deviceNotEligible"
  case .appleIntelligenceNotEnabled: return "appleIntelligenceNotEnabled"
  case .modelNotReady: return "modelNotReady"
  @unknown default: return "other"
  }
}

@available(macOS 26.0, *)
func modelAvailability(_ model: SystemLanguageModel) -> (Bool, String?) {
  switch model.availability {
  case .available: return (true, nil)
  case .unavailable(let r): return (false, reasonName(r))
  @unknown default: return (false, "other")
  }
}

@available(macOS 26.0, *)
func statusObject() -> [String: Any] {
  let model = SystemLanguageModel.default
  let (ok, reason) = modelAvailability(model)
  var out: [String: Any] = ["available": ok, "os": osString()]
  out["reason"] = reason ?? NSNull()
  // contextSize is only read from the system on macOS 27+; before that the
  // SDK property is a constant 4096 default, so report null instead.
  if #available(macOS 27.0, *) {
    // The system reports 0 while the model is not ready; that is not a size.
    let size = model.contextSize
    out["contextSize"] = size > 0 ? size as Any : NSNull()
    out["contextSizeSource"] = size > 0 ? "system" : "not-ready"
    out["variant"] = String(describing: model.variant)
  } else {
    out["contextSize"] = NSNull()
    out["contextSizeSource"] = "unavailable-before-macos-27"
    out["variant"] = NSNull()
  }
  out["useCase"] = "general"
  var locales: [String: Any] = [:]
  for id in ["zh-Hans", "zh-Hant", "en"] { locales[id] = model.supportsLocale(Locale(identifier: id)) }
  out["locales"] = locales
  return out
}

@available(macOS 26.0, *)
func classify(_ error: Error) -> (String, String) {
  let message = error.localizedDescription
  if #available(macOS 27.0, *), let e = error as? LanguageModelError {
    switch e {
    case .contextSizeExceeded: return ("exceededContextWindowSize", message)
    case .rateLimited: return ("rateLimited", message)
    case .guardrailViolation: return ("guardrailViolation", message)
    case .refusal: return ("refusal", message)
    case .unsupportedLanguageOrLocale: return ("unsupportedLanguageOrLocale", message)
    case .timeout: return ("timeout", message)
    default: return ("other", message)
    }
  }
  if let e = error as? LanguageModelSession.GenerationError {
    switch e {
    case .exceededContextWindowSize: return ("exceededContextWindowSize", message)
    case .assetsUnavailable: return ("unavailable", message)
    case .guardrailViolation: return ("guardrailViolation", message)
    case .unsupportedLanguageOrLocale: return ("unsupportedLanguageOrLocale", message)
    case .rateLimited: return ("rateLimited", message)
    case .concurrentRequests: return ("concurrentRequests", message)
    case .refusal: return ("refusal", message)
    default: return ("other", message)
    }
  }
  return ("other", message)
}

@available(macOS 26.0, *)
func runChat(_ request: [String: Any], emit writeLine: Emit) async -> Int32 {
  let options = request["options"] as? [String: Any] ?? [:]
  let permissive = options["permissiveContentTransformations"] as? Bool == true
  let model = permissive
    ? SystemLanguageModel(guardrails: .permissiveContentTransformations)
    : SystemLanguageModel.default
  let (ok, reason) = modelAvailability(model)
  if !ok {
    writeLine(["type": "error", "code": "unavailable", "reason": reason ?? "other",
               "message": "Apple on-device model is not available (\(reason ?? "other"))."])
    return 3
  }
  guard let prompt = request["prompt"] as? String, !prompt.isEmpty else {
    writeLine(["type": "error", "code": "badRequest", "message": "prompt is required"])
    return 2
  }
  var generation = GenerationOptions()
  if let t = options["temperature"] as? Double { generation.temperature = t }
  if let n = options["maxTokens"] as? Int, n > 0 { generation.maximumResponseTokens = n }
  let instructions = request["instructions"] as? String
  let session = LanguageModelSession(
    model: model,
    instructions: (instructions?.isEmpty ?? true) ? nil : instructions
  )
  do {
    for try await snapshot in session.streamResponse(to: prompt, options: generation) {
      try Task.checkCancellation()
      writeLine(["type": "snapshot", "text": snapshot.content])
    }
    writeLine(["type": "done"])
    return 0
  } catch is CancellationError {
    return 143
  } catch {
    let (code, message) = classify(error)
    writeLine(["type": "error", "code": code, "message": message])
    return 1
  }
}

#endif

// Cancel the running task on SIGTERM/SIGINT and exit promptly even if the
// framework is slow to unwind.
nonisolated(unsafe) var signalSources: [DispatchSourceSignal] = []
nonisolated(unsafe) var currentTask: Task<Int32, Never>?

func installSignalHandlers() {
  for (sig, code) in [(SIGTERM, Int32(143)), (SIGINT, Int32(130))] {
    signal(sig, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .global())
    source.setEventHandler {
      currentTask?.cancel()
      // Give the cancelled stream a moment to unwind, then leave regardless.
      DispatchQueue.global().asyncAfter(deadline: .now() + 0.3) { _exit(code) }
    }
    source.resume()
    signalSources.append(source)
  }
}

let commandArguments = Array(CommandLine.arguments.dropFirst())
let command = commandArguments.first ?? "status"
installSignalHandlers()

let task = Task { () -> Int32 in
  switch command {
  case "status":
    writeLine(foundationStatus())
    return 0
  case "serve":
    return await runServe()
  case "chat":
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard let request = (try? JSONSerialization.jsonObject(with: input)) as? [String: Any] else {
      writeLine(["type": "error", "code": "badRequest", "message": "stdin must be one JSON object"])
      return 2
    }
    if (request["engine"] as? String) == "mlx" {
      return await runMLXChat(
        request, runtime: MLXRuntime(tuning: .fromEnvironment()), emit: emitLine, deltas: false)
    }
    return await runFoundationChat(request, emit: emitLine)
  case "mlx-catalog":
    writeLine(mlxCatalogObject())
    return 0
  case "mlx-status":
    writeLine(mlxStatusObject())
    return 0
  case "mlx-download":
    return await runMLXDownload(Array(commandArguments.dropFirst()))
  default:
    writeLine(["type": "error", "code": "badRequest", "message": "unknown command \(command)"])
    return 2
  }
}
currentTask = task
let exitCode = await task.value
// After a cancel the Metal queue may still be draining: exit() would run C++ static
// destructors under it and crashed with SIGSEGV (139) in testing. Output is unbuffered
// (FileHandle writes), so _exit loses nothing.
if exitCode == 143 || exitCode == 130 { _exit(exitCode) }
exit(exitCode)
