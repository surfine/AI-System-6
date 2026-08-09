# Release Smoke Checklist

The pre-release smoke is a short, human, few-minute pass to catch obvious UI
regressions before shipping. It is intentionally **not** automated: the
release condition is the fast local gate (`npm run verify:ship`), and this
checklist is the eyeball layer on top of it. Do not turn it into a browser
E2E suite.

## Completion paths

Record elapsed time, blocking pages, and moments that required developer
explanation. These are manual paths; do not automate them as E2E tests.

### A. Fresh Web

- [ ] Clear site data and open the URL without reading documentation.
- [ ] From Start Here, choose Write a Short Draft.
- [ ] With no mounted project, choose New Project once and land back in Draft Desk with the first writing field focused.
- [ ] Enter three lines of material, write or generate a body, save it, and Download Markdown.
- [ ] Record total steps, modal count, explanation count, and elapsed time. Target: zero developer explanations and no more than one required setup surface.

### B. No model

- [ ] Disconnect every model, open Draft Desk, handwrite, save, reload, continue, and download Markdown.
- [ ] Confirm the full path works without opening Control Panel.

### C. Broken model

- [ ] Save a missing local model or invalid cloud configuration, then reload.
- [ ] Confirm the desktop becomes ready, projects and non-AI apps work, and Reset AI Connection repairs only model settings.

### D. iPhone Web

- [ ] In iPhone Safari, open Draft Desk, write, save, reload, and Share.
- [ ] Use Share → Add to Home Screen, launch from the icon, and repeat the basic writing path.

## Regression checklist

- [ ] Launch AI System 6 and the desktop boots to the Finder.
- [ ] Create a Project Hard Disk (or mount an existing one).
- [ ] Open 钟点稿 / Quick Draft.
- [ ] Type a title, a "what I want to say" line, and a little material.
- [ ] Save; the status bar shows Saved.
- [ ] Turn on one Adjustment Layer and set a strength.
- [ ] Protect a paragraph, then Preview (Apply) a composite.
- [ ] Develop the composite into the body; the previous body appears under
      Versions and can be restored.
- [ ] Save to Project Hard Disk; open the saved document and confirm the body.
- [ ] Reload the page; the draft, view, layer stack, protect ranges, selection,
      and scroll position come back.
- [ ] Project CD and TeachText basics still open and work.

Anything that breaks here is a release blocker for a human reason (visible
regression), not a flaky-automation reason. If a step needs a long setup or a
model, note it and keep the pass under a few minutes.
