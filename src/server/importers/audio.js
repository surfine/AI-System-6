// Audio transcription importer for File Floppy / Import Utility.
//
// This deliberately stays behind the existing /api/import-text route so
// recorded audio behaves like another source file, not a new writing tool.

"use strict";

const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const { repoRoot } = require("../lib/build-info.js");
const { postJsonWithFallback } = require("../lib/fetch.js");
const {
  cleanImportedText,
  importExtension,
  safeTempExtension,
} = require("./shared.js");

const audioTranscribeTimeoutMs = Math.max(
  10000,
  Number(process.env.AI_SYSTEM6_TRANSCRIBE_TIMEOUT_MS || 10 * 60 * 1000)
);
const audioTranscriptMaxBuffer = Math.max(
  1024 * 1024,
  Number(process.env.AI_SYSTEM6_TRANSCRIBE_MAX_BUFFER || 20 * 1024 * 1024)
);
const audioTranscriptRepairEnabled = !/^(0|false|off|raw)$/i.test(
  String(process.env.AI_SYSTEM6_TRANSCRIBE_REPAIR || "auto")
);
const audioTranscriptRepairModel =
  process.env.AI_SYSTEM6_TRANSCRIBE_REPAIR_MODEL ||
  process.env.AI_SYSTEM6_TRANSCRIBE_MODEL ||
  "qwen3.5-4b-mlx";
const audioTranscriptRepairTimeoutMs = Math.max(
  5000,
  Number(process.env.AI_SYSTEM6_TRANSCRIBE_REPAIR_TIMEOUT_MS || 35000)
);
const audioTranscriptRepairMaxChars = Math.max(
  0,
  Number(process.env.AI_SYSTEM6_TRANSCRIBE_REPAIR_MAX_CHARS || 2200)
);
const lmStudioUrl = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234/v1/chat/completions";

const audioExtensions = new Set([
  ".aac",
  ".aif",
  ".aiff",
  ".amr",
  ".caf",
  ".flac",
  ".m4a",
  ".mp3",
  ".oga",
  ".ogg",
  ".opus",
  ".wav",
  ".webm",
]);

const audioMimeTypes = new Set([
  "application/ogg",
  "audio/aac",
  "audio/aiff",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
  "audio/x-aac",
  "audio/x-aiff",
  "audio/x-caf",
  "audio/x-m4a",
  "audio/x-wav",
]);

const appRootCandidates = [
  process.env.AI_SYSTEM6_ROOT,
  repoRoot,
  process.cwd(),
  path.dirname(process.execPath || ""),
].filter(Boolean);

const uniqueAppRootCandidates = Array.from(
  new Set(appRootCandidates.map((candidate) => path.resolve(candidate)))
);

const macosSpeechScriptPath =
  uniqueAppRootCandidates
    .map((candidate) => path.join(candidate, "scripts", "transcribe-audio-macos.swift"))
    .find((candidate) => fsSync.existsSync(candidate)) ||
  path.join(repoRoot, "scripts", "transcribe-audio-macos.swift");

const macosSpeechAnalyzerScriptPath =
  uniqueAppRootCandidates
    .map((candidate) => path.join(candidate, "scripts", "transcribe-audio-macos26.swift"))
    .find((candidate) => fsSync.existsSync(candidate)) ||
  path.join(repoRoot, "scripts", "transcribe-audio-macos26.swift");

/**
 * @param {string} name
 * @param {string} mimeType
 * @returns {boolean}
 */
function canTranscribeAudioImport(name, mimeType) {
  const ext = importExtension(name);
  const type = String(mimeType || "").toLowerCase().split(";")[0].trim();
  return audioExtensions.has(ext) || type.startsWith("audio/") || audioMimeTypes.has(type);
}

/**
 * @param {unknown} language
 * @returns {string}
 */
