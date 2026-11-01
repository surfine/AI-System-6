// Loaded with `node --import` by `build-dsh-slim.mjs --trace`: records every
// file: URL the dsh process resolves (require and import alike) so the slim
// install keeps exactly the packages the ClioTalk engine profile mounts.
import { registerHooks } from "node:module";
import { appendFileSync } from "node:fs";

const out = process.env.AIS6_TRACE_FILE;
registerHooks({
  resolve(spec, ctx, next) {
    const resolved = next(spec, ctx);
    if (out && resolved && typeof resolved.url === "string" && resolved.url.startsWith("file:")) {
      appendFileSync(out, `${resolved.url}\n`);
    }
    return resolved;
  },
});
