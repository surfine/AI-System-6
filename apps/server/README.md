# apps/server/ — AI System 6 server source

This directory is now the canonical server source for the main app. The
root `npm start` command runs `node apps/server/server.js` after rebuilding the
browser bundle.

Older docs may describe `apps/server/` as a mirror rewrite that runs on a separate
port. That phase is over. Treat `apps/server/server.js`, `apps/server/server/router.js`,
`apps/server/server/routes/`, and `apps/server/server/importers/` as the active server
implementation unless `CLAUDE.md` says otherwise.

## Run

```sh
npm start
# default: http://localhost:4173
```

Override the port with `PORT=4280 npm start`. For server-only debugging,
`node apps/server/server.js` also works, but it does not rebuild `app.bundle.js`.

`apps/server/server/router.js` owns the route table and static file fallthrough.
Unknown routes return structured 404s.

## Layout

```
apps/server/
  server.js                Entry. Builds the route map and starts http.
  server/
    router.js              Dispatch table.
    lib/
      http.js              send, readJsonBody, requestSignal,
                           withTimeoutSignal.
      text.js              decodeHtml, stripTags, cleanText.
      build-info.js        Version + build-stamp resolution.
      fetch.js, proxy.js,
      local-urls.js,
      lmstudio-models.js,
      lms-cli.js,
      numbers.js, url.js   Shared server helpers.
    routes/
      *.js                 Focused route handlers for HTTP APIs.
    importers/
      *.js                 /api/import-text file-format handlers.
  tsconfig.json            allowJs + checkJs + noEmit. Type checking runs
                           through `npm --prefix src run typecheck`.
```

## Server contracts

- Preserve the UI, API, and browser persistence contracts documented in
  `CLAUDE.md`.
- No new runtime framework, no transpiler, no bundler.
- Keep one route file per HTTP endpoint where practical.
- Keep shared server logic in `apps/server/server/lib/` or the focused feature
  module (`chat.js`, `cloud.js`, `reader.js`, etc.), not in route files.
- Add JSDoc on public function signatures so `tsc --noEmit` catches
  contract drift.

## Non-goals

- Behavior changes. If you spot a behavior delta, it is a bug.
- Reordering or removing the System 6 product details documented in
  `CLAUDE.md`.
- Migrating client code into `apps/server/`. Browser code lives in root `app.js`
  plus `app/core/`, `app/features/`, `app/data/`, `app/content/`, and
  `app/vendor/`.