function normalizeTranscriptionLanguage(language) {
  const configured = String(process.env.AI_SYSTEM6_TRANSCRIBE_LANGUAGE || "").trim();
  const raw = configured || String(language || "").trim();
  if (/^zh($|[-_])/i.test(raw)) return raw.replace("_", "-") || "zh-CN";
  if (/^en($|[-_])/i.test(raw)) return raw.replace("_", "-") || "en-US";
  return raw.replace("_", "-") || "zh-CN";
}

/**
 * @param {string} input
 * @returns {string[]}
 */
function splitCommandLine(input) {
  const parts = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const char of String(input || "")) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaped) current += "\\";
  if (quote) {
    const error = /** @type {Error & { statusCode?: number }} */ (
      new Error("AI_SYSTEM6_TRANSCRIBE_COMMAND has an unterminated quote.")
    );
    error.statusCode = 500;
    throw error;
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * @param {string} name
 * @returns {string}
 */
function resolveExecutable(name) {
  const value = String(name || "");
  if (!value) return value;
  if (value.includes("/") || value.includes("\\")) return value;
  const pathParts = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const extras = process.platform === "darwin"
    ? ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
    : [];
  for (const dir of [...pathParts, ...extras]) {
    const candidate = path.join(dir, value);
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return value;
}

/**
 * @param {unknown} output
 * @returns {string}
 */
function transcriptTextFromOutput(output) {
  const raw = String(output || "").trim();
  if (!raw) return "";
  try {
    const data = JSON.parse(raw);
    if (typeof data === "string") return data;
    if (Array.isArray(data.segments)) {
      return formatTranscriptSegments(data.segments);
    }
    if (typeof data.text === "string") return data.text;
    if (typeof data.transcript === "string") return data.transcript;
    if (typeof data.result === "string") return data.result;
  } catch {
    // Plain stdout is the normal contract.
  }
  return raw;
}

/**
 * @param {number} seconds
 * @returns {string}
 */
function formatTranscriptTimestamp(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${mmss}` : mmss;
}

/**
 * @param {any[]} segments
 * @returns {string}
 */
function formatTranscriptSegments(segments) {
  const lines = [];
  for (const segment of segments) {
    if (typeof segment === "string") {
      const text = cleanImportedText(segment);
      if (text) lines.push(text);
      continue;
    }
    const text = cleanImportedText(segment?.text || segment?.transcript || segment?.result || "");
    if (!text) continue;
    const start = Number(segment?.start ?? segment?.start_time ?? segment?.timestamp ?? segment?.time);
    if (Number.isFinite(start)) {
      lines.push(formatTranscriptTimestamp(start), text, "");
    } else {
      lines.push(text);
    }
  }
  return lines.join("\n").trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
function unwrapMarkdownFence(value) {
  let text = String(value || "").trim();
  if (text.startsWith("```")) {
    const lines = text.split("\n");
    if (lines[0].startsWith("```")) lines.shift();
    if (lines.length && lines[lines.length - 1].startsWith("```")) lines.pop();
    text = lines.join("\n").trim();
  }
  return text;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitTranscriptRepairChunks(text) {
  const paragraphs = String(text || "").split(/\n{2,}/);
  const chunks = [];
  let current = "";
  const maxChars = 5500;
  for (const paragraph of paragraphs) {
    const block = paragraph.trim();
    if (!block) continue;
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [String(text || "")];
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeChineseTranscriptSpacing(text) {
  return String(text || "")
    .replace(/([\p{Script=Han}])[ \t]+([0-9])/gu, "$1$2")
    .replace(/([0-9])[ \t]+([\p{Script=Han}])/gu, "$1$2")
    .replace(/[ \t]+([，。！？；：、])/gu, "$1")
    .replace(/([，。！？；：、])[ \t]+([\p{Script=Han}])/gu, "$1$2");
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isTranscriptTimestampLine(line) {
  return /^\d\d:\d\d(?::\d\d)?$/.test(String(line || "").trim());
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function transcriptTimestampLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isTranscriptTimestampLine);
}

/**
 * @param {string} source
 * @param {string} repaired
 * @returns {string}
 */
function restoreTranscriptTimestampLines(source, repaired) {
  const sourceTimestamps = transcriptTimestampLines(source);
  if (!sourceTimestamps.length) return repaired;

  const repairedLines = String(repaired || "").split(/\r?\n/);
  const repairedTimestampIndexes = [];
  repairedLines.forEach((line, index) => {
    if (isTranscriptTimestampLine(line)) repairedTimestampIndexes.push(index);
  });
  if (repairedTimestampIndexes.length !== sourceTimestamps.length) {
    console.error("Audio transcript repair changed timestamp count; keeping raw transcript chunk.");
    return source;
  }
  repairedTimestampIndexes.forEach((lineIndex, index) => {
    repairedLines[lineIndex] = sourceTimestamps[index];
  });
  return repairedLines.join("\n");
}

/**
 * @param {string} text
 * @returns {any[]}
 */
function buildAudioTranscriptRepairMessages(text) {
  return [
    {
      role: "system",
      content: [
        "You are AI System 6's local audio-transcript repair pass.",
        "Repair ASR text into a faithful verbatim transcript for File Floppy, DocMap, and ClioSlides.",
        "Preserve the speaker's roughness, repetitions, hesitation, chronology, names, and personal details.",
        "Do not summarize, rewrite into prose, add facts, add headings, or remove awkward human phrasing.",
        "Keep timestamps exactly where they already exist. Use the pattern: timestamp line, transcript line, blank line.",
        "For Chinese transcripts, do not insert spaces between Arabic numerals and Chinese characters unless the source already has them.",
        "If a recognition error is obvious from nearby Chinese context, fix it conservatively; otherwise leave it.",
        "Return only the transcript text.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `Repair this transcript chunk without changing its meaning:\n\n${text}`,
    },
  ];
}

/**
 * @param {string} text
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<string>}
 */
async function repairAudioTranscriptWithLocalModel(text, signal) {
  const source = cleanImportedText(text);
  if (!audioTranscriptRepairEnabled || source.length < 20) {
    return normalizeChineseTranscriptSpacing(source);
  }
  if (audioTranscriptRepairMaxChars > 0 && source.length > audioTranscriptRepairMaxChars) {
    console.error(
      `Audio transcript is ${source.length} chars; skipping synchronous local-model repair over ${audioTranscriptRepairMaxChars} chars.`
    );
    return normalizeChineseTranscriptSpacing(source);
  }

  const chunks = splitTranscriptRepairChunks(source);
  const repaired = [];
  for (const chunk of chunks) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, audioTranscriptRepairTimeoutMs);
    const abortRepair = () => controller.abort();
    if (signal) {
      if (signal.aborted) abortRepair();
      else signal.addEventListener("abort", abortRepair, { once: true });
    }
    try {
      const payload = {
        model: audioTranscriptRepairModel,
        messages: buildAudioTranscriptRepairMessages(chunk),
        temperature: 0.1,
        max_tokens: Math.min(6500, Math.max(1200, Math.ceil(chunk.length * 0.85))),
        ai_system6_task_kind: "audio-transcript-repair",
        chat_template_kwargs: { enable_thinking: false },
      };
      const { response } = await postJsonWithFallback(lmStudioUrl, payload, controller.signal);
      const responseText = await response.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { raw: responseText };
      }
      if (!response.ok) {
        throw new Error(data.detail || data.error?.message || responseText || `LM Studio returned status ${response.status}`);
      }
      const content = unwrapMarkdownFence(data?.choices?.[0]?.message?.content || "");
      repaired.push(content ? restoreTranscriptTimestampLines(chunk, content) : chunk);
    } catch (error) {
      if (timedOut) {
        console.error(`Audio transcript repair timed out after ${audioTranscriptRepairTimeoutMs}ms, keeping raw transcript chunk.`);
      } else {
        console.error("Audio transcript repair failed, keeping raw transcript chunk:", error);
      }
      repaired.push(chunk);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.("abort", abortRepair);
    }
  }

  return normalizeChineseTranscriptSpacing(cleanImportedText(repaired.join("\n\n")));
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function execFileForText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = execFile(
      command,
      args,
      {
        timeout: audioTranscribeTimeoutMs,
        maxBuffer: audioTranscriptMaxBuffer,
        env: options.env || process.env,
      },
      (error, stdout, stderr) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener?.("abort", abortChild);
        if (error) {
          const message = String(stderr || stdout || error.message || "Transcription command failed.").trim();
          const err = new Error(message);
          err.cause = error;
          reject(err);
          return;
        }
        resolve({
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
        });
      }
    );

    function abortChild() {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener?.("abort", abortChild);
      child.kill();
      const error = new Error("Audio transcription was canceled.");
      error.name = "AbortError";
      reject(error);
    }

    if (options.signal) {
      if (options.signal.aborted) abortChild();
      else options.signal.addEventListener("abort", abortChild, { once: true });
    }
  });
}

