import Foundation
import Vision

// Reads the structure of a page image with macOS 26's document recognition
// (Vision's RecognizeDocumentsRequest): the title, paragraphs, lists and
// tables in reading order, not just lines of text. The Node server runs this
// as the first rung of its OCR ladder for images, scanned PDF pages and
// pictures inside documents (apps/server/server/importers/vision-helper.js).
//
//   AISystem6Vision <image file>
//
// prints one JSON object: {"available": true, "blocks": [...]} where each
// block is {"kind": "title"|"paragraph"|"list"|"table", ...}. It recognises
// text only; nothing is rewritten or summarised. On a Mac before 26 it
// prints {"available": false} and the server uses its other engines.

struct Block: Encodable {
  let kind: String
  var text: String? = nil
  var items: [String]? = nil
  var rows: [[String]]? = nil
  let top: Double
  let bottom: Double
  let left: Double
}

struct Output: Encodable {
  let available: Bool
  var blocks: [Block] = []
  var error: String? = nil
}

func emit(_ output: Output) {
  let encoder = JSONEncoder()
  if let data = try? encoder.encode(output) {
    FileHandle.standardOutput.write(data)
  }
}

@available(macOS 26.0, *)
func bounds(_ region: NormalizedRegion) -> (top: Double, bottom: Double, left: Double) {
  let points = region.points
  guard !points.isEmpty else { return (0, 0, 0) }
  // Vision's coordinates rise from the bottom; reading order runs down.
  let ys = points.map { 1 - Double($0.y) }
  let xs = points.map { Double($0.x) }
  return (ys.min() ?? 0, ys.max() ?? 0, xs.min() ?? 0)
}

@available(macOS 26.0, *)
func recognize(_ url: URL) async throws -> [Block] {
  var request = RecognizeDocumentsRequest()
  request.textRecognitionOptions.automaticallyDetectLanguage = true
  request.textRecognitionOptions.useLanguageCorrection = true
  let observations = try await request.perform(on: url, orientation: nil)
  var blocks: [Block] = []
  for observation in observations {
    let document = observation.document
    var claimed: [(top: Double, bottom: Double, left: Double)] = []

    for table in document.tables {
      let box = bounds(table.boundingRegion)
      claimed.append(box)
      let rows = table.rows.map { row in
        row.map { cell in cell.content.text.transcript.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines) }
      }
      if rows.contains(where: { $0.contains(where: { !$0.isEmpty }) }) {
        blocks.append(Block(kind: "table", rows: rows, top: box.top, bottom: box.bottom, left: box.left))
      }
    }
    for list in document.lists {
      let box = bounds(list.boundingRegion)
      claimed.append(box)
      let items = list.items.map { $0.itemString.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
      if !items.isEmpty {
        blocks.append(Block(kind: "list", items: items, top: box.top, bottom: box.bottom, left: box.left))
      }
    }
    var titleText = ""
    if let title = document.title {
      let box = bounds(title.boundingRegion)
      titleText = title.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
      if !titleText.isEmpty {
        blocks.append(Block(kind: "title", text: titleText, top: box.top, bottom: box.bottom, left: box.left))
      }
    }
    for paragraph in document.paragraphs {
      let box = bounds(paragraph.boundingRegion)
      let middle = (box.top + box.bottom) / 2
      // A paragraph inside a table or list is already in that block.
      if claimed.contains(where: { middle >= $0.top && middle <= $0.bottom && box.left >= $0.left - 0.01 }) { continue }
      var text = paragraph.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
      // The title is reported on its own and again as the start of the
      // paragraph it sits in; it is written once.
      if !titleText.isEmpty, text.hasPrefix(titleText) {
        text = String(text.dropFirst(titleText.count)).trimmingCharacters(in: .whitespacesAndNewlines)
      }
      if !text.isEmpty {
        blocks.append(Block(kind: "paragraph", text: text, top: box.top, bottom: box.bottom, left: box.left))
      }
    }
  }
  return blocks.sorted { left, right in
    abs(left.top - right.top) > 0.01 ? left.top < right.top : left.left < right.left
  }
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
  emit(Output(available: false, error: "usage: AISystem6Vision <image file>"))
  exit(2)
}
if #available(macOS 26.0, *) {
  // Top-level await: main.swift runs on the main actor, so blocking it on a
  // semaphore while a Task waits for that same actor would never finish.
  var result = Output(available: true)
  do {
    result.blocks = try await recognize(URL(fileURLWithPath: arguments[1]))
  } catch {
    result.error = error.localizedDescription
  }
  emit(result)
  exit(result.error == nil ? 0 : 1)
} else {
  emit(Output(available: false))
  exit(0)
}
