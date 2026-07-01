// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "AISystem6MacShell",
  platforms: [
    .macOS(.v13),
  ],
  products: [
    .executable(name: "AISystem6Shell", targets: ["AISystem6Shell"]),
  ],
  targets: [
    .executableTarget(
      name: "AISystem6Shell",
      path: "Sources/AISystem6Shell"
    ),
  ]
)
