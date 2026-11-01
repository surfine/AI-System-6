import AVFoundation
import CoreMedia
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

func jsonTime(_ value: TimeInterval) -> Double {
    return (value * 1000).rounded() / 1000
}

func cleanedTranscriptText(_ value: AttributedString) -> String {
    return String(value.characters)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func writeJson(_ value: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value, options: []) else {
        fail("Could not serialize SpeechTranscriber output.", code: 70)
    }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

@available(macOS 26.0, *)
func transcribeWithSpeechAnalyzer(inputPath: String, localeIdentifier: String) async throws -> [String: Any] {
    guard SpeechTranscriber.isAvailable else {
        fail("SpeechTranscriber is not available on this device.", code: 69)
    }

    let requestedLocale = Locale(identifier: localeIdentifier)
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requestedLocale) else {
        let supported = await SpeechTranscriber.supportedLocales
        let sample = supported.map(\.identifier).sorted().prefix(20).joined(separator: ", ")
        fail("Locale \(localeIdentifier) is not supported by SpeechTranscriber. Supported examples: \(sample)", code: 69)
    }

    let transcriber = SpeechTranscriber(
        locale: locale,
        transcriptionOptions: [],
        reportingOptions: [],
        attributeOptions: [.audioTimeRange]
    )
    let modules: [any SpeechModule] = [transcriber]

    for reservedLocale in await AssetInventory.reservedLocales {
        await AssetInventory.release(reservedLocale: reservedLocale)
    }
    try await AssetInventory.reserve(locale: locale)
    let installedLocales = await SpeechTranscriber.installedLocales
    if !installedLocales.contains(where: { $0.identifier(.bcp47) == locale.identifier(.bcp47) }) {
        if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
            try await request.downloadAndInstall()
        }
    }

    let analyzer = SpeechAnalyzer(modules: modules)
    let audioFile = try AVAudioFile(forReading: URL(fileURLWithPath: inputPath))
    try await analyzer.start(inputAudioFile: audioFile, finishAfterFile: true)

    var fullText = ""
    var segments: [[String: Any]] = []
    var index = 1
    for try await result in transcriber.results {
        let text = cleanedTranscriptText(result.text)
        if text.isEmpty {
            continue
        }
        fullText += text
        segments.append([
            "id": index,
            "start": jsonTime(result.range.start.seconds),
            "end": jsonTime(result.range.end.seconds),
            "text": text,
        ])
        index += 1
    }

    return [
        "provider": "macos-speech-analyzer",
        "language": locale.identifier(.bcp47),
        "text": fullText,
        "segments": segments,
    ]
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    fail("Usage: transcribe-audio-macos26.swift <audio-path> [locale]", code: 64)
}

let inputPath = args[1]
let localeIdentifier = args.count >= 3 && !args[2].isEmpty ? args[2] : "zh-CN"
guard FileManager.default.fileExists(atPath: inputPath) else {
    fail("Audio file does not exist: \(inputPath)", code: 66)
}

guard #available(macOS 26.0, *) else {
    fail("SpeechAnalyzer and SpeechTranscriber require macOS 26.0 or later.", code: 69)
}

do {
    writeJson(try await transcribeWithSpeechAnalyzer(inputPath: inputPath, localeIdentifier: localeIdentifier))
} catch {
    fail("SpeechAnalyzer transcription failed: \(error.localizedDescription)", code: 70)
}
