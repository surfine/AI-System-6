// The chart copy's context strip on the ordinary desk. One strip above the
// grid and, while a copy is open, one small panel to edit it and adopt it
// back. The engine, its history and its owner write-back stay ClioChart's own:
// this file only mounts the v5.1 strip over the real window and lends the
// copy session a place to be edited. It never covers the grid. The design lab
// fixture mounts its own shell; this stands aside whenever that is present.
(function () {
  "use strict";
  if (window.AISystem6ClioChartContext) return;

  let live = null;

  const fixtureActive = () => new URLSearchParams(location.search).has("fixture") || !!document.getElementById("cw3-mount");

  function attach() {
    if (live) return live;
    if (fixtureActive()) return null;
    const split = document.getElementById("clio-chart-split");
    const pane = split?.parentElement;
    if (!pane || !window.ClioWorksChart || !window.ClioWorksContextStrip || !window.ClioWorksUIModel) return null;
    const D = window.ClioWorksDOM;
    const U = window.ClioWorksComponents;
    const integration = window.ClioWorksChart.create(window);
    const adapter = integration.adapter;
    const report = (error) => window.setClioChartStatus?.(String(error?.message || error));

    // The kit's layout rules are scoped to .cw-native; the host only wraps the
    // strip and the panel, so the grid keeps its own pane and its interaction.
    const host = D.h("div", { class: "cw-root cw-native cw5-chart-host" });
    host.style.cssText = "block-size:auto;flex:none;";
    const anchor = D.h("div", { hidden: true });
    const panel = D.h("div", { class: "cw5-copy", hidden: true });
    host.append(anchor, panel);
    pane.insertBefore(host, split);

    const run = async (id) => {
      const context = adapter.getContext();
      const verdict = window.ClioWorksUIModel.commandState(id, context);
      if (!verdict.enabled) return { status: "blocked", code: verdict.code, message: verdict.reason };
      const result = await adapter.execute(id, { expectedContext: context });
      if (result?.status !== "ok" && result?.message) report(result.message);
      return result;
    };
    const strip = window.ClioWorksContextStrip.attachContextStrip({
      mounted: { editor: anchor, execute: run, captureSelection() {} },
      adapter,
      onError: report,
    });

    const input = (value, label, onChange) => {
      const field = D.h("input", { type: "text", "aria-label": label });
      field.value = value;
      field.addEventListener("change", () => onChange(field.value));
      return field;
    };
    // The draft grid is built once per open copy: rebuilding it on every
    // notification would destroy the field the writer just tabbed into.
    let adopt = null;
    let cancel = null;
    function buildPanel() {
      const table = adapter.frame.draftTable();
      const grid = D.h("table", { class: "clio-chart-grid" });
      if (table) {
        grid.append(D.h("thead", {}, D.h("tr", {}, [D.h("th", { text: table.labelColumn?.text || "" }), ...table.columns.map((c) => D.h("th", { text: c.text }))])));
        grid.append(D.h("tbody", {}, table.rows.map((row, r) => D.h("tr", {}, [
          D.h("td", {}, input(row.label, row.label, (value) => adapter.frame.edit({ kind: "set-label", row: r, value }))),
          ...row.cells.map((cell, c) => D.h("td", {}, input(cell.text, `${row.label} ${table.columns[c].text}`, (value) => adapter.frame.edit({ kind: "set-cell", row: r, column: c, value })))),
        ]))));
      }
      adopt = U.button({
        label: t("clio_chart_copy_adopt"), primary: true,
        onClick: async () => {
          const result = await adapter.frame.adopt();
          if (result?.status !== "ok") report(t("clio_chart_copy_failed", result?.code || ""));
        },
      });
      cancel = U.button({
        label: t("cancel"),
        onClick: async () => {
          const result = await settleAndCancel(adapter);
          if (result?.status !== "ok") report(t("clio_chart_copy_failed", result?.code || ""));
        },
      });
      panel.replaceChildren(
        D.h("p", { class: "cw5-copy-hint", text: t("clio_chart_copy_hint") }),
        D.h("div", { class: "cw5-copy-grid" }, grid),
        D.h("div", { class: "cw5-copy-actions" }, [adopt, cancel]),
      );
    }
    function renderPanel() {
      const snap = adapter.frame.snapshot();
      if (!snap || snap.state === "idle" || snap.state === "disposed") {
        panel.hidden = true;
        panel.replaceChildren();
        adopt = cancel = null;
        return;
      }
      // The draft exists only once the copy has opened; build when it arrives.
      if (!adopt || (!panel.querySelector("input") && adapter.frame.draftTable())) buildPanel();
      const busy = ["opening", "preparing", "committing", "reconciling"].includes(snap.state);
      adopt.disabled = busy || snap.state === "uncertain" || !snap.dirty;
      cancel.disabled = busy;
      panel.hidden = false;
    }
    const stopPanel = adapter.subscribe(renderPanel);
    renderPanel();

    live = {
      adapter,
      strip,
      frameOpen: () => (adapter.frame.snapshot()?.state || "idle") !== "idle",
      async dispose() {
        await settleAndCancel(adapter);
        stopPanel();
        strip.dispose();
        integration.dispose();
        host.remove();
        live = null;
      },
    };
    return live;
  }

  // An open copy must end before its table goes away. A commit in flight is
  // waited out; one whose outcome was lost is asked of the engine first, so a
  // refused discard never leaves the old copy able to land on a new table.
  async function settleAndCancel(adapter) {
    for (let i = 0; i < 100; i += 1) {
      const state = adapter.frame.snapshot()?.state || "idle";
      if (state === "idle" || state === "disposed") return { status: "ok" };
      if (state === "uncertain") {
        const settled = await adapter.frame.reconcile();
        if (settled?.status !== "ok") return settled;
      } else if (["opening", "preparing", "committing", "reconciling"].includes(state)) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      } else {
        return adapter.frame.cancel();
      }
    }
    return { status: "blocked", code: "COMMIT_BUSY" };
  }

  window.AISystem6ClioChartContext = {
    attach,
    detach: () => live?.dispose(),
    current: () => live,
    // A different table arrived: an open copy was made from the old one.
    async tableChanged() {
      if (live?.frameOpen()) {
        const ended = await settleAndCancel(live.adapter);
        if (ended?.status !== "ok") window.setClioChartStatus?.(t("clio_chart_copy_failed", ended?.code || ""));
      }
      return attach();
    },
  };
})();
