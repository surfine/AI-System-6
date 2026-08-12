"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { createWorker } = require("tesseract.js");
const { cleanImportedText } = require("./shared.js");
const {
  imageBufferToDataUrl,
  postLocalVisionAnalysis,
} = require("../vision.js");

const execFileAsync = promisify(execFile);
const ocrImageMaxBytes = 10 * 1024 * 1024;
const ocrLangPath = path.join(__dirname, "../../../ocr/tessdata");
const ocrCachePath = path.join(os.tmpdir(), "ai-system6-tessdata-cache");
const visionOcrModel = process.env.AI_SYSTEM6_VISION_MODEL || "";

let canvasPromise = null;
let ocrWorkerPromise = null;
let paddleOcrPromise = null;
/** @type {Promise<unknown>} */
let ocrQueue = Promise.resolve();

function normalizeOcrEngine(engine) {
  const value = String(engine || process.env.AI_SYSTEM6_OCR_ENGINE || "auto").toLowerCase();
  return ["auto", "tesseract", "paddle"].includes(value) ? value : "auto";
}

async function getCanvas() {
  if (!canvasPromise) {
    canvasPromise = Promise.resolve()
      .then(() => require("canvas"))
      .catch((error) => {
        const message = String(error?.message || error || "");
        const archMismatch = /incompatible architecture|mach-o/i.test(message);
        if (archMismatch) {
          const runtimeArch = process.arch || "unknown";
          throw new Error(
            `Canvas runtime architecture mismatch (runtime: ${runtimeArch}). Rebuild/reinstall "canvas" for this runtime architecture, or use a matching packaged build target.`
          );
        }
        throw error;
      });
  }
  return canvasPromise;
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker(["chi_sim", "chi_tra", "eng"], 1, {
      langPath: ocrLangPath,
      cachePath: ocrCachePath,
      gzip: true,
      logger: () => {},
    });
  }
  return ocrWorkerPromise;
}

function isLikelyUsefulOcrText(text, confidence) {
  const value = cleanImportedText(text);
  const readable = value.match(/[\p{Script=Han}\p{L}\p{N}]/gu)?.length || 0;
  if (readable < 4) return false;
  if (readable / Math.max(value.length, 1) < 0.25) return false;
  if (Number.isFinite(confidence) && confidence < 30 && value.length < 80) return false;
  return true;
}

function cleanOcrText(value) {
  return cleanImportedText(String(value || "")
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*[©®™•·。、，,;:!！?？]+\s*/g, "")
      .replace(/^\s*[已8]\s+(?=[\p{Script=Han}\p{L}\p{N}])/u, "")
      .replace(/\s+[已8]\s*$/g, "")
      .trim())
    .filter((line) => {
      if (!line) return false;
      if (/^[^\p{Script=Han}\p{L}\p{N}]+$/u.test(line)) return false;
      return true;
    })
    .join("\n"));
}

function imageMimeTypeFromName(name, mimeType) {
  const type = String(mimeType || "").toLowerCase();
  if (type.startsWith("image/")) return type;
  const ext = path.extname(name || "").toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  if (ext === ".heif") return "image/heif";
  return "image/png";
}

function normalizeImageMimeType(mimeType) {
  const type = String(mimeType || "image/png").toLowerCase().split(";")[0].trim();
  return type === "image/jpg" ? "image/jpeg" : type;
}

function imageTempExtension(mimeType) {
  const type = normalizeImageMimeType(mimeType);
  if (type === "image/heif") return ".heif";
  if (type === "image/heic") return ".heic";
  if (type === "image/webp") return ".webp";
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/bmp") return ".bmp";
  return ".png";
}

async function convertImageToPngWithCanvas(buffer) {
  const canvasModule = await getCanvas();
  if (typeof canvasModule.loadImage !== "function") {
    throw new Error("Canvas image decoder is unavailable.");
  }

  const image = await canvasModule.loadImage(buffer);
  const width = Number(image.width || 0);
  const height = Number(image.height || 0);
  if (!width || !height || width * height > 50000000) {
    throw new Error("Image dimensions are too large for OCR conversion.");
  }

  const canvas = canvasModule.createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.restore();
  context.drawImage(image, 0, 0);
  return canvas.toBuffer("image/png");
}

async function enhanceImageForLocalOcr(buffer) {
  const canvasModule = await getCanvas();
  if (typeof canvasModule.loadImage !== "function") {
    throw new Error("Canvas image decoder is unavailable.");
  }

  const image = await canvasModule.loadImage(buffer);
  const sourceWidth = Number(image.width || 0);
  const sourceHeight = Number(image.height || 0);
  if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > 50000000) {
    throw new Error("Image dimensions are too large for OCR enhancement.");
  }

  const longEdge = Math.max(sourceWidth, sourceHeight);
  const scale = Math.max(1, Math.min(3, 1800 / Math.max(longEdge, 1)));
  const width = Math.ceil(sourceWidth * scale);
  const height = Math.ceil(sourceHeight * scale);
  const canvas = canvasModule.createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  context.restore();
  return canvas.toBuffer("image/png");
}

