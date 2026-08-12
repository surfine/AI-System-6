# AI System 6 macOS Shell

This is an honest macOS shell for the current AI System 6 web beta. It is not
the final Swift-native app and should not become the native product strategy.

Use it when you want a lower-friction desktop entry point while the web product
is still canonical.

## Run

```sh
npm run shell:mac
```

This starts `npm start` from the repository root and opens
`http://localhost:4173` in a WKWebView window.

If the server is already running:

```sh
npm run shell:mac:no-server
```

## Build `.app`

```sh
npm run bundle:mac-arm64
open "dist/AI System 6 Beta.app"
```

`bundle:mac-arm64` builds the packaged Node server, then embeds it in the app
as `Contents/Resources/ai-system-6-server`.

For shell-only development without a bundled server:

```sh
npm run shell:mac:app
```

When no bundled server is present, the generated app falls back to starting
`npm start` from the repository root.

## Boundary

- Keep the web app as the source of truth.
- Do not add product-only object model changes here.
- Do not treat this WKWebView shell as the final native app.
- Use this shell to improve launch feel, packaging experiments, and desktop
  ergonomics while native Swift work remains separate.
