import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packagePath = join(repoRoot, "platform", "macos", "shell", "macos-webview");
const packageManifestPath = join(repoRoot, "package.json");
const buildInfoPath = join(repoRoot, "build-info.json");
const generatedBuildInfoPath = join(repoRoot, "apps/desktop/app/generated/build-info.json");
const appDisplayName = process.env.AI_SYSTEM6_APP_DISPLAY_NAME || "AI System 6 Beta";
const appName = `${appDisplayName}.app`;
const legacyAppNames = ["AI System 6 Shell.app"];
const distDir = join(repoRoot, "dist");
const appDir = join(distDir, appName);
const contentsDir = join(appDir, "Contents");
const macOsDir = join(contentsDir, "MacOS");
const resourcesDir = join(contentsDir, "Resources");
const frameworksDir = join(contentsDir, "Frameworks");
const binaryName = "AISystem6Shell";
const iconName = "AppIcon";
const iconSource = join(repoRoot, "system.css-reference", "docs", "icon.png");
const builtBinary = process.env.AI_SYSTEM6_SHELL_BINARY
  ? resolve(repoRoot, process.env.AI_SYSTEM6_SHELL_BINARY)
  : join(packagePath, ".build", "debug", binaryName);
const appBinary = join(macOsDir, binaryName);
const args = process.argv.slice(2);
const serverArgIndex = args.indexOf("--server");
const explicitServerBinary = serverArgIndex >= 0 ? args[serverArgIndex + 1] : "";
const defaultServerBinary = join(distDir, "ai-system-6-macos-arm64");
const serverBinary = explicitServerBinary
  ? resolve(repoRoot, explicitServerBinary)
  : defaultServerBinary;
const skipSwiftBuild = process.env.AI_SYSTEM6_SKIP_SWIFT_BUILD === "1";
const allowStaleShell = process.env.AI_SYSTEM6_ALLOW_STALE_SHELL === "1";
const macosDeploymentTarget = process.env.AI_SYSTEM6_MACOS_DEPLOYMENT_TARGET || "13.0";
const macosTargetTriple = process.env.AI_SYSTEM6_MACOS_TARGET_TRIPLE || "";
const swiftCpu = process.env.AI_SYSTEM6_SWIFT_MCPU || "";
const embedSwiftRuntime = process.env.AI_SYSTEM6_EMBED_SWIFT_RUNTIME === "1";
const shellSourcesDir = join(packagePath, "Sources");
let packageVersion = "0.1.0";
let bundleBuild = "1";

// The generated identity (apps/desktop/app/generated/build-info.json) is the single
// source; package.json / build-info.json only backstop an unbuilt checkout.
let generatedBuildInfo = null;
try {
  generatedBuildInfo = JSON.parse(readFileSync(generatedBuildInfoPath, "utf8"));
} catch {
  generatedBuildInfo = null;
}

try {
  const manifest = JSON.parse(readFileSync(packageManifestPath, "utf8"));
  if (!generatedBuildInfo && typeof manifest.version === "string") {
    packageVersion = manifest.version;
  }
} catch {
  // keep default version if package.json is temporarily unavailable
}

try {
  const buildInfo = JSON.parse(readFileSync(buildInfoPath, "utf8"));
  if (!generatedBuildInfo && typeof buildInfo.build === "string") {
    bundleBuild = buildInfo.build;
  }
} catch {
  // keep default build marker if build-info.json is temporarily unavailable
}

if (generatedBuildInfo && typeof generatedBuildInfo.version === "string") {
  packageVersion = generatedBuildInfo.version;
}
if (generatedBuildInfo && typeof generatedBuildInfo.build === "string") {
  bundleBuild = generatedBuildInfo.build;
}

function buildIcon(resourcesDir) {
  if (!existsSync(iconSource)) {
    return false;
  }

  const iconsetDir = join(resourcesDir, `${iconName}.iconset`);
  rmSync(iconsetDir, { recursive: true, force: true });
  mkdirSync(iconsetDir, { recursive: true });

  const sizes = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ];

  try {
    for (const [fileName, size] of sizes) {
      execFileSync("/usr/bin/sips", ["-z", String(size), String(size), iconSource, "--out", join(iconsetDir, fileName)], {
        stdio: "ignore",
      });
    }

    execFileSync("/usr/bin/iconutil", ["-c", "icns", iconsetDir, "-o", join(resourcesDir, `${iconName}.icns`)], {
      stdio: "inherit",
    });
    return true;
  } catch {
    console.warn("Failed to generate AppIcon.icns, continuing without icon.");
    return false;
  } finally {
    rmSync(iconsetDir, { recursive: true, force: true });
  }
}

function newestSourceMtimeMs(dir) {
  let newest = 0;
  for (const relativePath of readdirSync(dir, { recursive: true })) {
    const fullPath = join(dir, String(relativePath));
    const stats = statSync(fullPath);
    if (stats.isFile() && stats.mtimeMs > newest) {
      newest = stats.mtimeMs;
    }
  }
  return newest;
}

