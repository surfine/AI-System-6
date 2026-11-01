// swift-tools-version: 6.2

import PackageDescription

// Its own package because MLX needs macOS 14 and Apple silicon, while the WKWebView shell and
// the Vision helper in ../macos-webview keep their macOS 11 floor (SwiftPM platforms are
// per package). The helper itself still starts on macOS 14 and 15: FoundationModels is
// weak-linked and reports {"available":false,...} where it is missing.
let package = Package(
  name: "AISystem6Intelligence",
  platforms: [
    .macOS(.v14),
  ],
  products: [
    .executable(name: "AISystem6Intelligence", targets: ["AISystem6Intelligence"]),
  ],
  dependencies: [
    .package(path: "../../../apple/ClioModelKit"),
  ],
  targets: [
    // Apple's on-device language model (FoundationModels, macOS 26+) and MLX models through
    // ClioModelKit. The FoundationModels framework is weak-linked.
    .executableTarget(
      name: "AISystem6Intelligence",
      dependencies: [
        .product(name: "ClioModelKit", package: "ClioModelKit"),
      ],
      path: "Sources/AISystem6Intelligence",
      linkerSettings: [
        .unsafeFlags(["-Xlinker", "-weak_framework", "-Xlinker", "FoundationModels"]),
      ]
    ),
  ]
)
