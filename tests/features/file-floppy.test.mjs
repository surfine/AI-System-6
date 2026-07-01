// File Floppy is temporary inserted context. It should survive ordinary
// refreshes through Working Session, but it is cleared by explicit restart,
// shutdown, ejection, trash, or project erasure.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("file-floppy");
const fileDisk = read("app/features/file-disk.js");
const exportImport = read("app/features/export-import.js");
const workingSession = read("app/core/working-session.js");
const app = read("app.js");
const index = read("index.html");
const importTextRoute = read("src/server/routes/import-text.js");
const importOcrPagesRoute = read("src/server/routes/import-ocr-pages.js");
const router = read("src/server/router.js");
const pdfImporter = read("src/server/importers/pdf.js");
const iworkImporter = read("src/server/importers/iwork.js");
const audioImporter = read("src/server/importers/audio.js");
const macosSpeechScript = read("scripts/transcribe-audio-macos.swift");
const macosSpeechAnalyzerScript = read("scripts/transcribe-audio-macos26.swift");
const packageJson = read("package.json");
const appSurface = readAppSurface(["app/core/context-retrieval.js"]);

test.assertIncludes(app, "const mountedTextDisk = {", "keeps File Floppy state as a visible mounted disk object");
test.assertIncludes(fileDisk, "function renderMountedTextDisk()", "renders mounted File Floppy contents through one surface");
test.assertIncludes(fileDisk, "mountedTextDisk.projectId === activeProjectId", "shows mounted files only for their owning active project");
test.assertIncludes(appSurface, "function getMountedTextDiskChunks()", "retrieval context uses mounted chunks, not raw hidden storage");

test.assertIncludes(workingSession, "function captureFileFloppyWorkingSession()", "ordinary refresh captures mounted File Floppy state");
test.assertIncludes(workingSession, "function restoreFileFloppyWorkingSession(state = {})", "ordinary refresh restores mounted File Floppy state");
test.assertIncludes(workingSession, "id: \"fileFloppy\"", "File Floppy participates in the Working Session adapter registry");
test.assertIncludes(workingSession, "clear: clearFileFloppyWorkingSession", "project-scoped session clear removes matching mounted File Floppy state");

test.assertIncludes(fileDisk, "function ejectTextDisk", "explicit ejection clears the mounted File Floppy");
test.assertIncludes(fileDisk, "function removeMountedFilesToTrash", "moving mounted files to Trash preserves user material visibly");
test.assertIncludes(fileDisk, 'originalType: "mountedFile"', "Trash records preserve mounted file provenance");
test.assertIncludes(fileDisk, "purgeContextForTrashedItems", "trashed mounted files are removed from retrieval context");

