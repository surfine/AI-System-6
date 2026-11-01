// Fetch the pinned uBlock Origin Lite release (see vendor/ubol/PIN.json):
// download both builds, check their SHA-256, unpack them into
// .cache/ubol/<version>/{chromium,safari}. An unpacked, already-verified
// release is left alone, so this is cheap to run before every build.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pin = JSON.parse(readFileSync(join(root, "vendor/ubol/PIN.json"), "utf8"));
const cacheDir = join(root, ".cache", "ubol", pin.version);

async function fetchVerified(build) {
  const target = join(cacheDir, build);
  const stamp = join(target, ".verified");
  if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === pin[build].sha256) {
    console.log(`uBOL ${pin.version} ${build}: already verified`);
    return;
  }
  const url = `https://github.com/uBlockOrigin/uBOL-home/releases/download/${pin.version}/${pin[build].asset}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== pin[build].sha256) {
    throw new Error(`${pin[build].asset}: SHA-256 ${digest} does not match the pinned ${pin[build].sha256}`);
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const zipPath = join(cacheDir, pin[build].asset);
  writeFileSync(zipPath, bytes);
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", target]);
  rmSync(zipPath, { force: true });
  writeFileSync(stamp, `${digest}\n`);
  console.log(`uBOL ${pin.version} ${build}: verified and unpacked`);
}

for (const build of ["chromium", "safari"]) {
  await fetchVerified(build);
}
