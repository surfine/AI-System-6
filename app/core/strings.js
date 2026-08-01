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