test.assertIncludes(exportImport, "function isAudioImportFile", "File Floppy import recognizes recordings as supported source files");
test.assertIncludes(exportImport, "importTranscriptionLanguage", "audio imports pass the UI language into the transcriber");
test.assertIncludes(app, ".m4a,.mp3", "File Floppy transient picker accepts common audio recordings");
test.assertIncludes(index, "audio/*", "the visible File Floppy picker accepts audio recordings without a new button");
test.assertNotIncludes(index, "dictation-import-audio", "audio file transcription stays in File Floppy, not a separate Dictation Pad button");
test.assertIncludes(fileDisk, "file_disk_kind_audio", "mounted audio transcripts are labeled distinctly from plain text");
test.assertIncludes(importTextRoute, "extractAudioTranscript", "/api/import-text routes audio files through the transcription importer");
test.assertIncludes(audioImporter, "AI_SYSTEM6_TRANSCRIBE_COMMAND", "audio transcription can be wired to Whisper/MLX without frontend changes");
test.assertIncludes(audioImporter, "execFile(", "custom transcription commands run without a shell");
test.assertIncludes(audioImporter, "runYapSpeechTranscriber", "macOS 26 Yap/SpeechAnalyzer is the preferred local file transcription provider");
test.assertIncludes(audioImporter, "yap-speech-analyzer", "Yap transcripts are labeled as SpeechAnalyzer output");
test.assertIncludes(audioImporter, "\"--json\", \"--max-length\", \"32\"", "Yap emits timestampable JSON segments for File Floppy transcripts");
test.assertIncludes(audioImporter, "runMacosSpeechAnalyzerTranscriber", "the bundled macOS 26 SpeechAnalyzer shim is a fallback when Yap is not installed");
test.assertIncludes(audioImporter, "runMacosSpeechTranscriber", "macOS Speech is a fallback provider, not the only path");
test.assertIncludes(audioImporter, "formatTranscriptSegments", "Whisper/MLX segment JSON is preserved as timestamped transcript text");
test.assertIncludes(audioImporter, "formatTranscriptTimestamp", "audio transcript timestamps use the File Floppy transcript format");
test.assertIncludes(audioImporter, "repairAudioTranscriptWithLocalModel", "local Qwen repair can fit ASR output to the gold transcript style");
test.assertIncludes(audioImporter, "normalizeChineseTranscriptSpacing", "post-repair transcript spacing matches Chinese gold transcripts without eating timestamp lines");
test.assertIncludes(audioImporter, "audio-transcript-repair", "local model repair has a dedicated task kind");
test.assertIncludes(audioImporter, "AI_SYSTEM6_TRANSCRIBE_REPAIR_MODEL", "Qwen repair model is configurable without frontend changes");
test.assertIncludes(audioImporter, "AI_SYSTEM6_TRANSCRIBE_REPAIR_MAX_CHARS", "long recordings skip synchronous Qwen repair instead of blocking File Floppy import");
test.assertIncludes(macosSpeechScript, "SFSpeechURLRecognitionRequest", "macOS fallback transcribes local recording files");
test.assertIncludes(macosSpeechScript, "groupedSegments(from:", "macOS fallback derives transcript timestamps from Speech segment offsets");
test.assertIncludes(macosSpeechScript, "\"start\": currentStart", "macOS fallback emits start offsets for deterministic timestamp formatting");
test.assertIncludes(macosSpeechScript, "authorizationStatus()", "macOS fallback checks existing Speech permission before transcribing");
test.assertIncludes(macosSpeechAnalyzerScript, "SpeechAnalyzer(modules: modules)", "macOS 26 shim uses Apple's new SpeechAnalyzer API");
test.assertIncludes(macosSpeechAnalyzerScript, "SpeechTranscriber(", "macOS 26 shim uses SpeechTranscriber for on-device file transcription");
test.assertIncludes(macosSpeechAnalyzerScript, ".audioTimeRange", "macOS 26 shim asks SpeechTranscriber for audio timestamp ranges");
test.assertIncludes(packageJson, "scripts/transcribe-audio-macos.swift", "packaged builds include the macOS transcription fallback script");
test.assertIncludes(packageJson, "scripts/transcribe-audio-macos26.swift", "packaged builds include the macOS 26 SpeechAnalyzer shim");

test.assertIncludes(index, "id=\"ocr-engine\"", "Chooser exposes the File Floppy OCR engine selector");
test.assertIncludes(exportImport, "getBrowserPaddleOcr", "PaddleOCR Tiny runs in the browser where WebGL is available");
test.assertIncludes(exportImport, "paddleOcrDetModelPath", "PaddleOCR Tiny uses a local detection model asset");
test.assertIncludes(exportImport, "paddleOcrRecModelPath", "PaddleOCR Tiny uses a local recognition model asset");
test.assertIncludes(exportImport, "fetch(apiUrl(\"/api/import-ocr-pages\")", "browser PaddleOCR can request rendered PDF/iWork pages from the server");
test.assertIncludes(exportImport, "isBrowserPaddleOcrFile", "PaddleOCR path covers images, PDF, Pages, Numbers, and Keynote");
test.assertIncludes(router, "[\"POST /api/import-ocr-pages\", handleImportOcrPages]", "server routes PDF/iWork page rendering for browser OCR");
test.assertIncludes(importOcrPagesRoute, "renderPdfOcrImages", "OCR page route can render PDF pages for browser-side recognition");
test.assertIncludes(importOcrPagesRoute, "renderIworkOcrImages", "OCR page route can render iWork previews for browser-side recognition");
test.assertIncludes(pdfImporter, "function renderPdfOcrImages", "PDF importer exposes rendered page images without doing OCR on the server");
test.assertIncludes(iworkImporter, "function renderIworkOcrImages", "iWork importer exposes preview images without doing OCR on the server");
test.assertIncludes(packageJson, "assets/ocr/paddle/**/*", "packaged builds include local PaddleOCR Tiny model assets");

test.finish();