async function convertImageToPngWithSips(buffer, mimeType) {
  if (process.platform !== "darwin") {
    throw new Error("Native image conversion is only available on macOS.");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-system6-image-"));
  const inputPath = path.join(tempDir, `source${imageTempExtension(mimeType)}`);
  const outputPath = path.join(tempDir, "source.png");

  try {
    await fs.writeFile(inputPath, buffer);
    await execFileAsync("sips", ["-s", "format", "png", inputPath, "--out", outputPath], {
      timeout: 20000,
    });
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function prepareImageForOcr(buffer, mimeType) {
  const type = normalizeImageMimeType(mimeType);
  if (["image/png", "image/jpeg", "image/bmp"].includes(type)) {
    return { buffer, mimeType: type };
  }

  if (type === "image/heic" || type === "image/heif") {
    try {
      return { buffer: await convertImageToPngWithSips(buffer, type), mimeType: "image/png" };
    } catch {
      // On Windows/Linux we keep the original buffer so the vision model can try it.
    }
  }

  if (type === "image/webp") {
    try {
      return { buffer: await convertImageToPngWithSips(buffer, type), mimeType: "image/png" };
    } catch {
      // Continue to the bundled canvas decoder below.
    }
    try {
      return { buffer: await convertImageToPngWithCanvas(buffer), mimeType: "image/png" };
    } catch {
      // Some node-canvas builds lack WebP decoding. Fall through to vision fallback.
    }
  }

  return { buffer, mimeType: type || "image/png" };
}

async function extractImageTextWithTesseract(buffer) {
  const worker = await getOcrWorker();
  const result = await worker.recognize(buffer);
  const text = cleanOcrText(result?.data?.text || "");
  const confidence = Number(result?.data?.confidence);
  if (!isLikelyUsefulOcrText(text, confidence)) {
    throw new Error("OCR could not find enough readable text in this image.");
  }
  return text;
}

async function getPaddleOcr() {
  if (!paddleOcrPromise) {
    paddleOcrPromise = Promise.resolve()
      .then(() => {
        const browserWindow = globalThis.window;
        const browserDocument = globalThis.document;
        if (!browserWindow || !browserDocument) {
          throw new Error("PaddleOCR Tiny needs the browser/WebGL runtime; File Floppy OCR currently runs on the local server.");
        }
        return require("@paddlejs-models/ocr");
      })
      .then((ocr) => {
        if (!ocr || typeof ocr.init !== "function" || typeof ocr.recognize !== "function") {
          throw new Error("PaddleOCR Tiny did not expose the expected init/recognize API.");
        }
        return ocr;
      });
  }
  return paddleOcrPromise;
}

async function extractImageTextWithPaddle(buffer) {
  const ocr = await getPaddleOcr();
  await ocr.init();
  const dataUrl = imageBufferToDataUrl(buffer, "image/png");
  const browserWindow = globalThis.window;
  if (!browserWindow?.Image) {
    throw new Error("PaddleOCR Tiny needs a browser Image implementation.");
  }
  const image = new browserWindow.Image();
  const loaded = new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("PaddleOCR Tiny could not load the prepared image."));
  });
  image.src = dataUrl;
  await loaded;
  const result = await ocr.recognize(image);
  const rawText = Array.isArray(result?.text) ? result.text.join("\n") : result?.text;
  const text = cleanOcrText(rawText || "");
  if (!isLikelyUsefulOcrText(text, NaN)) {
    throw new Error("PaddleOCR Tiny could not find enough readable text in this image.");
  }
  return text;
}

async function extractImageTextWithVision(buffer, mimeType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const data = await postLocalVisionAnalysis({
      dataUrl: imageBufferToDataUrl(buffer, mimeType),
      mode: "ocr",
      model: visionOcrModel,
      signal: controller.signal,
    });
    const extracted = cleanOcrText(data.text || "");
    if (!isLikelyUsefulOcrText(extracted, NaN)) {
      throw new Error("AI Vision OCR did not return enough readable text.");
    }
    return extracted;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractImageText(buffer, mimeType, options = {}) {
  if (buffer.length > ocrImageMaxBytes) {
    throw new Error("This image is too large for local OCR. Use a smaller image or OCR it before importing.");
  }

  const run = async () => {
    const image = await prepareImageForOcr(buffer, mimeType);
    const engine = normalizeOcrEngine(options.ocrEngine);
    if (engine === "paddle") {
      try {
        return await extractImageTextWithPaddle(image.buffer);
      } catch (paddleError) {
        if (options.allowOcrFallback === false) throw paddleError;
        try {
          return await extractImageTextWithTesseract(image.buffer);
        } catch (tesseractError) {
          if (options.allowVisionFallback === false) {
            throw new Error(`${paddleError.message} Tesseract OCR also failed: ${tesseractError.message}`);
          }
          try {
            return await extractImageTextWithVision(image.buffer, image.mimeType);
          } catch (visionError) {
            throw new Error(`${paddleError.message} Tesseract OCR also failed: ${tesseractError.message}. AI Vision OCR also failed: ${visionError.message}`);
          }
        }
      }
    }
    try {
      if (engine === "auto") {
        try {
          return await extractImageTextWithPaddle(image.buffer);
        } catch {
          // PaddleOCR Tiny is optional and browser-backed; Auto keeps the stable local path.
        }
      }
      return await extractImageTextWithTesseract(image.buffer);
    } catch (tesseractError) {
      try {
        const enhanced = await enhanceImageForLocalOcr(image.buffer);
        return await extractImageTextWithTesseract(enhanced);
      } catch {
        // Keep the first Tesseract error; it describes the original input.
      }
      if (options.allowVisionFallback === false) throw tesseractError;
      try {
        return await extractImageTextWithVision(image.buffer, image.mimeType);
      } catch (visionError) {
        throw new Error(`${tesseractError.message} AI Vision OCR also failed: ${visionError.message}`);
      }
    }
  };

  const task = ocrQueue.then(run, run);
  ocrQueue = task.catch(() => {});
  return task;
}

module.exports = {
  getCanvas,
  imageMimeTypeFromName,
  extractImageText,
  normalizeOcrEngine,
};
