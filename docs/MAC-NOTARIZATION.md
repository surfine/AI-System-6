# Mac Notarization Pipeline

AI System 6's macOS beta is currently **ad-hoc signed**: users Control-click →
Open, or the app is not accepted by Gatekeeper on a clean machine. The web
distribution (URL, Add to Home Screen, standalone, Share, persistent storage)
remains the primary product surface; notarization is a packaging milestone, not
a release blocker.

This document is the credential contract and the reproducible pipeline for
Developer ID signing, Hardened Runtime, notarization, and stapling. Nothing
here runs in the release gate: the local deterministic gate
(`npm run verify:ship`) is the source of truth, and a missing certificate must
never block a web release.

## Scope

- Apple silicon only, macOS 13+.
- No auto updater, no Sparkle, no App Store / sandbox migration, no Intel
  support in this milestone.

## Credential input contract

Set these in the environment of the signing machine. Never commit values:

| Variable | Required for | Example |
| --- | --- | --- |
| `AI_SYSTEM6_DEVELOPER_ID` | signing | `Developer ID Application: Aaron Lau (TEAMID1234)` |
| `AI_SYSTEM6_TEAM_ID` | notarization | `TEAMID1234` |
| `AI_SYSTEM6_NOTARY_KEY_ID` | notarization (API key) | `ABCDEFGHIJ` |
| `AI_SYSTEM6_NOTARY_ISSUER` | notarization (API key) | `69a6de7f-...` |
| `AI_SYSTEM6_NOTARY_KEY` | notarization (API key) | path or `.p8` contents |
| `AI_SYSTEM6_NOTARY_APPLE_ID` | notarization (Apple ID) | `dev@example.com` |
| `AI_SYSTEM6_NOTARY_APP_PASSWORD` | notarization (Apple ID) | app-specific password |

Prefer the App Store Connect API key over the Apple ID + app-specific password:
it does not rotate with the account password and works headless in CI.

## Run

```sh
# Sign with Hardened Runtime and verify (notarization NOT EXECUTED if
# credentials are absent — the script says so explicitly):
node scripts/sign-mac-app.mjs --app "dist/AI System 6.app"

# Full pipeline: sign -> codesign verify -> notarize -> staple -> spctl:
AI_SYSTEM6_DEVELOPER_ID="Developer ID Application: ..." \
AI_SYSTEM6_TEAM_ID="..." \
AI_SYSTEM6_NOTARY_KEY_ID="..." AI_SYSTEM6_NOTARY_ISSUER="..." \
AI_SYSTEM6_NOTARY_KEY="/path/to/AuthKey_XXXX.p8" \
node scripts/sign-mac-app.mjs --app "dist/AI System 6.app"
```

The script exits non-zero on any verification failure and prints
`NOT EXECUTED: ...` when credentials are unavailable — it never presents an
unsigned or unnotarized bundle as notarized.

## Manual verification

```sh
codesign --verify --deep --strict --verbose=2 "dist/AI System 6.app"
spctl --assess --type execute --verbose=4 "dist/AI System 6.app"
xcrun stapler validate "dist/AI System 6.app"
```

After a notarized build, download the app on a clean macOS 13+ Apple silicon
machine and double-click to launch — no Control-click. Until then, release
notes keep the ad-hoc caveat.
