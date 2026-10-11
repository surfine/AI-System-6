// Controlled native extensions to the pinned upstream launcher. Upstream
// sources and their baseline remain byte-for-byte intact.
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function extendLauncher(source) {
  function replace(before, after) {
    if (source.split(before).length !== 2) throw new Error("TinyJS native patch anchor changed: " + before.slice(0, 60));
    source = source.replace(before, after);
  }
  replace('#include "webview.h"', '#include "webview.h"\n#include <dlfcn.h>');
  replace('static void sock_read_loop() {', 'static void do_download_cancel(webview_t, void *);\nstatic void do_download_freeze(webview_t, void *);\nstatic void do_preview_pick(webview_t, void *);\nstatic void sock_read_loop() {');
  replace('      } else if (line.rfind("HKREG ", 0) == 0) {', `      } else if (line.rfind("DLCANCEL ", 0) == 0) {
        std::string rest = line.substr(9);
        size_t sp = rest.find(' ');
        if (sp != std::string::npos) webview_dispatch(g_w, do_download_cancel,
          new std::pair<std::string, std::string>(rest.substr(0, sp), rest.substr(sp + 1)));
      } else if (line.rfind("DLFREEZE ", 0) == 0) {
        std::string rest = line.substr(9);
        size_t sp = rest.find(' ');
        if (sp != std::string::npos) webview_dispatch(g_w, do_download_freeze,
          new std::pair<std::string, std::string>(rest.substr(0, sp), rest.substr(sp + 1)));
      } else if (line.rfind("PREVIEWPICK ", 0) == 0) {
        webview_dispatch(g_w, do_preview_pick, new std::string(line.substr(12)));
      } else if (line.rfind("HKREG ", 0) == 0) {`);
  replace("std::string id, combo; // combo empty = unregister", "std::string id, combo; // combo empty = unregister\n  std::string qid; // optional acknowledged registration");
  replace("  if (!req->combo.empty()) {\n    UInt32 mods = 0;", "  bool registered = req->combo.empty();\n  OSStatus registrationStatus = paramErr;\n  if (!req->combo.empty()) {\n    UInt32 mods = 0;");
  replace("      if (RegisterEventHotKey((UInt32)code, mods, hkid,\n                              GetApplicationEventTarget(), 0, &ref) == noErr) {", "      registrationStatus = RegisterEventHotKey((UInt32)code, mods, hkid,\n                              GetApplicationEventTarget(), 0, &ref);\n      if (registrationStatus == noErr) {\n        registered = true;");
  replace("  delete req;\n}\n#else\nstatic void do_hotkey", "  if (!req->qid.empty()) sock_write_line(\"GOT \" + req->qid +\n    \" {\\\"ok\\\":\" + (registered ? \"true\" : \"false\") +\n    \",\\\"code\\\":\" + std::to_string(registrationStatus) + \"}\");\n  delete req;\n}\n#else\nstatic void do_hotkey");
  replace('      } else if (line.rfind("HKREG ", 0) == 0) {', `      } else if (line.rfind("HKREGISTER ", 0) == 0) {
        std::string rest = line.substr(11);
        size_t sp = rest.find(' ');
        if (sp != std::string::npos) {
          std::vector<std::string> p = split_tabs(rest.substr(sp + 1));
          if (p.size() >= 2) webview_dispatch(g_w, do_hotkey,
            new HotkeyReq{p[0], p[1], rest.substr(0, sp)});
          else sock_write_line("GOT " + rest.substr(0, sp) + " {\\\"ok\\\":false,\\\"code\\\":-50}");
        }
      } else if (line.rfind("HKREG ", 0) == 0) {`);
  replace('      attach_tiny_bridge(mwv.configuration.userContentController, "main");', `      attach_tiny_bridge(mwv.configuration.userContentController, "main");
      // Existing Time Machine engine, independent of the retired Swift main.
      NSString *resourceRoot = [[[NSBundle mainBundle] bundlePath]
          stringByAppendingPathComponent:@"Contents/Resources"];
      void *browserLibrary = dlopen([[resourceRoot stringByAppendingPathComponent:
          @"libAISystem6Browser.dylib"] fileSystemRepresentation], RTLD_NOW | RTLD_LOCAL);
      if (browserLibrary) {
        using BrowserInstall = void (*)(void *, void *, void *, const char *);
        auto install = (BrowserInstall)dlsym(browserLibrary, "AISystem6InstallBrowser");
        if (install) install((__bridge void *)mwv, (__bridge void *)mwv.superview,
          (__bridge void *)mwv.window, [[resourceRoot stringByAppendingPathComponent:
          @"ubol-safari.zip"] fileSystemRepresentation]);
      }`);
  replace('static TinyWebDelegate *g_web_delegate = nil;', `static void do_preview_pick(webview_t, void *arg) {
  auto *request = static_cast<std::string *>(arg);
  std::string qid = *request;
  delete request;
  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.canChooseFiles = YES;
  panel.canChooseDirectories = NO;
  panel.allowsMultipleSelection = NO;
  panel.title = @"Quick Look";
  [NSApp activateIgnoringOtherApps:YES];
  void (^finish)(NSModalResponse) = ^(NSModalResponse response) {
    NSString *selected = response == NSModalResponseOK ? panel.URL.path : nil;
    sock_write_line("GOT " + qid + " " + (selected ? json_escape([selected UTF8String]) : "null"));
  };
  if (NSApp.mainWindow) [panel beginSheetModalForWindow:NSApp.mainWindow completionHandler:finish];
  else [panel beginWithCompletionHandler:finish];
}
static void do_download_cancel(webview_t, void *arg) {
  auto *request = static_cast<std::pair<std::string, std::string> *>(arg);
  bool found = false;
  for (const auto &entry : g_downloads) {
    if (std::to_string(entry.second.id) != request->second) continue;
    found = true;
    WKDownload *download = (__bridge WKDownload *)entry.first;
    [download cancel:^(NSData *) {}];
    break;
  }
  sock_write_line("GOT " + request->first + (found ? " true" : " false"));
  delete request;
}
static void do_download_freeze(webview_t, void *arg) {
  auto *request = static_cast<std::pair<std::string, std::string> *>(arg);
  bool freezing = request->second == "1";
  bool accepted = !freezing || g_downloads.empty();
  if (accepted) g_downloads_frozen = freezing;
  sock_write_line("GOT " + request->first + (accepted ? " true" : " false"));
  delete request;
}
static TinyWebDelegate *g_web_delegate = nil;`);
  replace('static long g_download_seq = 0;', 'static long g_download_seq = 0;\nstatic bool g_downloads_frozen = false;');
  replace('    if (mode == "deny") {', '    if (mode == "deny" || g_downloads_frozen) {');
  replace('                      it->second.path, "failed", d ? d : "");', '                      it->second.path, error.code == NSURLErrorCancelled ? "cancelled" : "failed", d ? d : "");');
  return source;
}

