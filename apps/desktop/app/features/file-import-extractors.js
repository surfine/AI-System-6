// Loaded only when a File Floppy import actually needs the browser's own
// readers: a webp/heic/heif image that must be normalized through a canvas,
// or a scan/PDF that PaddleOCR Tiny or PDF.js reads in the browser. Every
// other import — plain text, HTML, a file the local server imports — never
// pays for these at boot. config.js loads this through
// ensureFileImportExtractors; export-import.js is the only eager caller and
// reaches every entry through the window API after awaiting it.
window.AISystem6FileImportExtractors = (() => {
const paddleOcrDetModelPath = "/assets/ocr/paddle/det/model.json";
const paddleOcrRecModelPath = "/assets/ocr/paddle/rec/model.json";
let paddleOcrBrowserPromise = null;

function canBrowserNormalizeImageFile(file) {
  return /\.(webp|heic|heif)$/i.test(file.name || "");
}

function isImageImportFile(file) {
  return /\.(bmp|jpe?g|png|webp|heic|heif)$/i.test(file.name || "")
    || /^image\//i.test(file.type || "");
}

function isBrowserPaddleOcrFile(file) {
  return isImageImportFile(file)
    || /\.(pdf|pages|numbers|key)$/i.test(file.name || "")
    || /^(application\/pdf|application\/vnd\.apple\.(numbers|keynote))$/i.test(file.type || "");
}

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Browser could not decode this image."));
    };
    image.src = url;
  });
}

async function convertImageFileToPngArrayBuffer(file) {
  const image = await loadImageElementFromFile(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height || width * height > 50000000) {
    throw new Error("Image dimensions are too large for browser conversion.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Browser image conversion failed."));
    }, "image/png");
  });
  return blob.arrayBuffer();
}

async function getBrowserPaddleOcr() {
  if (!paddleOcrBrowserPromise) {
    paddleOcrBrowserPromise = loadBrowserVendorScriptOnce("/app/vendor/paddle-ocr.js")
      .then(async () => {
        const ocr = window.paddlejs?.ocr;
        if (!ocr || typeof ocr.init !== "function" || typeof ocr.recognize !== "function") {
          throw new Error("PaddleOCR Tiny did not expose its browser OCR API.");
        }
        await ocr.init(paddleOcrDetModelPath, paddleOcrRecModelPath);
        return ocr;
      });
  }
  return paddleOcrBrowserPromise;
}

async function extractImageTextWithBrowserPaddle(file, options = {}) {
  throwIfAborted(options.signal);
  const image = await loadImageElementFromFile(file);
  throwIfAborted(options.signal);
  const ocr = await getBrowserPaddleOcr();
  throwIfAborted(options.signal);
  const result = await ocr.recognize(image);
  const lines = Array.isArray(result?.text) ? result.text : [result?.text || ""];
  const text = lines.map((line) => String(line || "").trim()).filter(Boolean).join("\n").trim();
  if (!text) throw new Error("PaddleOCR Tiny did not return readable text.");
  return text;
}

function base64ToBlobUrl(base64, mimeType = "image/png") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

async function loadImageElementFromBlobUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Browser could not decode an OCR page image."));
    image.src = url;
  });
}

async function recognizePaddleImageElement(image, options = {}) {
  throwIfAborted(options.signal);
  const ocr = await getBrowserPaddleOcr();
  throwIfAborted(options.signal);
  const result = await ocr.recognize(image);
  const lines = Array.isArray(result?.text) ? result.text : [result?.text || ""];
  return lines.map((line) => String(line || "").trim()).filter(Boolean).join("\n").trim();
}

async function extractPdfTextInBrowser(file, options = {}) {
  const signal = options.signal;
  throwIfAborted(signal);
  if ((file.size || 0) > 20 * 1024 * 1024) {
    throw new Error(t("public_import_pdf_too_large"));
  }

  const pdfjs = await getBrowserPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(signal);
  // pdfjs 6 decodes JBIG2 / JPEG 2000 / ICC through wasm; the options point it
  // at the served copies so image-heavy scans keep full fidelity.
  const loadingTask = pdfjs.getDocument(pdfJsDocumentOptions(data));
  const pdfDocument = await loadingTask.promise;
  const pageLimit = Math.min(pdfDocument.numPages, 20);
  const chunks = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      throwIfAborted(signal);
      const page = await pdfDocument.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        const embeddedText = (textContent.items || [])
          .map((item) => String(item?.str || "").trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        if (embeddedText) {
          chunks.push(`${t("public_import_page", pageNumber)}\n${embeddedText}`);
          continue;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const pixelBudget = 6_000_000;
        const scale = Math.min(
          1.75,
          Math.sqrt(pixelBudget / Math.max(1, baseViewport.width * baseViewport.height))
        );
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        await page.render({
          canvasContext: context,
          viewport,
          background: "rgb(255,255,255)",
        }).promise;
        throwIfAborted(signal);
        const text = await recognizePaddleImageElement(canvas, { signal });
        canvas.width = 1;
        canvas.height = 1;
        if (text) chunks.push(`${t("public_import_page", pageNumber)}\n${text}`);
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdfDocument.destroy();
  }

  if (pdfDocument.numPages > pageLimit) {
    chunks.push(t("public_import_pdf_truncated", pageLimit, pdfDocument.numPages));
  }
  const text = chunks.join("\n\n").trim();
  if (!text) throw new Error(t("public_import_pdf_empty"));
  return text;
}

async function extractRenderedPagesWithBrowserPaddle(file, options = {}) {
  const signal = options.signal;
  throwIfAborted(signal);
  const fileBuffer = await file.arrayBuffer();
  throwIfAborted(signal);
  const response = await window.AISystem6Capabilities.requestService("artifact.import.ocr", {
    init: {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        type: file.type,
        data: arrayBufferToBase64(fileBuffer),
      }),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error || response.statusText);
  }
  if (data.text && !data.pages?.length) return data.text;

  const chunks = [];
  for (const page of data.pages || []) {
    throwIfAborted(signal);
    const url = base64ToBlobUrl(page.data, page.mimeType || "image/png");
    try {
      const image = await loadImageElementFromBlobUrl(url);
      const text = await recognizePaddleImageElement(image, { signal });
      // ClioWorks v4.3 (I43-01/Q04): an iWork bundle without readable text
      // sends its single best PREVIEW image — one rendering of the first page,
      // not page 1 of a one-page document — so it is labelled for what it is.
      const pageLabel = page.kind === "preview"
        ? (currentLanguage === "zh" ? "预览图" : "Preview image")
        : t("public_import_page", page.pageNumber || chunks.length + 1);
      if (text) chunks.push(`${pageLabel}\n${text}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (data.truncated) {
    chunks.push("PaddleOCR 已在可渲染页数限制后停止。");
  }
  const text = chunks.join("\n\n").trim();
  if (!text) throw new Error("PaddleOCR Tiny did not return readable text.");
  return text;
}

  return {
    canBrowserNormalizeImageFile,
    isImageImportFile,
    isBrowserPaddleOcrFile,
    loadImageElementFromFile,
    convertImageFileToPngArrayBuffer,
    getBrowserPaddleOcr,
    extractImageTextWithBrowserPaddle,
    base64ToBlobUrl,
    loadImageElementFromBlobUrl,
    recognizePaddleImageElement,
    extractPdfTextInBrowser,
    extractRenderedPagesWithBrowserPaddle,
  };
})();
