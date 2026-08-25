// One language switch for the official site's generated and interactive copy.
// The HTML pages carry their own crawlable prose; JavaScript reads the page
// language so status, captions, balloons, and generated controls match it.

export const siteLanguage = document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
export const isZh = siteLanguage === "zh-CN";

export function L(en, zh) {
  return isZh ? zh : en;
}

export function formatNumber(value) {
  return Number(value).toLocaleString(isZh ? "zh-CN" : "en-US");
}
