// ClioChart print contract: a fixture sheet paginated on the grid's own geometry.
// Page count and page content at a given scale, the repeated header row, the
// sheet-name header and the page-number footer, in both languages.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { makeContext, loadScripts } from "../fixtures/clioworks-s11/vm-context.mjs";

const test = createFeatureTest("clioworks-chart-print");

const ctx = makeContext();
ctx.currentLanguage = "en";
loadScripts(ctx, ["app/data/translations-en.js", "app/data/translations-zh.js"]);
ctx.t = (key, ...args) => {
  const value = ctx.AISystem6TranslationsEn[key];
  return typeof value === "function" ? value(...args) : value == null ? key : value;
};
loadScripts(ctx, ["app/features/clio-chart-workbook-tools.js"]);
const T = ctx.AISystem6ClioChartWorkbookTools;

// 100 rows x 12 columns; row 0 is the header row.
const spec = {
  sheet: "Sales",
  area: { r1: 0, c1: 0, r2: 99, c2: 11 },
  cell: (r, c) => ({ text: r === 0 ? `H${c}` : `r${r}c${c}`, numeric: false }),
};

const fit = T.printPlan(spec, { scale: "fit" });
test.assert(fit.colPages === 1 && fit.rowPages === 2 && fit.pages.length === 2, `fit to width: one column page, two row pages (${fit.pages.length})`);
test.assert(fit.scale < 0.6 && fit.pages[0].rows[0].length === 12, "fit shrinks all twelve columns onto one page width");

const full = T.printPlan(spec, { scale: "percent", percent: 100, orientation: "landscape" });
test.assert(full.colPages === 2 && full.rowPages === 4 && full.pages.length === 8, `100% landscape: 2 x 4 pages (${full.pages.length})`);
test.assert(full.pages[0].rows[0].length === 9 && full.pages[4].rows[0].length === 3, "columns break at nine, then the remaining three (pages run down first, as in Excel)");
test.assert(full.pages[1].rows[0][0].text === "r29c0", `the second row page starts at row 29 (${full.pages[1].rows[0][0].text})`);

const repeated = T.printPlan(spec, { scale: "percent", percent: 100, orientation: "landscape", repeatHeader: true });
test.assert(repeated.rowPages === 4 && repeated.pages.length === 8, "repeating the header keeps four row pages here");
test.assert(repeated.pages[1].rows[0][0].text === "H0" && repeated.pages[1].rows[1][0].text === "r29c0", "later row pages open with the repeated header row");
test.assert(repeated.pages[0].rows[0][0].text === "H0" && !repeated.pages[0].repeatedHeader, "the first page carries the header row once");

const last = repeated.pages[repeated.pages.length - 1];
test.assert(last.header === "Sales" && last.footer === "Page 8 of 8", `header names the sheet, footer numbers the page (${last.header} / ${last.footer})`);
const bare = T.printPlan(spec, { headerFooter: false });
test.assert(bare.pages[0].header === "" && bare.pages[0].footer === "", "header and footer can be switched off");

const sel = T.printPlan({ ...spec, area: { r1: 2, c1: 1, r2: 4, c2: 3 } }, { scale: "fit" });
test.assert(sel.pages.length === 1 && sel.pages[0].rows.length === 3 && sel.pages[0].rows[0][0].text === "r2c1", "a selection prints only its own cells");

for (const lang of ["AISystem6TranslationsEn", "AISystem6TranslationsZh"]) {
  const table = ctx[lang];
  const keys = ["cmd_page_setup", "cmd_print", "area_used", "area_selection", "scale_fit", "scale_percent", "portrait", "landscape", "repeat_header", "header_footer", "page_of", "note"];
  test.assert(keys.every((k) => table[`clio_chart_print_${k}`]), `${lang} has every print string`);
}

test.finish();
