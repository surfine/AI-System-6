import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createFeatureTest } from '../helpers/feature-test-harness.mjs';
const test = createFeatureTest('tinyjs-native-download');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log('SKIP real native download file evidence: arm64 macOS required.');
} else {
  const dir = await mkdtemp(join(tmpdir(), 'system6-native-download-'));
  try {
    await writeFile(join(dir, 'main.swift'), `import Foundation
@main struct DownloadContract {
  @MainActor static func main() throws {
    let root = URL(fileURLWithPath: CommandLine.arguments[1])
    let output = root.appendingPathComponent("output")
    try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
    let source = root.appendingPathComponent("input.bin")
    let bytes = Data(repeating: 173, count: 131077)
    try bytes.write(to: source)
    let existing = output.appendingPathComponent("report.txt")
    let sentinel = Data("keep original".utf8)
    try sentinel.write(to: existing)
    let saved = try NativeDownloads.copyWithoutReplacing(source, filename: "../report.txt", directory: output)
    precondition(saved.lastPathComponent == "report (1).txt")
    let savedBytes = try Data(contentsOf: saved)
    precondition(savedBytes == bytes)
    let originalBytes = try Data(contentsOf: existing)
    precondition(originalBytes == sentinel)
    let symlink = output.appendingPathComponent("linked.txt")
    try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: existing)
    let other = try NativeDownloads.copyWithoutReplacing(source, filename: "linked.txt", directory: output)
    precondition(other.lastPathComponent == "linked (1).txt")
    let finalOriginalBytes = try Data(contentsOf: existing)
    precondition(finalOriginalBytes == sentinel)
    let unnamed = try NativeDownloads.copyWithoutReplacing(source, filename: "..", directory: output)
    precondition(unnamed.lastPathComponent == "Download")
    print("Actual native copy preserved bytes, existing files and symlink targets.")
  }
}`);
    execFileSync('/usr/bin/swiftc', ['-swift-version', '5', '-parse-as-library', '-target', 'arm64-apple-macos15.0', 'platform/macos/tinyjs/native/Downloads.swift', join(dir, 'main.swift'), '-o', join(dir, 'contract')], { stdio: 'pipe' });
    execFileSync(join(dir, 'contract'), [dir], { stdio: 'inherit' });
    test.assert(true, 'real native file copy refuses replacement and preserves downloaded bytes');
  } finally { await rm(dir, { recursive: true, force: true }); }
}
test.finish();
