// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "AISystem6MacShell",
  platforms: [
    .macOS(.v11),
  ],
  products: [
    .executable(name: "AISystem6Shell", targets: ["AISystem6Shell"]),
    .executable(name: "AISystem6Vision", targets: ["AISystem6Vision"]),
  ],
  targets: [
    .executableTarget(
      name: "AISystem6Shell",
      path: "Sources/AISystem6Shell"
    ),
    // Document recognition for the server's OCR ladder (macOS 26 Vision).
    .executableTarget(
      name: "AISystem6Vision",
      path: "Sources/AISystem6Vision"
    ),
  ]
)