/**
 * @param {string} inputPath
 * @param {string} language
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<{ provider: string, text: string } | null>}
 */
async function runCustomAudioTranscriber(inputPath, language, signal) {
  const commandLine = String(process.env.AI_SYSTEM6_TRANSCRIBE_COMMAND || "").trim();
  if (!commandLine) return null;

  const parts = splitCommandLine(commandLine);
  if (!parts.length) return null;
  const command = resolveExecutable(parts[0]);
  let args = parts.slice(1).map((arg) =>
    arg.replace(/\{input\}/g, inputPath).replace(/\{language\}/g, language)
  );
  if (!parts.slice(1).some((arg) => arg.includes("{input}"))) args.push(inputPath);
  if (language && !parts.slice(1).some((arg) => arg.includes("{language}"))) args.push(language);

  const { stdout } = await execFileForText(command, args, {
    signal: signal || undefined,
    env: {
      ...process.env,
      AI_SYSTEM6_TRANSCRIBE_INPUT: inputPath,
      AI_SYSTEM6_TRANSCRIBE_LANGUAGE: language,
    },
  });
  return {
    provider: "custom-command",
    text: transcriptTextFromOutput(stdout),
  };
}

/**
 * @returns {string}
 */
function yapExecutablePath() {
  const configured = String(process.env.AI_SYSTEM6_TRANSCRIBE_YAP || "").trim();
  if (/^(0|false|off|none)$/i.test(configured)) return "";
  return resolveExecutable(configured || "yap");
}