function embedBackDeployedSwiftRuntime() {
  if (!embedSwiftRuntime) return;

  mkdirSync(frameworksDir, { recursive: true });
  const swiftCompiler = execFileSync("/usr/bin/xcrun", ["--find", "swiftc"], { encoding: "utf8" }).trim();
  const toolchainDir = dirname(dirname(dirname(swiftCompiler)));
  const backDeploymentConcurrency = join(
    toolchainDir,
    "usr",
    "lib",
    "swift-5.5",
    "macosx",
    "libswift_Concurrency.dylib"
  );
  const swiftConcurrency = join(frameworksDir, "libswift_Concurrency.dylib");
  if (!existsSync(backDeploymentConcurrency)) {
    throw new Error(`Missing back-deployed Swift concurrency runtime: ${backDeploymentConcurrency}`);
  }
  copyFileSync(backDeploymentConcurrency, swiftConcurrency);
  execFileSync("/usr/bin/lipo", [swiftConcurrency, "-verify_arch", "arm64"], { stdio: "inherit" });

  execFileSync(
    "/usr/bin/install_name_tool",
    [
      "-change",
      "@rpath/libswift_Concurrency.dylib",
      "@executable_path/../Frameworks/libswift_Concurrency.dylib",
      appBinary,
    ],
    { stdio: "inherit" }
  );
  execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", appDir], { stdio: "inherit" });
}

if (!skipSwiftBuild) {
  try {
    const swiftBuildArgs = ["swift", "build", "--package-path", packagePath];
    if (macosTargetTriple) {
      swiftBuildArgs.push("--triple", macosTargetTriple);
    }
    if (swiftCpu) {
      swiftBuildArgs.push("-Xswiftc", "-Xllvm", "-Xswiftc", `-mcpu=${swiftCpu}`);
    }
    execFileSync("/usr/bin/xcrun", swiftBuildArgs, {
      cwd: repoRoot,
      stdio: "inherit",
    });
  } catch (error) {
    if (!existsSync(builtBinary)) {
      throw error;
    }
    const binaryIsStale = statSync(builtBinary).mtimeMs < newestSourceMtimeMs(shellSourcesDir);
    if (binaryIsStale && !allowStaleShell) {
      console.error(`swift build failed and ${builtBinary} is older than the newest file under ${shellSourcesDir}.`);
      console.error("Refusing to package a stale shell binary. Fix the swift build, or set AI_SYSTEM6_ALLOW_STALE_SHELL=1 to package it anyway.");
      throw error;
    }
    if (binaryIsStale) {
      console.warn("AI_SYSTEM6_ALLOW_STALE_SHELL=1: swift build failed; packaging stale shell binary despite newer sources.");
    } else {
      console.warn("swift build was blocked, reusing existing shell binary (no newer sources detected).");
    }
    console.warn(`Using existing binary: ${builtBinary}`);
  }
} else {
  console.warn("AI_SYSTEM6_SKIP_SWIFT_BUILD=1, skipping swift build.");
}

if (!existsSync(builtBinary)) {
  throw new Error(`Missing built shell binary: ${builtBinary}`);
}

rmSync(appDir, { recursive: true, force: true });
for (const legacyAppName of legacyAppNames) {
  rmSync(join(distDir, legacyAppName), { recursive: true, force: true });
}
mkdirSync(macOsDir, { recursive: true });
mkdirSync(resourcesDir, { recursive: true });
copyFileSync(builtBinary, appBinary);
const hasIcon = buildIcon(resourcesDir);
if (existsSync(serverBinary)) {
  const bundledServer = join(resourcesDir, "ai-system-6-server");
  copyFileSync(serverBinary, bundledServer);
  execFileSync("/bin/chmod", ["755", bundledServer]);
  console.log(`Bundled server: ${serverBinary}`);
} else {
  console.warn(`No bundled server found at ${serverBinary}; app will fall back to npm start from the repo.`);
}

writeFileSync(
  join(contentsDir, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>${binaryName}</string>
  ${hasIcon ? `<key>CFBundleIconFile</key>
  <string>${iconName}</string>` : ""}
  <key>CFBundleIdentifier</key>
  <string>local.aisystem6.beta.shell</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${appDisplayName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${packageVersion}</string>
  <key>CFBundleVersion</key>
  <string>${bundleBuild}</string>
  <key>LSMinimumSystemVersion</key>
  <string>${macosDeploymentTarget}</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`
);

writeFileSync(join(contentsDir, "PkgInfo"), "APPL????");
writeFileSync(
  join(resourcesDir, "README.txt"),
  [
    appDisplayName,
    "",
    "This is a minimal macOS app shell for the current web beta.",
    existsSync(serverBinary)
      ? "It starts the bundled AI System 6 server and opens http://localhost:4173 in WKWebView."
      : "It starts npm from the repository root and opens http://localhost:4173 in WKWebView.",
    "It is a bridge, not the final Swift-native app.",
  ].join("\n")
);

embedBackDeployedSwiftRuntime();

console.log(`Built ${appDir}`);
console.log(`Run: open ${JSON.stringify(appDir)}`);
