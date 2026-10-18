# AISystem6Intelligence

Helper the Node server runs: Apple's on-device model (FoundationModels, weak-linked) and MLX
models (ClioModelKit). The server keeps one long-lived `serve` process (spawned on the first
request, restarted after a crash); the one-shot commands stay for tools and tests. Its own package because MLX needs macOS 14 and Apple silicon
(`minos 14.0`); `../macos-webview` keeps its macOS 11 floor.

```sh
swift build -c release --package-path platform/macos/shell/macos-intelligence
```

Ship `.build/out/Products/Release/AISystem6Intelligence` together with the three `*.bundle`
directories next to it (`mlx-swift_Cmlx.bundle` holds `default.metallib`). Sign with the hardened
runtime; no entitlement is needed (verified: no JIT, no library-validation exception).

| Command | Output |
| --- | --- |
| `serve` | long-lived: NDJSON ops `chat` / `cancel` / `status` / `prewarm` / `unload` with request ids; MLX answers stream as `delta` lines (see `Serve.swift`) |
| `status` | FoundationModels availability (one JSON object) |
| `chat` (stdin JSON) | NDJSON `snapshot` / `done` / `error`; `"engine":"mlx","model":id` selects MLX |
| `mlx-catalog` | curated packs, install state, memory gate |
| `mlx-status` | whether any pack can run |
| `mlx-download <id> --consent <totalBytes>` | NDJSON `progress`, then `done` / `error` |

SIGTERM/SIGINT cancel and exit 143/130 without a `done` line (in `serve`, a `cancel` op stops one
request and the process stays). `serve` releases the weights after `CLIO_IDLE_UNLOAD_SECONDS`
(default 900) without a request and at once on memory pressure (warning: after the running
request; critical: stops it).

A request with `images` (local file paths) loads the pack's vision tower on demand (MLXVLM);
text requests read only the language tensors. Speed levers, each switchable for measurement
(`tooling/bench-device-model.mjs`): `CLIO_MLX_CACHE_LIMIT_MB`, `CLIO_MLX_PREFIX_CACHE`,
`CLIO_MLX_ROTATING_KV`, `CLIO_MLX_WIRED`, `CLIO_MLX_TEXT_ONLY_LOAD`, `CLIO_MLX_MTP`,
`CLIO_MLX_MTP_BLOCK`, `CLIO_MLX_PREFILL_STEP` (defaults in `MLXTuning`). Models live in
`~/Library/Application Support/AI System 6/ClioModels` (`CLIO_MODEL_ROOT` overrides).