/**
 * @param {string} inputPath
 * @param {string} language
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<{ provider: string, text: string } | null>}
 */
async function runYapSpeechTranscriber(inputPath, language, signal) {
  if (process.platform !== "darwin") return null;
  const yap = yapExecutablePath();
  if (!yap || !fsSync.existsSync(yap)) return null;

  const { stdout } = await execFileForText(
    yap,
    ["transcribe", "--locale", language, inputPath, "--json", "--max-length", "32"],
    { signal: signal || undefined }
  );
  return {
    provider: "yap-speech-analyzer",
    text: transcriptTextFromOutput(stdout),
  };
}

/**
 * @returns {string}
 */
function swiftExecutablePath() {
  return resolveExecutable("swift");
}

/**
 * @param {string} inputPath
 * @param {string} language
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<{ provider: string, text: string } | null>}
 */
async function runMacosSpeechAnalyzerTranscriber(inputPath, language, signal) {
  if (process.platform !== "darwin") return null;
  if (!fsSync.existsSync(macosSpeechAnalyzerScriptPath)) return null;
  const swift = swiftExecutablePath();
  if (!swift || !fsSync.existsSync(swift)) return null;

  const moduleCache = path.join(os.tmpdir(), "ai-system6-swift-cache");
  const { stdout } = await execFileForText(swift, [macosSpeechAnalyzerScriptPath, inputPath, language], {
    signal: signal || undefined,
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCache,
    },
  });
  return {
    provider: "macos-speech-analyzer",
    text: transcriptTextFromOutput(stdout),
  };
}