export function extendBridge(source) {
  const before = 'register(hid, combo) { send(\'HKREG \' + one(hid) + \'\\t\' + one(combo)); }';
  if (source.split(before).length !== 2) throw new Error("TinyJS hotkey bridge patch anchor changed");
  source = source.replace(before, `async register(hid, combo) {
        const result = await ask('HKREGISTER', one(hid) + '\t' + one(combo));
        if (!result?.ok) throw new Error('Shortcut is unavailable (' + result?.code + ')');
        return true;
      }`);
  const anchor = '    hotkey: {';
  if (source.split(anchor).length !== 2) throw new Error("TinyJS download bridge patch anchor changed");
  return source.replace(anchor, "    choosePreviewFile: () => ask('PREVIEWPICK'),\n    cancelDownload: (id) => ask('DLCANCEL', one(String(id))),\n    freezeDownloads: (frozen) => ask('DLFREEZE', frozen ? '1' : '0'),\n" + anchor);
}

export function buildNative(output) {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Native TinyJS build requires arm64 macOS");
  const vendor = resolve("vendor/tinyjs"), stage = join(output, "source");
  mkdirSync(stage, { recursive: true }); mkdirSync(output, { recursive: true });
  cpSync(join(vendor, "native/include"), join(stage, "include"), { recursive: true });
  writeFileSync(join(stage, "launcher.cc"), extendLauncher(readFileSync(join(vendor, "native/launcher-macos.cc"), "utf8")));
  const client = readFileSync(join(vendor, "runtime/tiny.js"), "utf8");
  if (client.includes(")TINYJS")) throw new Error("Client raw-string delimiter collision");
  writeFileSync(join(stage, "tiny_client.h"), 'static const char TINY_CLIENT_JS[] = R"TINYJS(' + client + ')TINYJS";\n');
  const frameworks = ["WebKit", "AppKit", "Carbon", "UserNotifications", "AVFoundation", "ServiceManagement", "IOKit", "Quartz", "Vision", "QuickLookThumbnailing", "Security", "LocalAuthentication", "MediaPlayer", "CoreMedia", "CoreWLAN", "CoreAudio", "AudioToolbox", "UniformTypeIdentifiers"];
  execFileSync("/usr/bin/clang++", ["-std=c++17", "-x", "objective-c++", "-mmacosx-version-min=15.0", "-arch", "arm64", "-isystem", join(stage, "include"), "-I", stage,
    join(stage, "launcher.cc"), "-o", join(output, "launcher"), ...frameworks.flatMap((f) => ["-framework", f]), "-weak_framework", "ScreenCaptureKit", "-ldl"], { stdio: "inherit" });
  let browserSource = readFileSync(resolve("platform/macos/shell/macos-webview/Sources/AISystem6Shell/TimeMachineBrowser.swift"), "utf8");
  function browserReplace(before, after) {
    if (browserSource.split(before).length !== 2) throw new Error("Browser native patch anchor changed: " + before.slice(0, 60));
    browserSource = browserSource.replace(before, after);
  }
  browserReplace('  private var activeTab = ""', '  private var activeTab = ""\n  private var updateFrozen = false\n  private var frozenVisibility: [String: Bool] = [:]');
  browserReplace('    let tab = String((body["tab"] as? String ?? "").prefix(80))', `    guard !updateFrozen || method == "updateFreeze" else {
      replyHandler(nil, "update-in-progress"); return
    }
    let tab = String((body["tab"] as? String ?? "").prefix(80))`);
  browserReplace('    case "clearData":', `    case "updateFreeze":
      let frozen = body["frozen"] as? Bool ?? false
      if frozen && NativeDownloads.shared.hasActiveDownloads { replyHandler(false, nil); return }
      if frozen && !updateFrozen {
        frozenVisibility = tabs.mapValues { $0.container.isHidden }
        for live in tabs.values { live.container.isHidden = true }
      } else if !frozen && updateFrozen {
        for (id, hidden) in frozenVisibility { tabs[id]?.container.isHidden = hidden }
        frozenVisibility.removeAll()
      }
      updateFrozen = frozen
      replyHandler(true, nil)
    case "clearData":`);
  browserReplace("  // MARK: Ad blocking", `  func requestDownload(url: URL) {
    guard !updateFrozen else { return }
    NativeDownloads.shared.start(url) { [weak self] event in
      self?.send(["type": "download"].merging(event) { _, value in value })
    }
  }

  // MARK: Ad blocking`);
  browserReplace('    case "clearData":', `    case "downloadCancel":
      replyHandler(NativeDownloads.shared.cancel(body["id"] as? String ?? ""), nil)
    case "downloadReveal":
      replyHandler(NativeDownloads.shared.reveal(body["id"] as? String ?? ""), nil)
    case "clearData":`);
  browserReplace('    if action.shouldPerformDownload {\n      NSWorkspace.shared.open(url)',
    '    if action.shouldPerformDownload {\n      browser?.requestDownload(url: url)');
  browserReplace('if let url = response.response.url { NSWorkspace.shared.open(url) }',
    'if let url = response.response.url { browser?.requestDownload(url: url) }');
  writeFileSync(join(stage, "TimeMachineBrowser.swift"), browserSource);
  execFileSync("/usr/bin/swiftc", ["-swift-version", "5", "-emit-library", "-target", "arm64-apple-macos15.0", "-module-name", "AISystem6Browser",
    resolve("platform/macos/tinyjs/native/BrowserBridge.swift"),
    join(stage, "TimeMachineBrowser.swift"),
    resolve("platform/macos/tinyjs/native/Downloads.swift"),
    "-Xlinker", "-install_name", "-Xlinker", "@rpath/libAISystem6Browser.dylib",
    "-o", join(output, "libAISystem6Browser.dylib")], { stdio: "inherit" });
  writeFileSync(join(output, "bridge.js"), extendBridge(readFileSync(join(vendor, "runtime/bridge.js"), "utf8")));
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--help")) console.log("Build controlled TinyJS native extensions: --output <directory>");
  else {
    const index = process.argv.indexOf("--output");
    buildNative(resolve(index >= 0 ? process.argv[index + 1] : "dist/tinyjs-native"));
  }
}
