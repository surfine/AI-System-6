import Foundation
import Speech

func writeStderr(_ value: String) {
    if let data = (value + "\n").data(using: .utf8) {
        FileHandle.standardError.write(data)
    }
}

func fail(_ value: String, code: Int32 = 1) -> Never {
    writeStderr(value)
    exit(code)
}

func authorizationLabel(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch status {
    case .authorized:
        return "authorized"
    case .denied:
        return "denied"
    case .restricted:
        return "restricted"
    case .notDetermined:
        return "notDetermined"
    @unknown default:
        return "unknown"
    }
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    fail("Usage: transcribe-audio-macos.swift <audio-path> [locale]", code: 64)
}

let inputPath = args[1]
let localeIdentifier = args.count >= 3 && !args[2].isEmpty ? args[2] : "zh-CN"
let inputUrl = URL(fileURLWithPath: inputPath)

guard FileManager.default.fileExists(atPath: inputPath) else {
    fail("Audio file does not exist: \(inputPath)", code: 66)
}

let authorization = SFSpeechRecognizer.authorizationStatus()
guard authorization == .authorized else {
    fail(
        "macOS Speech recognition permission is \(authorizationLabel(authorization)). Enable Speech Recognition for this host app, or set AI_SYSTEM6_TRANSCRIBE_COMMAND to a local Whisper/MLX transcriber.",
        code: 77
    )
}

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)) else {
    fail("macOS Speech recognizer is unavailable for locale \(localeIdentifier).", code: 69)
}

guard recognizer.isAvailable else {
    fail("macOS Speech recognizer is currently unavailable.", code: 69)
}

let request = SFSpeechURLRecognitionRequest(url: inputUrl)
request.shouldReportPartialResults = false
if #available(macOS 13.0, *) {
    request.addsPunctuation = true
}

let semaphore = DispatchSemaphore(value: 0)
var bestTranscript = ""
var bestTranscription: SFTranscription?
var finalError: Error?
var didFinish = false

let task = recognizer.recognitionTask(with: request) { result, error in
    if let result = result {
        let transcription = result.bestTranscription
        bestTranscript = transcription.formattedString
        bestTranscription = transcription
        if result.isFinal && !didFinish {
            didFinish = true
            semaphore.signal()
        }
    }
    if let error = error, !didFinish {
        finalError = error
        didFinish = true
        semaphore.signal()
    }
}

let timeoutSeconds = Int(ProcessInfo.processInfo.environment["AI_SYSTEM6_TRANSCRIBE_SWIFT_TIMEOUT_SECONDS"] ?? "600") ?? 600
if semaphore.wait(timeout: .now() + .seconds(timeoutSeconds)) == .timedOut {
    task.cancel()
    fail("macOS Speech transcription timed out after \(timeoutSeconds) seconds.", code: 75)
}

let transcript = bestTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
if transcript.isEmpty {
    if let finalError = finalError {
        fail("macOS Speech transcription failed: \(finalError.localizedDescription)", code: 70)
    }
    fail("macOS Speech returned no transcript text.", code: 70)
}

func isAsciiWordScalar(_ scalar: Unicode.Scalar) -> Bool {
    return (scalar.value >= 48 && scalar.value <= 57)
        || (scalar.value >= 65 && scalar.value <= 90)
        || (scalar.value >= 97 && scalar.value <= 122)
}

func shouldInsertSpace(_ left: String, _ right: String) -> Bool {
    guard let leftScalar = left.unicodeScalars.last,
          let rightScalar = right.unicodeScalars.first else {
        return false
    }
    return isAsciiWordScalar(leftScalar) && isAsciiWordScalar(rightScalar)
}

func appendToken(_ current: String, _ token: String) -> String {
    if current.isEmpty {
        return token
    }
    return shouldInsertSpace(current, token) ? "\(current) \(token)" : "\(current)\(token)"
}

func groupedSegments(from transcription: SFTranscription) -> [[String: Any]] {
    var output: [[String: Any]] = []
    var currentText = ""
    var currentStart: TimeInterval = 0
    var currentEnd: TimeInterval = 0

    func flushCurrent() {
        let text = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            output.append([
                "start": currentStart,
                "end": currentEnd,
                "text": text,
            ])
        }
        currentText = ""
        currentStart = 0
        currentEnd = 0
    }

    for segment in transcription.segments {
        let token = segment.substring.trimmingCharacters(in: .whitespacesAndNewlines)
        if token.isEmpty {
            continue
        }
        let start = segment.timestamp
        let end = segment.timestamp + segment.duration
        let gap = currentText.isEmpty ? 0 : start - currentEnd
        let sentenceEnded = currentText.hasSuffix("。")
            || currentText.hasSuffix("？")
            || currentText.hasSuffix("！")
            || currentText.hasSuffix(".")
            || currentText.hasSuffix("?")
            || currentText.hasSuffix("!")
        let shouldBreak = !currentText.isEmpty
            && (gap >= 0.9 || currentText.count >= 28 || (sentenceEnded && currentText.count >= 8))

        if shouldBreak {
            flushCurrent()
        }
        if currentText.isEmpty {
            currentStart = start
        }
        currentText = appendToken(currentText, token)
        currentEnd = end
    }

    flushCurrent()
    return output
}

if let bestTranscription = bestTranscription {
    let payload: [String: Any] = [
        "text": transcript,
        "segments": groupedSegments(from: bestTranscription),
    ]
    if JSONSerialization.isValidJSONObject(payload),
       let data = try? JSONSerialization.data(withJSONObject: payload, options: []) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
        exit(0)
    }
}

print(transcript)
