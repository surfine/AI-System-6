// Shared string helpers.

// A failed request's body is not a message. A gateway, proxy, or captive
// portal answers with an entire HTML error page, and pasting that into the
// status line buries the one fact worth reading: which service failed, and
// with what status. Keep a real plain-text or JSON detail, drop markup.
const SERVICE_ERROR_DETAIL_LIMIT = 300;

function serviceErrorDetail(status, body) {
  const text = String(body || "").trim();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  const field = [payload?.detail, payload?.error, payload?.message]
    .find((value) => typeof value === "string" && value.trim());
  if (field) return field.trim().slice(0, SERVICE_ERROR_DETAIL_LIMIT);
  const looksLikeMarkup = /^</.test(text) || /<\/?(?:!doctype|html|head|body)\b/i.test(text);
  if (!text || looksLikeMarkup) return t("service_http_error", status || 0);
  return text.slice(0, SERVICE_ERROR_DETAIL_LIMIT);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Tagged template for innerHTML assembly: every interpolation is escaped, so
// a forgotten escapeHtml() can no longer be the injection. The explicit hatch
// is html.raw(markup) for markup this codebase owns (renderSystemIcon output,
// a span another helper already built). null and undefined render as nothing,
// numbers and booleans render themselves (escapeHtml's `|| ""` would swallow
// a 0), and arrays flatten, so a list of fragments joins naturally. A plain
// string value - including another template's output - is escaped: compose
// with arrays or html.raw, never by interpolating a raw string.
function html(strings, ...values) {
  let out = "";
  strings.forEach((part, index) => {
    out += part;
    if (index < values.length) out += htmlValue(values[index]);
  });
  return out;
}

function htmlValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(htmlValue).join("");
  if (value && typeof value === "object" && typeof value.safeHtml === "string") return value.safeHtml;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return escapeHtml(value);
}

// The one way to hand html`` markup it should not escape.
html.raw = (markup) => ({ safeHtml: String(markup ?? "") });