/**
 * @param {string} inputPath
 * @param {string} language
 * @param {AbortSignal | null | undefined} signal
 * @returns {Promise<{ provider: string, text: string } | null>}
 */
async function runMacosSpeechTranscriber(inputPath, language, signal) {
  if (process.platform !== "darwin") return null;
  if (!fsSync.existsSync(macosSpeechScriptPath)) return null;
  const swift = swiftExecutablePath();
  if (!swift || !fsSync.existsSync(swift)) return null;

  const moduleCache = path.join(os.tmpdir(), "ai-system6-swift-cache");
  const { stdout } = await execFileForText(swift, [macosSpeechScriptPath, inputPath, language], {
    signal: signal || undefined,
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCache,
      AI_SYSTEM6_TRANSCRIBE_SWIFT_TIMEOUT_SECONDS: String(Math.ceil(audioTranscribeTimeoutMs / 1000)),
    },
  });
  return {
    provider: "macos-speech",
    text: transcriptTextFromOutput(stdout),
  };
}

/**
 * @param {string} name
 * @param {string} mimeType
 * @param {Buffer} buffer
 * @param {{
 *   language?: string,
 *   signal?: AbortSignal,
 *   repairWithModel?: boolean,
 * }} [options]
 * @returns {Promise<string>}
 */
async function extractAudioTranscript(name, mimeType, buffer, options = {}) {
  if (!canTranscribeAudioImport(name, mimeType)) {
    throw new Error("This file is not a supported audio recording.");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-system6-audio-"));
  const inputPath = path.join(tempDir, `input${safeTempExtension(name)}`);
  const language = normalizeTranscriptionLanguage(options.language);
  const errors = [];

  try {
    await fs.writeFile(inputPath, buffer);
    for (const provider of [
      runCustomAudioTranscriber,
      runYapSpeechTranscriber,
      runMacosSpeechAnalyzerTranscriber,
      runMacosSpeechTranscriber,
    ]) {
      if (options.signal?.aborted) {
        const error = new Error("Audio transcription was canceled.");
        error.name = "AbortError";
        throw error;
      }
      try {
        const result = await provider(inputPath, language, options.signal);
        const text = cleanImportedText(result?.text || "");
        if (text) {
          return options.repairWithModel === false
            ? normalizeChineseTranscriptSpacing(text)
            : repairAudioTranscriptWithLocalModel(text, options.signal);
        }
        if (result) errors.push(`${result.provider}: no transcript text returned`);
      } catch (error) {
        if (/** @type {Error} */ (error).name === "AbortError") throw error;
        errors.push(/** @type {Error} */ (error).message || String(error));
      }
    }

    const hasConfiguredCommand = !!String(process.env.AI_SYSTEM6_TRANSCRIBE_COMMAND || "").trim();
    const message = errors.length
      ? `Audio transcription failed. ${errors.join(" ")}`
      : "Audio transcription needs a provider. On macOS 26, install yap or use the bundled SpeechAnalyzer Swift shim with Xcode tools. You can also set AI_SYSTEM6_TRANSCRIBE_COMMAND to a local Whisper/MLX/whisper.cpp command, or grant macOS Speech recognition permission for the legacy fallback.";
    const error = /** @type {Error & { statusCode?: number }} */ (new Error(message));
    error.statusCode = hasConfiguredCommand || errors.length ? 502 : 501;
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  audioExtensions,
  canTranscribeAudioImport,
  extractAudioTranscript,
  formatTranscriptSegments,
  formatTranscriptTimestamp,
  normalizeChineseTranscriptSpacing,
  normalizeTranscriptionLanguage,
  repairAudioTranscriptWithLocalModel,
  restoreTranscriptTimestampLines,
  transcriptTextFromOutput,
  runMacosSpeechAnalyzerTranscriber,
  runYapSpeechTranscriber,
};
