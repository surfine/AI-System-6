# The TinyJS macOS shell

Targets the complete macOS 15+ / Apple silicon application for AI System 6
1.0.58. The desk and the writing flow stay the desktop product's own; the app
keeps the original identity `local.aisystem6.beta.shell` so WebKit opens the
storage that is already there. Acceptance has to prove that old projects read,
that a full backup exports, and that a restore matches — an identical bundle id
on its own is not a migration claim. Overwriting the old WKWebView data
directory directly is forbidden; a separate export/import stays the recovery
path.

The controlled upstream is TinyJS v0.50.1 as `vendor/tinyjs/baselines.json`
records it. The upstream files stay byte-for-byte; `tooling/build-tinyjs-native.mjs`
generates the controlled extensions in the build directory — the hotkey
registration receipt, and the existing Time Machine browser and download
manager. The Vision helper is reused; the old Swift host is neither compiled nor
shipped.

The build uses the repository's pinned runtime and never reads a user's global
TinyJS installation:

```sh
AI_SYSTEM6_SOURCE_COMMIT="$(git rev-parse HEAD)" npm run build:app
node tooling/build-mac-server-payload.mjs
node tooling/build-tinyjs-shell-app.mjs --production --allow-adhoc --dmg
```

The complete `.app` carries the pinned Node, the server, the web resources, the
browser extension, the native helper and the product identity. The nested
Mach-O files are signed inside-out; the ZIP, DMG, SHA-256 and OTA manifest are
produced only after the bundle is sealed. A formal release uses the frozen
source and sealed artifacts of `release:prepare`.

The 1.0.58 OTA was published ad-hoc signed, so its first download went through
Gatekeeper's Open Anyway step. From shell 1.1.0 the app is Developer ID signed,
notarized and stapled (`signing.json` names the certificate SHA-1 and the
notarytool profile; credentials stay in the keychain). An ad-hoc 1.0.x install
may update to it, because the updater only binds the signing team once the
running app has one; later updates must keep the same team.

Updates check automatically and the writer's click on “Install and Restart”
performs them. Work is saved and new tasks are refused before the download;
model, import, export and native downloads defer an update while they run. An
independent Node worker verifies HTTPS, SHA-256, the package signature, the
application identity and the platform outside the app before it replaces it.
The new desk has to report its startup identity and a matching persistent-data
fingerprint before the old package is cleared; otherwise the old package is
restored. Transaction journals recover interrupted installs at startup.

Clipboard collection is off by default and only listens while the writer turns
it on; screenshot OCR, selections and clipboard text become candidate edits
first, and filing one asks which project it belongs to. Files are read only
through the opaque id the writer chose, and notification bodies never carry
material. A new model key is stored in the Keychain by the server; an old key is
removed from its original place only after the writer confirms it, the model
verifies it, and the Keychain reads it back.

This is source under implementation and acceptance. Compilation, contract tests
and real interaction with the complete application are different kinds of
evidence; release still needs the old-data migration, the OTA round trip and
recovery, the native permissions and the full sealed release gates — none of
which the build commands above can stand in for.
